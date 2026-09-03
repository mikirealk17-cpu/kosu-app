import { supabase } from './supabaseClient.js'
import { requireAuth, ROLES } from './auth.js'
import { scopeCompanyQuery } from './company-context.mjs'

const authContext = await requireAuth([ROLES.ADMIN, ROLES.COMPANY_ADMIN])
let isSending = false

const inviteButton = document.getElementById('invite_button')
const roleSelect = document.getElementById('invite_role')
inviteButton.addEventListener('click', inviteUser)
roleSelect.addEventListener('change', updateRoleForm)

if (!authContext.multiCompanyEnabled || !authContext.companyId) {
  const message = document.getElementById('migration_message')
  message.hidden = false
  message.textContent = authContext.multiCompanyEnabled
    ? '操作する会社を選択してください。'
    : '複数社対応のSupabase移行がまだ有効化されていません。'
  inviteButton.disabled = true
} else {
  await Promise.all([loadUsers(), loadWorkers()])
}
updateRoleForm()

async function loadUsers() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, worker_id, role, is_active, created_at, worker_master(name)')
    .eq('company_id', authContext.companyId)
    .order('created_at')

  const list = document.getElementById('user_list')
  list.innerHTML = ''
  if (error) {
    console.error('利用者一覧の取得に失敗しました', error)
    list.textContent = '利用者一覧を読み込めませんでした。'
    return
  }
  if (!data?.length) {
    list.textContent = 'この会社の利用者はまだ登録されていません。'
    return
  }
  data.forEach(profile => {
    const item = document.createElement('div')
    item.className = 'worker-item'
    const text = document.createElement('div')
    text.className = 'worker-text'
    const name = document.createElement('strong')
    name.textContent = profile.worker_master?.name || '会社管理者'
    const meta = document.createElement('span')
    meta.className = 'company-meta'
    meta.textContent = `${profile.role === 'company_admin' ? '会社管理者' : '作業者'} / ${profile.is_active ? '有効' : '無効'}`
    text.append(name, meta)
    item.appendChild(text)
    list.appendChild(item)
  })
}

async function loadWorkers() {
  const { data, error } = await scopeCompanyQuery(supabase
    .from('worker_master')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order'), authContext)
  if (error) {
    console.error('作業者一覧の取得に失敗しました', error)
    return
  }
  const select = document.getElementById('invite_worker')
  data?.forEach(worker => select.append(new Option(worker.name, worker.id)))
}

function updateRoleForm() {
  const isWorker = roleSelect.value === 'worker'
  document.getElementById('worker_select_group').hidden = !isWorker
  document.getElementById('invite_worker').disabled = !isWorker
}

async function inviteUser() {
  if (isSending) return
  const email = document.getElementById('invite_email').value.trim().toLowerCase()
  const role = authContext.isCompanyAdmin ? 'worker' : roleSelect.value
  const workerId = role === 'worker' ? document.getElementById('invite_worker').value : null
  if (!email || !email.includes('@')) return showMessage('正しいメールアドレスを入力してください', 'error')
  if (role === 'worker' && !workerId) return showMessage('紐づける作業者を選択してください', 'error')

  setSending(true)
  try {
    const { data, error } = await supabase.functions.invoke('invite-company-user', {
      body: { email, role, workerId, companyId: authContext.companyId }
    })
    if (error || !data?.ok) {
      console.error('利用者招待に失敗しました', error || data)
      return showMessage(data?.message || 'メールを送れませんでした。登録済みメールや設定を確認してください', 'error')
    }
    document.getElementById('invite_email').value = ''
    showMessage('パスワード設定メールを送りました', 'success')
    await loadUsers()
  } catch (error) {
    console.error('利用者招待で通信エラーが発生しました', error)
    showMessage('通信エラーでメールを送れませんでした。時間を置いて再度お試しください', 'error')
  } finally {
    setSending(false)
  }
}

function setSending(value) {
  isSending = value
  inviteButton.disabled = value
  inviteButton.textContent = value ? '送信中...' : 'パスワード設定メールを送る'
}

function showMessage(text, type) {
  const element = document.getElementById('message')
  element.textContent = text
  element.className = type
}
