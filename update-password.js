import { supabase } from './supabaseClient.js'

const form = document.getElementById('update_password_form')
const newPasswordInput = document.getElementById('new_password')
const confirmPasswordInput = document.getElementById('confirm_password')
const message = document.getElementById('message')

let hasRecoverySession = false

setMessage('再設定リンクを確認しています...', 'info')
setFormEnabled(false)

supabase.auth.onAuthStateChange(event => {
  if (event === 'PASSWORD_RECOVERY') {
    allowPasswordUpdate()
  }
})

await supabase.auth.getSession()
if (!hasRecoverySession) {
  setMessage('再設定リンクが確認できませんでした。ログイン画面から再設定メールを送り直してください。', 'error')
}

form.addEventListener('submit', async event => {
  event.preventDefault()

  if (!hasRecoverySession) {
    setMessage('再設定リンクが確認できません。ログイン画面から再設定メールを送り直してください。', 'error')
    return
  }

  const password = newPasswordInput.value
  const confirmPassword = confirmPasswordInput.value

  if (password.length < 6) {
    setMessage('パスワードは6文字以上で入力してください。', 'error')
    return
  }

  if (password !== confirmPassword) {
    setMessage('確認用パスワードが一致していません。', 'error')
    return
  }

  setMessage('パスワードを更新中です...', 'info')
  setFormEnabled(false)

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    console.error('パスワード更新に失敗しました', error)
    setMessage('パスワードを更新できませんでした。再設定メールを送り直すか、管理者に連絡してください。', 'error')
    setFormEnabled(true)
    return
  }

  await supabase.auth.signOut()
  location.href = 'login.html?reason=password_updated'
})

function setMessage(text, type) {
  message.textContent = text
  message.className = `${type || 'info'} is-visible`
}

function setFormEnabled(enabled) {
  newPasswordInput.disabled = !enabled
  confirmPasswordInput.disabled = !enabled
  form.querySelector('button').disabled = !enabled
}

function allowPasswordUpdate() {
  hasRecoverySession = true
  setFormEnabled(true)
  setMessage('新しいパスワードを入力してください。', 'info')
}
