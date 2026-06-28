import { supabase } from './supabaseClient.js'

window.loadBillingCompanies = async function() {
  const { data, error } = await supabase
    .from('billing_company_master')
    .select('*')
    .order('is_active', { ascending: false })
    .order('sort_order')
    .order('name')

  const list = document.getElementById('billing_company_list')
  list.innerHTML = ''

  if (error || !data) {
    console.error('作業会社一覧の取得に失敗しました', error)
    const text = error?.code === 'PGRST205'
      ? 'Supabase側にbilling_company_masterテーブルがありません'
      : '読み込みに失敗しました'
    list.appendChild(createListMessage(text))
    setBillingCompanyFormEnabled(false)
    return
  }

  setBillingCompanyFormEnabled(true)

  if (data.length === 0) {
    list.appendChild(createListMessage('まだ作業会社が登録されていません'))
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
  const name = document.getElementById('new_billing_company_name').value.trim()
  const sortOrder = parseInt(document.getElementById('new_billing_company_order').value) || 100

  if (!name) {
    showMessage('⚠️ 作業会社名を入力してください', 'error')
    return
  }

  const { error } = await supabase
    .from('billing_company_master')
    .insert({ name, sort_order: sortOrder, is_active: true })

  if (error) {
    console.error('作業会社の追加に失敗しました', error)
    showMessage('❌ 追加に失敗しました（同じ名前が既にあるかもしれません）', 'error')
  } else {
    showMessage('✅ 追加しました', 'success')
    document.getElementById('new_billing_company_name').value = ''
    document.getElementById('new_billing_company_order').value = '100'
    window.loadBillingCompanies()
  }
}

window.editBillingCompany = async function(company) {
  const name = prompt('作業会社名を入力してください', company.name)
  if (!name || !name.trim()) return

  const sortOrderText = prompt('並び順を入力してください', company.sort_order ?? 100)
  if (sortOrderText === null) return

  const sortOrder = parseInt(sortOrderText) || 100

  const { error } = await supabase
    .from('billing_company_master')
    .update({ name: name.trim(), sort_order: sortOrder, is_active: true })
    .eq('id', company.id)

  if (error) {
    console.error('作業会社の更新に失敗しました', error)
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
    console.error('作業会社の削除に失敗しました', error)
    showMessage('❌ 削除に失敗しました', 'error')
  } else {
    showMessage('✅ 削除しました', 'success')
    window.loadBillingCompanies()
  }
}

window.restoreBillingCompany = async function(id, name) {
  if (!confirm(`${name} を作業会社一覧に戻しますか？`)) return

  const { error } = await supabase
    .from('billing_company_master')
    .update({ is_active: true })
    .eq('id', id)

  if (error) {
    console.error('作業会社の復活に失敗しました', error)
    showMessage('❌ 復活に失敗しました', 'error')
  } else {
    showMessage('✅ 復活しました', 'success')
    window.loadBillingCompanies()
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

function setBillingCompanyFormEnabled(enabled) {
  document.getElementById('new_billing_company_name').disabled = !enabled
  document.getElementById('new_billing_company_order').disabled = !enabled
  document.querySelector('.add-form button').disabled = !enabled
}

window.loadBillingCompanies()
