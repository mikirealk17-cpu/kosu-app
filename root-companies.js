import { supabase } from './supabaseClient.js'

window.loadRootCompanies = async function() {
  const { data, error } = await supabase
    .from('root_company_master')
    .select('*')
    .order('is_active', { ascending: false })
    .order('sort_order')
    .order('name')

  const list = document.getElementById('root_company_list')
  list.innerHTML = ''

  if (error || !data) {
    console.error('大元請け一覧の取得に失敗しました', error)
    const text = error?.code === 'PGRST205'
      ? 'Supabase側にroot_company_masterテーブルがありません'
      : '読み込みに失敗しました'
    list.appendChild(createListMessage(text))
    setRootCompanyFormEnabled(false)
    return
  }

  setRootCompanyFormEnabled(true)

  if (data.length === 0) {
    list.appendChild(createListMessage('まだ大元請けが登録されていません'))
    return
  }

  data.forEach(company => {
    const item = document.createElement('div')
    item.className = 'worker-item'

    const name = document.createElement('span')
    name.className = 'worker-name'
    name.textContent = company.name

    const status = document.createElement('span')
    status.className = company.is_active ? 'worker-status active' : 'worker-status inactive'
    status.textContent = company.is_active ? '使用中' : '非表示'

    const sub = document.createElement('span')
    sub.className = 'log-sub'
    sub.textContent = `並び順: ${company.sort_order ?? 100}`

    const text = document.createElement('div')
    text.className = 'worker-text'
    text.append(name, status, sub)

    const actions = document.createElement('div')
    actions.className = 'worker-actions'

    if (company.is_active) {
      const editButton = document.createElement('button')
      editButton.className = 'icon-btn edit-btn'
      editButton.textContent = '編集'
      editButton.addEventListener('click', () => editRootCompany(company))

      const deleteButton = document.createElement('button')
      deleteButton.className = 'icon-btn delete-btn'
      deleteButton.textContent = '削除'
      deleteButton.addEventListener('click', () => deleteRootCompany(company.id, company.name))

      actions.append(editButton, deleteButton)
    } else {
      const restoreButton = document.createElement('button')
      restoreButton.className = 'icon-btn restore-btn'
      restoreButton.textContent = '復活'
      restoreButton.addEventListener('click', () => restoreRootCompany(company.id, company.name))

      actions.appendChild(restoreButton)
    }

    item.append(text, actions)
    list.appendChild(item)
  })
}

window.addRootCompany = async function() {
  const name = document.getElementById('new_root_company_name').value.trim()
  const sortOrder = parseInt(document.getElementById('new_root_company_order').value) || 100

  if (!name) {
    showMessage('⚠️ 大元請け名を入力してください', 'error')
    return
  }

  const { error } = await supabase
    .from('root_company_master')
    .insert({ name, sort_order: sortOrder, is_active: true })

  if (error) {
    console.error('大元請けの追加に失敗しました', error)
    showMessage('❌ 追加に失敗しました（同じ名前が既にあるかもしれません）', 'error')
  } else {
    showMessage('✅ 追加しました', 'success')
    document.getElementById('new_root_company_name').value = ''
    document.getElementById('new_root_company_order').value = '100'
    window.loadRootCompanies()
  }
}

window.editRootCompany = async function(company) {
  const name = prompt('大元請け名を入力してください', company.name)
  if (!name || !name.trim()) return

  const sortOrderText = prompt('並び順を入力してください', company.sort_order ?? 100)
  if (sortOrderText === null) return

  const sortOrder = parseInt(sortOrderText) || 100

  const { error } = await supabase
    .from('root_company_master')
    .update({ name: name.trim(), sort_order: sortOrder, is_active: true, updated_at: new Date().toISOString() })
    .eq('id', company.id)

  if (error) {
    console.error('大元請けの更新に失敗しました', error)
    showMessage('❌ 更新に失敗しました', 'error')
  } else {
    showMessage('✅ 更新しました', 'success')
    window.loadRootCompanies()
  }
}

window.deleteRootCompany = async function(id, name) {
  if (!confirm(`${name} を非表示にしますか？\n\n過去の工数データは残ります。`)) return

  const { error } = await supabase
    .from('root_company_master')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('大元請けの削除に失敗しました', error)
    showMessage('❌ 削除に失敗しました', 'error')
  } else {
    showMessage('✅ 削除しました', 'success')
    window.loadRootCompanies()
  }
}

window.restoreRootCompany = async function(id, name) {
  if (!confirm(`${name} を大元請け一覧に戻しますか？`)) return

  const { error } = await supabase
    .from('root_company_master')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('大元請けの復活に失敗しました', error)
    showMessage('❌ 復活に失敗しました', 'error')
  } else {
    showMessage('✅ 復活しました', 'success')
    window.loadRootCompanies()
  }
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

function setRootCompanyFormEnabled(enabled) {
  document.getElementById('new_root_company_name').disabled = !enabled
  document.getElementById('new_root_company_order').disabled = !enabled
  document.querySelector('.add-form button').disabled = !enabled
}

window.loadRootCompanies()
