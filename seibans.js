import { supabase } from './supabaseClient.js'

window.loadSeibans = async function() {
  const list = document.getElementById('seiban_list')
  list.innerHTML = ''

  const { data, error } = await supabase
    .from('seiban_master')
    .select('*')
    .order('seiban')

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
    sub.textContent = seiban.equipment_name || '設備名未設定'

    const actions = document.createElement('div')
    actions.className = 'master-actions'

    const editButton = document.createElement('button')
    editButton.textContent = '編集'
    editButton.addEventListener('click', () => editSeiban(seiban))

    const deleteButton = document.createElement('button')
    deleteButton.className = 'danger-btn'
    deleteButton.textContent = '削除'
    deleteButton.addEventListener('click', () => deleteSeiban(seiban.id))

    text.append(name, sub)
    actions.append(editButton, deleteButton)
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

  const { error } = await supabase
    .from('seiban_master')
    .insert({ seiban, equipment_name: equipmentName })

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

async function editSeiban(current) {
  const seiban = prompt('製番を入力してください', current.seiban)
  if (!seiban || !seiban.trim()) return

  const equipmentName = prompt('設備名を入力してください', current.equipment_name || '')
  if (!equipmentName || !equipmentName.trim()) return

  const { error } = await supabase
    .from('seiban_master')
    .update({
      seiban: seiban.trim(),
      equipment_name: equipmentName.trim(),
      updated_at: new Date().toISOString()
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

async function deleteSeiban(id) {
  if (!confirm('この製番を削除しますか？過去の工数で使われている場合は削除できません。')) return

  const { error } = await supabase
    .from('seiban_master')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('製番の削除に失敗しました', error)
    showMessage('❌ 削除に失敗しました。過去の工数で使われている可能性があります。', 'error')
    return
  }

  showMessage('✅ 削除しました', 'success')
  window.loadSeibans()
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
