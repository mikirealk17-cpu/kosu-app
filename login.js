import { supabase } from './supabaseClient.js'
import { loadUserProfile, ROLES } from './auth.js'

const form = document.getElementById('login_form')
const emailInput = document.getElementById('login_email')
const passwordInput = document.getElementById('login_password')
const message = document.getElementById('message')
const logoutButton = document.getElementById('logout_button')
const params = new URLSearchParams(location.search)

showReasonMessage(params.get('reason'))
logoutButton.addEventListener('click', signOutFromLogin)

const { data: sessionData } = await supabase.auth.getSession()
if (sessionData?.session) {
  await routeLoggedInUser(sessionData.session.user.id)
}

form.addEventListener('submit', async event => {
  event.preventDefault()
  setMessage('ログイン中です...', '')
  setFormEnabled(false)

  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value
  })

  if (error || !data?.user) {
    console.error('ログインに失敗しました', error)
    setMessage('メールアドレスまたはパスワードを確認してください', 'error')
    setFormEnabled(true)
    return
  }

  await routeLoggedInUser(data.user.id)
})

async function routeLoggedInUser(authUserId) {
  const profile = await loadUserProfile(authUserId)
  if (!profile) {
    setMessage('ログインできましたが、権限設定がありません。管理者に user_profiles の設定を依頼してください。', 'error')
    setFormEnabled(true)
    logoutButton.classList.remove('is-hidden')
    return
  }

  const redirect = params.get('redirect')
  if (redirect && isSafeLocalPath(redirect) && isRoleAllowedForPath(profile.role, redirect)) {
    location.href = redirect
    return
  }

  location.href = profile.role === ROLES.WORKER ? 'index.html' : 'summary.html'
}

function isRoleAllowedForPath(role, path) {
  if (role === ROLES.ADMIN) return true
  const workerAllowed = ['index.html', 'logs.html']
  const page = path.split('?')[0]
  return workerAllowed.includes(page)
}

function isSafeLocalPath(path) {
  return !path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('//')
}

function showReasonMessage(reason) {
  if (reason === 'login_required') {
    setMessage('ログインしてください', '')
  }
}

function setMessage(text, type) {
  message.textContent = text
  message.className = type
}

function setFormEnabled(enabled) {
  emailInput.disabled = !enabled
  passwordInput.disabled = !enabled
  form.querySelector('button').disabled = !enabled
}

async function signOutFromLogin() {
  await supabase.auth.signOut()
  logoutButton.classList.add('is-hidden')
  emailInput.value = ''
  passwordInput.value = ''
  setFormEnabled(true)
  setMessage('ログアウトしました', '')
}
