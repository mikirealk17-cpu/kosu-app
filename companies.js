import { supabase } from './supabaseClient.js'
import { requireAuth, ROLES } from './auth.js'
import { ACTIVE_COMPANY_STORAGE_KEY } from './company-context.mjs'

const authContext = await requireAuth([ROLES.ADMIN])
let isSaving = false

const addButton = document.getElementById('add_company_button')
addButton.addEventListener('click', addCompany)

if (!authContext.multiCompanyEnabled) {
  const message = document.getElementById('migration_message')
  message.hidden = false
  message.textContent = '複数社対応のSupabase移行がまだ有効化されていません。移行手順完了後に利用できます。'
  addButton.disabled = true
} else {
  await loadCompanies()
}

async function loadCompanies() {
  const { data, error } = await supabase
    .from('company_master')
    .select('id, name, is_active, created_at')
    .order('is_active', { ascending: false })
    .order('name')

  const list = document.getElementById('company_list')
  list.innerHTML = ''

  if (error) {
    console.error('会社一覧の取得に失敗しました', error)
    showMessage('会社一覧を読み込めませんでした', 'error')
    return
  }

  if (!data?.length) {
    list.textContent = '会社はまだ登録されていません。'
    return
  }

  data.forEach(company => {
    const item = document.createElement('div')
    item.className = 'worker-item'
    const text = document.createElement('div')
    text.className = 'worker-text'
    const name = document.createElement('strong')
    name.textContent = company.name
    const meta = document.createElement('span')
    meta.className = 'company-meta'
    meta.textContent = company.is_active ? '利用中' : '利用停止中'
    text.append(name, meta)

    const actions = document.createElement('div')
    actions.className = 'worker-actions'
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'icon-btn edit-btn'
    edit.textContent = '会社名編集'
    edit.addEventListener('click', () => editCompany(company))
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = company.is_active ? 'icon-btn delete-btn' : 'icon-btn restore-btn'
    toggle.textContent = company.is_active ? '利用停止' : '再開'
    toggle.addEventListener('click', () => toggleCompany(company))
    actions.append(edit, toggle)
    item.append(text, actions)
    list.appendChild(item)
  })
}

async function addCompany() {
  if (isSaving) return
  const input = document.getElementById('new_company_name')
  const name = input.value.trim()
  if (!name) return showMessage('会社名を入力してください', 'error')

  setSaving(true)
  try {
    const { data, error } = await supabase
      .from('company_master')
      .insert({ name, is_active: true })
      .select('id')
      .single()
    if (error) {
      console.error('会社の追加に失敗しました', error)
      return showMessage('追加できませんでした。同じ会社名がないか確認してください', 'error')
    }
    input.value = ''
    showMessage('会社を追加しました', 'success')
    sessionStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, data.id)
    location.reload()
  } catch (error) {
    console.error('会社の追加で通信エラーが発生しました', error)
    showMessage('通信エラーで追加できませんでした。時間を置いて再度お試しください', 'error')
  } finally {
    setSaving(false)
  }
}

async function editCompany(company) {
  const name = prompt('新しい会社名を入力してください', company.name)?.trim()
  if (!name || name === company.name) return
  const { error } = await supabase.from('company_master').update({ name }).eq('id', company.id)
  if (error) {
    console.error('会社名の更新に失敗しました', error)
    return showMessage('会社名を更新できませんでした', 'error')
  }
  showMessage('会社名を更新しました', 'success')
  await loadCompanies()
}

async function toggleCompany(company) {
  const next = !company.is_active
  const action = next ? '利用を再開' : '利用を停止'
  if (!confirm(`${company.name} の${action}しますか？\n工数データは削除されません。`)) return
  const { error } = await supabase.from('company_master').update({ is_active: next }).eq('id', company.id)
  if (error) {
    console.error('会社状態の更新に失敗しました', error)
    return showMessage(`${action}できませんでした`, 'error')
  }
  showMessage(`${action}しました`, 'success')
  await loadCompanies()
}

function setSaving(value) {
  isSaving = value
  addButton.disabled = value
  addButton.textContent = value ? '追加中...' : '追加'
}

function showMessage(text, type) {
  const element = document.getElementById('message')
  element.textContent = text
  element.className = type
}
