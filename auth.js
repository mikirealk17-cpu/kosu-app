import { supabase } from './supabaseClient.js'

export const ROLES = {
  ADMIN: 'system_admin',
  WORKER: 'worker'
}

const LOGIN_PAGE = 'login.html'
const WORKER_BLOCKED_HREFS = [
  'summary.html',
  'admin.html',
  'workers.html',
  'work-types.html',
  'seibans.html',
  'rates.html',
  'billing-companies.html'
]

export async function requireAuth(allowedRoles = [ROLES.ADMIN, ROLES.WORKER]) {
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
        ? '作業者は工数入力と自分の履歴確認だけ利用できます。'
        : 'このユーザーには、この画面を開く権限がありません。'
    })
    return stopPage()
  }

  applyRoleNavigation(profile)
  renderAuthBar(profile, session.user.email)

  return {
    session,
    profile,
    isAdmin: profile.role === ROLES.ADMIN,
    isWorker: profile.role === ROLES.WORKER
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
  if (role === ROLES.ADMIN) return '管理者'
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

function renderAuthBar(profile, email) {
  if (document.getElementById('auth_bar')) return

  const container = document.querySelector('.container')
  if (!container) return

  const bar = document.createElement('div')
  bar.id = 'auth_bar'
  bar.className = 'auth-bar'

  const label = document.createElement('span')
  label.textContent = `${getRoleLabel(profile.role)} / ${email || ''}`

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'secondary-btn compact-action'
  button.textContent = 'ログアウト'
  button.addEventListener('click', signOut)

  bar.append(label, button)
  container.prepend(bar)
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
