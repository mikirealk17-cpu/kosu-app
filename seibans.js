import { supabase } from './supabaseClient.js'
import { requireAuth, ROLES } from './auth.js'

await requireAuth([ROLES.ADMIN])

window.loadSeibans = async function() {
  const list = document.getElementById('seiban_list')
  list.innerHTML = ''

  const { data, error } = await fetchSeibans()

  if (error || !data) {
    console.error('製番の取得に失敗しました', error)
    list.appendChild(createListMessage('読み込みに失敗しました'))
    return
  }

  if (data.length === 0) {
    list.appendChild(createListMessage('製番が登録されていません'))
    return
  }

  data.forEach(seiban => {
    const item = document.createElement('div')
    item.className = 'master-item'

    const text = document.createElement('div')
    text.className = 'master-text'

    const name = document.createElement('strong')
    name.textContent = seiban.seiban

    const sub = document.createElement('span')
    const isActive = seiban.is_active !== false
    sub.textContent = `${seiban.equipment_name || '設備名未設定'} / ${isActive ? '使用中' : '非表示'}`

    const actions = document.createElement('div')
    actions.className = 'master-actions'

    const editButton = document.createElement('button')
    editButton.textContent = '編集'
    editButton.addEventListener('click', () => editSeiban(seiban))

    const visibilityButton = document.createElement('button')
    visibilityButton.className = isActive ? 'danger-btn' : ''
    visibilityButton.textContent = isActive ? '非表示' : '再表示'
    visibilityButton.addEventListener('click', () => toggleSeibanVisibility(seiban))

    text.append(name, sub)
    actions.append(editButton, visibilityButton)
    item.append(text, actions)
    list.appendChild(item)
  })
}

window.addSeiban = async function() {
  const seiban = document.getElementById('new_seiban').value.trim()
  const equipmentName = document.getElementById('new_equipment_name').value.trim()

  if (!seiban || !equipmentName) {
    showMessage('⚠️ 製番と設備名を入力してください', 'error')
    return
  }

  const { error } = await insertSeiban({ seiban, equipment_name: equipmentName })

  if (error) {
    console.error('製番の追加に失敗しました', error)
    showMessage('❌ 追加に失敗しました', 'error')
    return
  }

  document.getElementById('new_seiban').value = ''
  document.getElementById('new_equipment_name').value = ''
  showMessage('✅ 追加しました', 'success')
  window.loadSeibans()
}

async function fetchSeibans() {
  const result = await supabase
    .from('seiban_master')
    .select('id, seiban, equipment_name, is_active')
    .order('is_active', { ascending: false })
    .order('seiban')

  if (!isMissingColumnError(result.error)) return result

  return supabase
    .from('seiban_master')
    .select('id, seiban, equipment_name')
    .order('seiban')
}

async function insertSeiban(payload) {
  const result = await supabase
    .from('seiban_master')
    .insert({ ...payload, is_active: true })

  if (!isMissingColumnError(result.error)) return result

  return supabase
    .from('seiban_master')
    .insert(payload)
}

async function editSeiban(current) {
  const seiban = prompt('製番を入力してください', current.seiban)
  if (!seiban || !seiban.trim()) return

  const equipmentName = prompt('設備名を入力してください', current.equipment_name || '')
  if (!equipmentName || !equipmentName.trim()) return

  const { error } = await supabase
    .from('seiban_master')
    .update({
      seiban: seiban.trim(),
      equipment_name: equipmentName.trim()
    })
    .eq('id', current.id)

  if (error) {
    console.error('製番の更新に失敗しました', error)
    showMessage('❌ 更新に失敗しました', 'error')
    return
  }

  showMessage('✅ 更新しました', 'success')
  window.loadSeibans()
}

async function toggleSeibanVisibility(seiban) {
  const isActive = seiban.is_active !== false
  const action = isActive ? '非表示' : '再表示'
  if (!confirm(`この製番を${action}にしますか？`)) return

  const { error } = await supabase
    .from('seiban_master')
    .update({ is_active: !isActive })
    .eq('id', seiban.id)

  if (error) {
    console.error(`製番の${action}に失敗しました`, error)
    if (isMissingColumnError(error)) {
      showMessage('❌ 非表示機能を使うには、先にSUPABASE_SEIBAN_ACTIVE_SETUP.sqlを実行してください', 'error')
      return
    }
    showMessage(`❌ ${action}に失敗しました`, 'error')
    return
  }

  showMessage(`✅ ${action}にしました`, 'success')
  window.loadSeibans()
}

function isMissingColumnError(error) {
  if (!error) return false
  return error.code === '42703' || String(error.message || '').includes('is_active')
}

function showMessage(text, type) {
  const el = document.getElementById('message')
  el.textContent = text
  el.className = type
  setTimeout(() => {
    el.textContent = ''
    el.className = ''
  }, 3000)
}

function createListMessage(text) {
  const message = document.createElement('p')
  message.className = 'list-message'
  message.textContent = text
  return message
}

window.loadSeibans()
