import { supabase } from './supabaseClient.js'

let rootCompanyMap = {}

window.loadBillingCompanies = async function() {
  await loadRootCompanyOptions()

  const { data, error } = await supabase
    .from('billing_company_master')
    .select('*, root_company_master (name)')
    .order('is_active', { ascending: false })
    .order('sort_order')
    .order('name')

  const list = document.getElementById('billing_company_list')
  list.innerHTML = ''

  if (error || !data) {
    console.error('元請け一覧の取得に失敗しました', error)
    const text = error?.code === 'PGRST205'
      ? 'Supabase側にbilling_company_masterテーブルがありません'
      : '読み込みに失敗しました'
    list.appendChild(createListMessage(text))
    setBillingCompanyFormEnabled(false)
    return
  }

  setBillingCompanyFormEnabled(true)

  if (data.length === 0) {
    list.appendChild(createListMessage('まだ元請けが登録されていません'))
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
    const rootName = company.root_company_master?.name || rootCompanyMap[company.root_company_id] || '大元請け未設定'
    sub.textContent = `大元請け: ${rootName} / 並び順: ${company.sort_order ?? 100}`

    const text = document.createElement('div')
    text.className = 'worker-text'
    text.append(name, status, sub)

    const actions = document.createElement('div')
    actions.className = 'worker-actions'

    if (company.is_active) {
      const editButton = document.createElement('button')
      editButton.className = 'icon-btn edit-btn'
      editButton.textContent = '編集'
      editButton.addEventListener('click', () => editBillingCompany(company))

      const deleteButton = document.createElement('button')
      deleteButton.className = 'icon-btn delete-btn'
      deleteButton.textContent = '削除'
      deleteButton.addEventListener('click', () => deleteBillingCompany(company.id, company.name))

      actions.append(editButton, deleteButton)
    } else {
      const restoreButton = document.createElement('button')
      restoreButton.className = 'icon-btn restore-btn'
      restoreButton.textContent = '復活'
      restoreButton.addEventListener('click', () => restoreBillingCompany(company.id, company.name))

      actions.appendChild(restoreButton)
    }

    item.append(text, actions)
    list.appendChild(item)
  })
}

window.addBillingCompany = async function() {
  const rootCompanyId = document.getElementById('new_billing_company_root').value
  const name = document.getElementById('new_billing_company_name').value.trim()
  const sortOrder = parseInt(document.getElementById('new_billing_company_order').value) || 100

  if (!rootCompanyId || !name) {
    showMessage('⚠️ 大元請けと元請け名を入力してください', 'error')
    return
  }

  const { error } = await supabase
    .from('billing_company_master')
    .insert({ root_company_id: rootCompanyId, name, sort_order: sortOrder, is_active: true })

  if (error) {
    console.error('元請けの追加に失敗しました', error)
    showMessage('❌ 追加に失敗しました（同じ名前が既にあるかもしれません）', 'error')
  } else {
    showMessage('✅ 追加しました', 'success')
    document.getElementById('new_billing_company_name').value = ''
    document.getElementById('new_billing_company_order').value = '100'
    window.loadBillingCompanies()
  }
}

window.editBillingCompany = async function(company) {
  const name = prompt('元請け名を入力してください', company.name)
  if (!name || !name.trim()) return

  const rootName = prompt('大元請け名を入力してください', rootCompanyMap[company.root_company_id] || '')
  if (rootName === null) return
  const rootCompanyId = findRootCompanyIdByName(rootName.trim())
  if (!rootCompanyId) {
    showMessage('❌ 登録済みの大元請け名を入力してください', 'error')
    return
  }

  const sortOrderText = prompt('並び順を入力してください', company.sort_order ?? 100)
  if (sortOrderText === null) return

  const sortOrder = parseInt(sortOrderText) || 100

  const { error } = await supabase
    .from('billing_company_master')
    .update({ root_company_id: rootCompanyId, name: name.trim(), sort_order: sortOrder, is_active: true })
    .eq('id', company.id)

  if (error) {
    console.error('元請けの更新に失敗しました', error)
    showMessage('❌ 更新に失敗しました', 'error')
  } else {
    showMessage('✅ 更新しました', 'success')
    window.loadBillingCompanies()
  }
}

window.deleteBillingCompany = async function(id, name) {
  if (!confirm(`${name} を非表示にしますか？\n\n過去の工数データは残ります。`)) return

  const { error } = await supabase
    .from('billing_company_master')
    .update({ is_active: false })
    .eq('id', id)

  if (error) {
    console.error('元請けの削除に失敗しました', error)
    showMessage('❌ 削除に失敗しました', 'error')
  } else {
    showMessage('✅ 削除しました', 'success')
    window.loadBillingCompanies()
  }
}

window.restoreBillingCompany = async function(id, name) {
  if (!confirm(`${name} を元請け一覧に戻しますか？`)) return

  const { error } = await supabase
    .from('billing_company_master')
    .update({ is_active: true })
    .eq('id', id)

  if (error) {
    console.error('元請けの復活に失敗しました', error)
    showMessage('❌ 復活に失敗しました', 'error')
  } else {
    showMessage('✅ 復活しました', 'success')
    window.loadBillingCompanies()
  }
}

async function loadRootCompanyOptions() {
  const select = document.getElementById('new_billing_company_root')
  select.innerHTML = '<option value="">大元請けを選択</option>'
  rootCompanyMap = {}

  const { data, error } = await supabase
    .from('root_company_master')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')
    .order('name')

  if (error || !data) {
    console.error('大元請け一覧の取得に失敗しました', error)
    select.innerHTML = '<option value="">大元請けDB未設定</option>'
    select.disabled = true
    return
  }

  select.disabled = data.length === 0
  if (data.length === 0) {
    select.innerHTML = '<option value="">大元請けを登録してください</option>'
    return
  }

  data.forEach(company => {
    rootCompanyMap[company.id] = company.name
    const option = document.createElement('option')
    option.value = company.id
    option.textContent = company.name
    select.appendChild(option)
  })
}

function findRootCompanyIdByName(name) {
  return Object.entries(rootCompanyMap).find(([, companyName]) => companyName === name)?.[0] || ''
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

function setBillingCompanyFormEnabled(enabled) {
  document.getElementById('new_billing_company_root').disabled = !enabled
  document.getElementById('new_billing_company_name').disabled = !enabled
  document.getElementById('new_billing_company_order').disabled = !enabled
  document.querySelector('.add-form button').disabled = !enabled
}

window.loadBillingCompanies()
