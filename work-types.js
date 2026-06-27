import { supabase } from './supabaseClient.js'

window.loadWorkTypes = async function() {
  const list = document.getElementById('work_type_list')
  list.innerHTML = ''

  const { data, error } = await supabase
    .from('work_type_master')
    .select('*')
    .order('sort_order')

  if (error || !data) {
    console.error('作業内容の取得に失敗しました', error)
    list.appendChild(createListMessage('読み込みに失敗しました'))
    return
  }

  if (data.length === 0) {
    list.appendChild(createListMessage('作業内容が登録されていません'))
    return
  }

  data.forEach(type => {
    const item = document.createElement('div')
    item.className = 'master-item'

    const text = document.createElement('div')
    text.className = 'master-text'

    const name = document.createElement('strong')
    name.textContent = type.name

    const sub = document.createElement('span')
    sub.textContent = `並び順: ${type.sort_order ?? 100} / ${type.is_active ? '使用中' : '非表示'}`

    const actions = document.createElement('div')
    actions.className = 'master-actions'

    const editButton = document.createElement('button')
    editButton.textContent = '編集'
    editButton.addEventListener('click', () => editWorkType(type))

    const deleteButton = document.createElement('button')
    deleteButton.className = 'danger-btn'
    deleteButton.textContent = '削除'
    deleteButton.addEventListener('click', () => deleteWorkType(type.id))

    text.append(name, sub)
    actions.append(editButton, deleteButton)
    item.append(text, actions)
    list.appendChild(item)
  })
}

window.addWorkType = async function() {
  const name = document.getElementById('new_work_type_name').value.trim()
  const sortOrder = parseInt(document.getElementById('new_work_type_order').value) || 100

  if (!name) {
    showMessage('⚠️ 作業内容を入力してください', 'error')
    return
  }

  const { error } = await supabase
    .from('work_type_master')
    .insert({ name, sort_order: sortOrder, is_active: true })

  if (error) {
    console.error('作業内容の追加に失敗しました', error)
    showMessage('❌ 追加に失敗しました', 'error')
    return
  }

  document.getElementById('new_work_type_name').value = ''
  document.getElementById('new_work_type_order').value = '100'
  showMessage('✅ 追加しました', 'success')
  window.loadWorkTypes()
}

async function editWorkType(type) {
  const name = prompt('作業内容名を入力してください', type.name)
  if (!name || !name.trim()) return

  const sortOrderText = prompt('並び順を入力してください', type.sort_order ?? 100)
  if (sortOrderText === null) return

  const sortOrder = parseInt(sortOrderText) || 100

  const { error } = await supabase
    .from('work_type_master')
    .update({ name: name.trim(), sort_order: sortOrder, is_active: true })
    .eq('id', type.id)

  if (error) {
    console.error('作業内容の更新に失敗しました', error)
    showMessage('❌ 更新に失敗しました', 'error')
    return
  }

  showMessage('✅ 更新しました', 'success')
  window.loadWorkTypes()
}

async function deleteWorkType(id) {
  if (!confirm('この作業内容を削除しますか？過去データがある場合は非表示になります。')) return

  const { error } = await supabase
    .from('work_type_master')
    .update({ is_active: false })
    .eq('id', id)

  if (error) {
    console.error('作業内容の削除に失敗しました', error)
    showMessage('❌ 削除に失敗しました', 'error')
    return
  }

  showMessage('✅ 削除しました', 'success')
  window.loadWorkTypes()
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

window.loadWorkTypes()
