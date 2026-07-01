import { supabase } from './supabaseClient.js'
import { fillRateTypeSelect, getRateTypeLabel, isContractRate } from './rate-utils.js'

let billingCompanies = []
let workers = []
let seibans = []

window.loadRates = async function() {
  await loadMasterOptions()
  await loadRateList()
}

async function loadMasterOptions() {
  fillRateTypeSelect(document.getElementById('new_rate_type'))

  const [billingRes, workerRes, seibanRes] = await Promise.all([
    supabase.from('billing_company_master').select('id, name').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('worker_master').select('id, name').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('seiban_master').select('id, seiban, equipment_name').order('seiban')
  ])

  if (billingRes.error || workerRes.error || seibanRes.error) {
    console.error('単価管理マスタの取得に失敗しました', billingRes.error || workerRes.error || seibanRes.error)
    showMessage('❌ 単価管理に必要なDB設定が未完了です', 'error')
    setRateFormEnabled(false)
    return
  }

  billingCompanies = billingRes.data || []
  workers = workerRes.data || []
  seibans = seibanRes.data || []

  setRateFormEnabled(true)
  fillBillingSelect()
  fillWorkerSelect()
  fillSeibanSelect()
  updateRateTargetFields()
}

async function loadRateList() {
  const { data, error } = await supabase
    .from('rate_master')
    .select(`
      *,
      billing_company_master (name),
      worker_master (name),
      seiban_master (seiban, equipment_name)
    `)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })

  const list = document.getElementById('rate_list')
  list.innerHTML = ''

  if (error || !data) {
    console.error('単価一覧の取得に失敗しました', error)
    const text = error?.code === 'PGRST205'
      ? 'Supabase側にrate_masterテーブルがありません'
      : '読み込みに失敗しました'
    list.appendChild(createListMessage(text))
    setRateFormEnabled(false)
    return
  }

  if (data.length === 0) {
    list.appendChild(createListMessage('まだ単価が登録されていません'))
    return
  }

  data.forEach(rate => {
    const item = document.createElement('div')
    item.className = 'worker-item'

    const main = document.createElement('span')
    main.className = 'worker-name'
    main.textContent = rate.billing_company_master?.name || '元請け不明'

    const status = document.createElement('span')
    status.className = rate.is_active ? 'worker-status active' : 'worker-status inactive'
    status.textContent = rate.is_active ? '使用中' : '非表示'

    const target = isContractRate(rate.rate_type)
      ? `製番: ${rate.seiban_master?.seiban || '製番不明'}`
      : `作業者: ${rate.worker_master?.name || '作業者不明'}`

    const sub = document.createElement('span')
    sub.className = 'log-sub'
    sub.textContent = `${getRateTypeLabel(rate.rate_type)} / ${target} / ${Number(rate.amount).toLocaleString()}円`

    const text = document.createElement('div')
    text.className = 'worker-text'
    text.append(main, status, sub)

    const actions = document.createElement('div')
    actions.className = 'worker-actions'

    if (rate.is_active) {
      const editButton = document.createElement('button')
      editButton.className = 'icon-btn edit-btn'
      editButton.textContent = '金額編集'
      editButton.addEventListener('click', () => editRateAmount(rate))

      const deleteButton = document.createElement('button')
      deleteButton.className = 'icon-btn delete-btn'
      deleteButton.textContent = '削除'
      deleteButton.addEventListener('click', () => deleteRate(rate.id))

      actions.append(editButton, deleteButton)
    } else {
      const restoreButton = document.createElement('button')
      restoreButton.className = 'icon-btn restore-btn'
      restoreButton.textContent = '復活'
      restoreButton.addEventListener('click', () => restoreRate(rate.id))

      actions.appendChild(restoreButton)
    }

    item.append(text, actions)
    list.appendChild(item)
  })
}

