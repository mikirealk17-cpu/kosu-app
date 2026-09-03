import { supabase } from './supabaseClient.js'
import {
  ACTIVE_COMPANY_STORAGE_KEY,
  chooseActiveCompany,
  isAdminRole,
  isCompanyAdminRole,
  isMissingMultiCompanyFunctionError
} from './company-context.mjs'

export const ROLES = {
  ADMIN: 'system_admin',
  COMPANY_ADMIN: 'company_admin',
  WORKER: 'worker'
}

const LOGIN_PAGE = 'login.html'
const WORKER_BLOCKED_HREFS = [
  'admin.html',
  'workers.html',
  'work-types.html',
  'seibans.html',
  'rates.html',
  'billing-companies.html',
  'companies.html',
  'company-users.html'
]

export async function requireAuth(allowedRoles = [ROLES.ADMIN, ROLES.COMPANY_ADMIN, ROLES.WORKER]) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const session = sessionData?.session

  if (sessionError || !session) {
    return redirectToLogin('login_required')
  }

  const profile = await loadUserProfile(session.user.id)
  if (!profile) {
    renderAccessMessage({
      title: '権限設定がありません',
      text: 'ログインはできていますが、このユーザーに工数アプリの権限が設定されていません。管理者に user_profiles の設定を依頼してください。'
    })
    return stopPage()
  }

  if (profile.role === ROLES.WORKER && !profile.worker_id) {
    renderAccessMessage({
      title: '作業者が紐づいていません',
      text: '作業者権限には worker_id の設定が必要です。管理者に user_profiles の設定を依頼してください。'
    })
    return stopPage()
  }

  if (!allowedRoles.includes(profile.role)) {
    renderAccessMessage({
      title: 'この画面を開く権限がありません',
      text: profile.role === ROLES.WORKER
        ? '作業者は工数入力、自分の履歴確認、自分の集計だけ利用できます。'
        : 'このユーザーには、この画面を開く権限がありません。'
    })
    return stopPage()
  }

  const companyContext = await loadCompanyContext(profile)

  if (companyContext.error) {
    renderAccessMessage({
      title: '会社情報を確認できません',
      text: '通信または権限の確認に失敗しました。時間を置いて再読み込みしてください。'
    })
    return stopPage()
  }

  if (companyContext.enabled && profile.role !== ROLES.ADMIN && !profile.company_id) {
    renderAccessMessage({
      title: '所属会社が設定されていません',
      text: 'このユーザーには会社の設定が必要です。管理者に user_profiles の company_id 設定を依頼してください。'
    })
    return stopPage()
  }

  if (companyContext.enabled && profile.role !== ROLES.ADMIN && !companyContext.activeCompany) {
    renderAccessMessage({
      title: 'この会社は現在利用できません',
      text: '所属会社の利用が停止されているか、会社情報を確認できません。システム管理者に連絡してください。'
    })
    return stopPage()
  }

  const currentPage = location.pathname.split('/').pop() || 'index.html'
  if (companyContext.enabled && profile.role === ROLES.ADMIN && !companyContext.activeCompany && currentPage !== 'companies.html') {
    renderAccessMessage({
      title: '操作する会社がありません',
      text: '先に会社管理画面で利用会社を登録してください。'
    })
    return stopPage()
  }

  if (companyContext.enabled && profile.role === ROLES.WORKER && !companyContext.workerActive) {
    renderAccessMessage({
      title: 'この作業者は現在利用できません',
      text: '作業者の利用が停止されています。会社管理者に連絡してください。'
    })
    return stopPage()
  }

  applyRoleNavigation(profile)
  renderAuthBar(profile, session.user.email, companyContext)

  return {
    session,
    profile,
    isAdmin: isAdminRole(profile.role),
    isSystemAdmin: profile.role === ROLES.ADMIN,
    isCompanyAdmin: isCompanyAdminRole(profile.role),
    isWorker: profile.role === ROLES.WORKER,
    multiCompanyEnabled: companyContext.enabled,
    companyId: companyContext.activeCompany?.id || profile.company_id || null,
    company: companyContext.activeCompany || null,
    companies: companyContext.companies
  }
}

export async function loadUserProfile(authUserId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select(`
      id,
      auth_user_id,
      worker_id,
      company_id,
      role,
      is_active
    `)
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) {
    console.error('ユーザー権限の取得に失敗しました', error)
    return null
  }

  return data
}

export function getRoleLabel(role) {
  if (role === ROLES.ADMIN) return 'システム管理者'
  if (role === ROLES.COMPANY_ADMIN) return '会社管理者'
  if (role === ROLES.WORKER) return '作業者'
  return '権限未設定'
}

export async function signOut() {
  await supabase.auth.signOut()
  location.href = LOGIN_PAGE
}

