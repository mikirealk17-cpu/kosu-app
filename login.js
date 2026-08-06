import { supabase } from './supabaseClient.js'
import { loadUserProfile, ROLES } from './auth.js'
import { ALLOWED_REDIRECT_PAGES, getSafeLocalRedirect } from './login-redirect.mjs'

const form = document.getElementById('login_form')
const emailInput = document.getElementById('login_email')
const passwordInput = document.getElementById('login_password')
const message = document.getElementById('message')
const logoutButton = document.getElementById('logout_button')
const resetPasswordButton = document.getElementById('reset_password_button')
const params = new URLSearchParams(location.search)

showReasonMessage(params.get('reason'))
logoutButton.addEventListener('click', signOutFromLogin)
resetPasswordButton.addEventListener('click', sendPasswordResetEmail)

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
    setMessage(getLoginErrorMessage(error), 'error')
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

  const redirect = getSafeLocalRedirect(params.get('redirect'), location)
  if (redirect && isRoleAllowedForPath(profile.role, redirect)) {
    location.href = redirect
    return
  }

  location.href = profile.role === ROLES.WORKER ? 'index.html' : 'summary.html'
}

function isRoleAllowedForPath(role, path) {
  const page = path.split('?')[0]
  if (role === ROLES.ADMIN) return ALLOWED_REDIRECT_PAGES.has(page)
  const workerAllowed = ['index.html', 'logs.html', 'summary.html']
  return workerAllowed.includes(page)
}

function showReasonMessage(reason) {
  if (reason === 'login_required') {
    setMessage('ログインしてください', 'info')
  } else if (reason === 'password_updated') {
    setMessage('パスワードを更新しました。新しいパスワードでログインしてください。', 'success')
  }
}

function setMessage(text, type) {
  message.textContent = text
  message.className = `${type || 'info'} is-visible`
}

function setFormEnabled(enabled) {
  emailInput.disabled = !enabled
  passwordInput.disabled = !enabled
  form.querySelector('button').disabled = !enabled
  resetPasswordButton.disabled = !enabled
}

async function signOutFromLogin() {
  await supabase.auth.signOut()
  logoutButton.classList.add('is-hidden')
  emailInput.value = ''
  passwordInput.value = ''
  setFormEnabled(true)
  setMessage('ログアウトしました', '')
}

async function sendPasswordResetEmail() {
  const email = emailInput.value.trim()
  if (!email) {
    setMessage('パスワードを再設定するメールアドレスを入力してください。', 'error')
    emailInput.focus()
    return
  }

  setMessage('パスワード再設定メールを送信中です...', 'info')
  setFormEnabled(false)

  const redirectTo = new URL('update-password.html', location.href).href
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  setFormEnabled(true)

  if (error) {
    console.error('パスワード再設定メールの送信に失敗しました', error)
    setMessage('パスワード再設定メールを送れませんでした。メールアドレスを確認するか、管理者に連絡してください。', 'error')
    return
  }

  setMessage('登録済みのメールアドレスであれば、パスワード再設定メールを送信しました。メール内のリンクから新しいパスワードを設定してください。', 'success')
}

function getLoginErrorMessage(error) {
  const text = String(error?.message || '').toLowerCase()
  if (text.includes('email not confirmed')) {
    return 'メールアドレスの確認が完了していません。受信メールを確認するか、管理者に連絡してください。'
  }

  return 'メールアドレスまたはパスワードを確認してください。パスワードが分からない場合は「パスワードを忘れた場合」から再設定できます。'
}