window.addRate = async function() {
  const rateType = document.getElementById('new_rate_type').value
  const billingCompanyId = document.getElementById('new_rate_billing').value
  const workerId = document.getElementById('new_rate_worker').value
  const seibanId = document.getElementById('new_rate_seiban').value
  const amount = Number(document.getElementById('new_rate_amount').value)

  if (!rateType || !billingCompanyId || !amount) {
    showMessage('⚠️ 元請け・単価区分・金額を入力してください', 'error')
    return
  }

  if (!isContractRate(rateType) && !workerId) {
    showMessage('⚠️ 時間単価・固定単価では作業者を選択してください', 'error')
    return
  }

  if (isContractRate(rateType) && !seibanId) {
    showMessage('⚠️ 請負単価では製番を選択してください', 'error')
    return
  }

  const payload = {
    rate_type: rateType,
    billing_company_id: billingCompanyId,
    worker_id: isContractRate(rateType) ? null : workerId,
    seiban_id: isContractRate(rateType) ? seibanId : null,
    amount,
    is_active: true
  }

  const { error } = await supabase
    .from('rate_master')
    .insert(payload)

  if (error) {
    console.error('単価の追加に失敗しました', error)
    showMessage('❌ 追加に失敗しました。同じ条件の単価が既にあるかもしれません', 'error')
    return
  }

  showMessage('✅ 追加しました', 'success')
  document.getElementById('new_rate_amount').value = ''
  window.loadRates()
}

window.editRateAmount = async function(rate) {
  const amountText = prompt('新しい金額を入力してください', rate.amount)
  if (amountText === null) return

  const amount = Number(amountText)
  if (!amount && amount !== 0) {
    showMessage('⚠️ 金額を数字で入力してください', 'error')
    return
  }

  const { error } = await supabase
    .from('rate_master')
    .update({ amount, updated_at: new Date().toISOString() })
    .eq('id', rate.id)

  if (error) {
    console.error('単価の更新に失敗しました', error)
    showMessage('❌ 更新に失敗しました', 'error')
    return
  }

  showMessage('✅ 更新しました', 'success')
  window.loadRates()
}

window.deleteRate = async function(id) {
  if (!confirm('この単価を非表示にしますか？\n\n過去の工数データに保存済みの単価は残ります。')) return

  const { error } = await supabase
    .from('rate_master')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('単価の削除に失敗しました', error)
    showMessage('❌ 削除に失敗しました', 'error')
    return
  }

  showMessage('✅ 削除しました', 'success')
  window.loadRates()
}

window.restoreRate = async function(id) {
  if (!confirm('この単価を復活しますか？\n\n同じ条件の単価がある場合は失敗します。')) return

  const { error } = await supabase
    .from('rate_master')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('単価の復活に失敗しました', error)
    showMessage('❌ 復活に失敗しました。同じ条件の単価が使用中かもしれません', 'error')
    return
  }

  showMessage('✅ 復活しました', 'success')
  window.loadRates()
}

function fillBillingSelect() {
  const select = document.getElementById('new_rate_billing')
  select.innerHTML = '<option value="">元請けを選択</option>'

  billingCompanies
    .forEach(company => {
      const option = document.createElement('option')
      option.value = company.id
      option.textContent = company.name
      select.appendChild(option)
    })
}

function fillWorkerSelect() {
  const select = document.getElementById('new_rate_worker')
  select.innerHTML = '<option value="">作業者を選択</option>'
  workers.forEach(worker => {
    const option = document.createElement('option')
    option.value = worker.id
    option.textContent = worker.name
    select.appendChild(option)
  })
}

function fillSeibanSelect() {
  const select = document.getElementById('new_rate_seiban')
  select.innerHTML = '<option value="">製番を選択</option>'
  seibans.forEach(item => {
    const option = document.createElement('option')
    option.value = item.id
    option.textContent = `${item.seiban} ${item.equipment_name || ''}`.trim()
    select.appendChild(option)
  })
}

function updateRateTargetFields() {
  const rateType = document.getElementById('new_rate_type').value
  const contract = isContractRate(rateType)
  document.getElementById('new_rate_worker').disabled = contract
  document.getElementById('new_rate_seiban').disabled = !contract
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

function setRateFormEnabled(enabled) {
  document.querySelectorAll('.rate-form input, .rate-form select, .rate-form button').forEach(el => {
    el.disabled = !enabled
  })
}

document.getElementById('new_rate_type').addEventListener('change', updateRateTargetFields)

window.loadRates()