function redirectToLogin(reason) {
  const current = `${location.pathname.split('/').pop() || 'index.html'}${location.search || ''}`
  location.href = `${LOGIN_PAGE}?reason=${encodeURIComponent(reason)}&redirect=${encodeURIComponent(current)}`
  return stopPage()
}

function stopPage() {
  return new Promise(() => {})
}

function applyRoleNavigation(profile) {
  document.body.classList.add(`role-${profile.role}`)

  if (profile.role !== ROLES.ADMIN) {
    document.querySelectorAll('.system-admin-only').forEach(element => {
      element.hidden = true
      element.classList.add('is-hidden')
    })
  }

  if (profile.role !== ROLES.WORKER) return

  document.querySelectorAll('.page-links a').forEach(link => {
    const href = link.getAttribute('href') || ''
    if (WORKER_BLOCKED_HREFS.some(blocked => href.includes(blocked))) {
      link.hidden = true
      link.classList.add('is-hidden')
      link.setAttribute('aria-hidden', 'true')
    }
  })
}

async function loadCompanyContext(profile) {
  const readyResult = await supabase.rpc('multi_company_ready')
  if (readyResult.error && isMissingMultiCompanyFunctionError(readyResult.error)) {
    return { enabled: false, activeCompany: null, companies: [], workerActive: true }
  }
  if (readyResult.error) {
    console.error('複数社機能の状態確認に失敗しました', readyResult.error)
    return { enabled: true, activeCompany: null, companies: [], workerActive: false, error: true }
  }
  if (readyResult.data !== true) {
    return { enabled: false, activeCompany: null, companies: [], workerActive: true }
  }

  if (profile.role !== ROLES.ADMIN) {
    if (!profile.company_id) {
      return { enabled: true, activeCompany: null, companies: [], workerActive: false }
    }
    const companyPromise = supabase
      .from('company_master')
      .select('id, name, is_active')
      .eq('id', profile.company_id)
      .eq('is_active', true)
      .maybeSingle()
    const workerPromise = profile.role === ROLES.WORKER
      ? supabase
        .from('worker_master')
        .select('id')
        .eq('id', profile.worker_id)
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .maybeSingle()
      : Promise.resolve({ data: true })
    const [{ data: company }, { data: worker }] = await Promise.all([companyPromise, workerPromise])
    return {
      enabled: true,
      activeCompany: company || null,
      companies: [],
      workerActive: Boolean(worker)
    }
  }

  const { data, error } = await supabase
    .from('company_master')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name')

  if (error) {
    console.error('会社一覧の取得に失敗しました', error)
    return { enabled: true, activeCompany: null, companies: [], workerActive: false, error: true }
  }

  const companies = data || []
  const storedCompanyId = sessionStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY)
  const activeCompany = chooseActiveCompany(companies, storedCompanyId)
  if (activeCompany) sessionStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, activeCompany.id)

  return { enabled: true, activeCompany, companies, workerActive: true }
}

function renderAuthBar(profile, email, companyContext) {
  if (document.getElementById('auth_bar')) return

  const container = document.querySelector('.container')
  if (!container) return

  const bar = document.createElement('div')
  bar.id = 'auth_bar'
  bar.className = 'auth-bar'

  const label = document.createElement('span')
  label.textContent = `${getRoleLabel(profile.role)} / ${email || ''}`

  const companyArea = createCompanyArea(profile, companyContext)

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'secondary-btn compact-action'
  button.textContent = 'ログアウト'
  button.addEventListener('click', signOut)

  bar.append(label)
  if (companyArea) bar.append(companyArea)
  bar.append(button)
  container.prepend(bar)
}

function createCompanyArea(profile, companyContext) {
  if (!companyContext.enabled) return null

  if (profile.role !== ROLES.ADMIN) {
    const label = document.createElement('span')
    label.className = 'auth-company-label'
    label.textContent = companyContext.activeCompany?.name
      ? `${companyContext.activeCompany.name} を表示中`
      : '所属会社で表示中'
    return label
  }

  const select = document.createElement('select')
  select.className = 'auth-company-select'
  select.setAttribute('aria-label', '操作対象の会社')

  if (companyContext.companies.length === 0) {
    select.disabled = true
    select.append(new Option('会社を登録してください', ''))
    return select
  }

  companyContext.companies.forEach(company => {
    select.append(new Option(company.name, company.id, false, company.id === companyContext.activeCompany?.id))
  })

  select.addEventListener('change', () => {
    sessionStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, select.value)
    location.reload()
  })
  return select
}

function renderAccessMessage({ title, text }) {
  document.body.innerHTML = `
    <div class="container app-shell">
      <main class="panel auth-panel">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(text)}</p>
        <div class="button-row auth-actions">
          <a class="secondary-link" href="index.html">工数入力へ</a>
          <button class="secondary-btn" id="auth_logout_button">ログアウト</button>
        </div>
      </main>
    </div>
  `
  document.getElementById('auth_logout_button')?.addEventListener('click', signOut)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
