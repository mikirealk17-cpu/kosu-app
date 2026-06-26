import { supabase } from './supabaseClient.js'

window.loadWorkers = async function() {
  const { data, error } = await supabase
    .from('worker_master')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  const list = document.getElementById('worker_list')
  list.innerHTML = ''

  if (error || !data) {
    console.error('作業者一覧の取得に失敗しました', error)
    const text = error?.code === 'PGRST205'
      ? 'Supabase側にworker_masterテーブルがありません'
      : '読み込みに失敗しました'
    list.appendChild(createListMessage(text))
    setWorkerFormEnabled(false)
    return
  }

  setWorkerFormEnabled(true)

  if (data.length === 0) {
    list.appendChild(createListMessage('まだ作業者が登録されていません'))
    return
  }

  data.forEach(worker => {
    const item = document.createElement('div')
    item.className = 'worker-item'

    const name = document.createElement('span')
    name.className = 'worker-name'
    name.textContent = worker.name

    const actions = document.createElement('div')
    actions.className = 'worker-actions'

    const editButton = document.createElement('button')
    editButton.className = 'icon-btn edit-btn'
    editButton.textContent = '編集'
    editButton.addEventListener('click', () => editWorker(worker.id, worker.name))

    const deleteButton = document.createElement('button')
    deleteButton.className = 'icon-btn delete-btn'
    deleteButton.textContent = '削除'
    deleteButton.addEventListener('click', () => deleteWorker(worker.id))

    actions.append(editButton, deleteButton)
    item.append(name, actions)
    list.appendChild(item)
  })
}

window.addWorker = async function() {
  const name = document.getElementById('new_worker_name').value.trim()
  if (!name) {
    showMessage('⚠️ 名前を入力してください', 'error')
    return
  }

  const { error } = await supabase
    .from('worker_master')
    .insert({ name })

  if (error) {
    console.error('作業者の追加に失敗しました', error)
    showMessage('❌ 追加に失敗しました（同じ名前が既にあるかもしれません）', 'error')
  } else {
    showMessage('✅ 追加しました', 'success')
    document.getElementById('new_worker_name').value = ''
    window.loadWorkers()
  }
}

window.editWorker = async function(id, oldName) {
  const newName = prompt('新しい名前を入力してください', oldName)
  if (!newName || newName.trim() === '') return

  const { error } = await supabase
    .from('worker_master')
    .update({ name: newName.trim() })
    .eq('id', id)

  if (error) {
    console.error('作業者の更新に失敗しました', error)
    showMessage('❌ 更新に失敗しました', 'error')
  } else {
    showMessage('✅ 更新しました', 'success')
    window.loadWorkers()
  }
}

window.deleteWorker = async function(id) {
  if (!confirm('この作業者を削除しますか？')) return

  const { error } = await supabase
    .from('worker_master')
    .update({ is_active: false })
    .eq('id', id)

  if (error) {
    console.error('作業者の削除に失敗しました', error)
    showMessage('❌ 削除に失敗しました', 'error')
  } else {
    showMessage('✅ 削除しました', 'success')
    window.loadWorkers()
  }
}

function showMessage(text, type) {
  const el = document.getElementById('message')
  el.textContent = text
  el.className = type
  setTimeout(() => { el.textContent = '' }, 3000)
}

function createListMessage(text) {
  const message = document.createElement('p')
  message.className = 'list-message'
  message.textContent = text
  return message
}

function setWorkerFormEnabled(enabled) {
  document.getElementById('new_worker_name').disabled = !enabled
  document.querySelector('.add-form button').disabled = !enabled
}

window.loadWorkers()
