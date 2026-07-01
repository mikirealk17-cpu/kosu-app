import { supabase } from './supabaseClient.js'
import {
  calculateBillingAmount,
  fillRateTypeSelect,
  isContractRate
} from './rate-utils.js'

let logs = []
let editingLog = null
let workerFeatureEnabled = false
let rateFeatureEnabled = false
let billingCompanies = []

const today = new Date()
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
document.getElementById('date_from').value = formatDate(firstDay)
document.getElementById('date_to').value = formatDate(today)

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTime(time) {
  return time ? time.slice(0, 5) : ''
}

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToHM(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}時間${m}分`
}

function showMessage(text, type, duration = 3000) {
  const el = document.getElementById('message')
  el.textContent = text
  el.className = type
  setTimeout(() => {
    el.textContent = ''
    el.className = ''
  }, duration)
}

async function loadWorkTypes() {
  const { data, error } = await supabase
    .from('work_type_master')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  const select = document.getElementById('edit_work_type')
  select.innerHTML = ''

  if (error || !data) {
    console.error('作業内容の取得に失敗しました', error)
    showMessage('❌ 作業内容を読み込めませんでした', 'error')
    return
  }

  data.forEach(type => {
    const option = document.createElement('option')
    option.value = type.id
    option.textContent = type.name
    select.appendChild(option)
  })
}

async function loadWorkers() {
  const select = document.getElementById('edit_worker')
  const group = document.getElementById('edit_worker_group')
  select.innerHTML = ''

  const emptyOption = document.createElement('option')
  emptyOption.value = ''
  emptyOption.textContent = '作業者を選択'
  select.appendChild(emptyOption)

  const { data, error } = await supabase
    .from('worker_master')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (error || !data) {
    workerFeatureEnabled = false
    group.style.display = 'none'
    return
  }

  workerFeatureEnabled = true
  group.style.display = ''

  data.forEach(worker => {
    const option = document.createElement('option')
    option.value = worker.id
    option.textContent = worker.name
    select.appendChild(option)
  })
}

async function checkRateFeature() {
  fillRateTypeSelect(document.getElementById('edit_rate_type'))

  const [{ error: rateError }, { error: logError }] = await Promise.all([
    supabase.from('rate_master').select('id').limit(1),
    supabase.from('work_logs').select('billing_company_id, rate_type, rate_master_id, unit_price, billing_amount').limit(1)
  ])

  rateFeatureEnabled = !rateError && !logError
  document.getElementById('edit_rate_group').style.display = rateFeatureEnabled ? '' : 'none'
  document.getElementById('edit_rate_type_group').style.display = rateFeatureEnabled ? '' : 'none'

  if (!rateFeatureEnabled) return

  await loadBillingCompanyOptions()
}

async function loadBillingCompanyOptions() {
  const select = document.getElementById('edit_billing_company')
  select.innerHTML = '<option value="">元請けを選択</option>'

  const { data, error } = await supabase
    .from('billing_company_master')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')
    .order('name')

  if (error || !data) {
    console.error('元請け一覧の取得に失敗しました', error)
    return
  }

  billingCompanies = data
  data
    .forEach(company => {
      const option = document.createElement('option')
      option.value = company.id
      option.textContent = company.name
      select.appendChild(option)
    })
}

window.loadLogs = async function() {
  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value
  const workerSelect = workerFeatureEnabled ? 'worker_id,' : ''
  const rateSelect = rateFeatureEnabled
    ? 'billing_company_id, rate_type, rate_master_id, unit_price, billing_amount,'
    : ''
  const filters = getFilters()

  let query = supabase
    .from('work_logs')
    .select(`
      id,
      work_date,
      seiban_id,
      work_type_id,
      ${workerSelect}
      ${rateSelect}
      start_time,
      end_time,
      break1_minutes,
      break2_minutes,
      actual_minutes,
      note,
      seiban_master (
        seiban,
        equipment_name
      ),
      work_type_master (
        name
      )
    `)
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false })

  query = applyFilters(query, filters)

  const { data, error } = await query

  if (error || !data) {
    console.error('入力履歴の取得に失敗しました', error)
    if (error?.code === '42703' && workerFeatureEnabled) {
      workerFeatureEnabled = false
      document.getElementById('edit_worker_group').style.display = 'none'
      window.loadLogs()
      return
    }
    showMessage('❌ 入力履歴を読み込めませんでした', 'error')
    return
  }

  logs = data
  renderLogs()
}

function renderLogs() {
  const list = document.getElementById('log_list')
  list.innerHTML = ''

  if (logs.length === 0) {
    list.appendChild(createListMessage('この期間の入力履歴はありません'))
    return
  }

  logs.forEach(log => {
    const item = document.createElement('div')
    item.className = 'log-item'

    const main = document.createElement('div')
    main.className = 'log-main'
    main.textContent = `${log.work_date} ${log.seiban_master?.seiban || '製番不明'}`

    const sub = document.createElement('div')
    sub.className = 'log-sub'
    sub.textContent = [
      log.seiban_master?.equipment_name || '設備名不明',
      log.work_type_master?.name || '作業内容不明',
      `${formatTime(log.start_time)}-${formatTime(log.end_time)}`,
      minutesToHM(log.actual_minutes || 0)
    ].join(' / ')

    const actions = document.createElement('div')
    actions.className = 'log-actions'

    const editButton = document.createElement('button')
    editButton.textContent = '編集する'
    editButton.addEventListener('click', () => startEdit(log.id))

    const deleteButton = document.createElement('button')
    deleteButton.className = 'danger-btn'
    deleteButton.textContent = '削除する'
    deleteButton.addEventListener('click', () => deleteLog(log.id))

    actions.append(editButton, deleteButton)
    item.append(main, sub, actions)
    list.appendChild(item)
  })
}

function createListMessage(text) {
  const message = document.createElement('p')
  message.className = 'list-message'
  message.textContent = text
  return message
}

function startEdit(id) {
  editingLog = logs.find(log => log.id === id)
  if (!editingLog) return

  document.getElementById('edit_work_date').value = editingLog.work_date
  document.getElementById('edit_seiban').value = editingLog.seiban_master?.seiban || ''
  document.getElementById('edit_equipment_name').value = editingLog.seiban_master?.equipment_name || ''
  document.getElementById('edit_work_type').value = editingLog.work_type_id || ''
  document.getElementById('edit_start_time').value = formatTime(editingLog.start_time)
  document.getElementById('edit_end_time').value = formatTime(editingLog.end_time)
  document.getElementById('edit_break1').value = editingLog.break1_minutes || 0
  document.getElementById('edit_break2').value = editingLog.break2_minutes || 0
  document.getElementById('edit_note').value = editingLog.note || ''

  if (workerFeatureEnabled && editingLog.worker_id) {
    document.getElementById('edit_worker').value = editingLog.worker_id
  }

  if (rateFeatureEnabled) {
    loadBillingCompanyOptions().then(() => {
      document.getElementById('edit_billing_company').value = editingLog.billing_company_id || ''
    })
    document.getElementById('edit_rate_type').value = editingLog.rate_type || ''
  }

  document.getElementById('edit_panel').classList.add('active')
  calcEditActualTime()
  document.getElementById('edit_panel').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

window.cancelEdit = function() {
  editingLog = null
  document.getElementById('edit_panel').classList.remove('active')
}

async function deleteLog(id) {
  const target = logs.find(log => log.id === id)
  if (!target) return

  if (!confirm(`${createDeleteConfirmText(target)}\n\nこの入力履歴を削除しますか？`)) return

  const { error } = await supabase
    .from('work_logs')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('入力履歴の削除に失敗しました', error)
    showMessage('❌ 削除に失敗しました', 'error')
    return
  }

  if (editingLog?.id === id) {
    window.cancelEdit()
  }

  showMessage(`✅ 削除しました\n${createDeleteConfirmText(target)}`, 'success', 6000)
  window.loadLogs()
}

function createDeleteConfirmText(log) {
  return [
    `日付: ${log.work_date}`,
    `作業者: ${getWorkerName(log.worker_id)}`,
    `製番: ${log.seiban_master?.seiban || '製番不明'}`,
    `設備名: ${log.seiban_master?.equipment_name || '設備名不明'}`,
    `時間: ${formatTime(log.start_time)}-${formatTime(log.end_time)}`,
    `工数: ${minutesToHM(log.actual_minutes || 0)}`
  ].join('\n')
}

function getWorkerName(workerId) {
  const selects = [
    document.getElementById('filter_worker'),
    document.getElementById('edit_worker')
  ].filter(Boolean)
  const option = selects
    .flatMap(select => [...select.options])
    .find(item => item.value === workerId)
  return option?.textContent || '作業者未設定'
}

function getSelectText(id) {
  const select = document.getElementById(id)
  return select.options[select.selectedIndex]?.textContent || ''
}

function createUpdatedConfirmText(data) {
  return [
    `日付: ${data.workDate}`,
    `作業者: ${getWorkerName(data.workerId)}`,
    `製番: ${data.seiban}`,
    `設備名: ${data.equipmentName}`,
    `作業内容: ${data.workTypeName}`,
    `時間: ${data.startTime}-${data.endTime}`,
    `工数: ${minutesToHM(data.actualMinutes)}`
  ].join('\n')
}

function getFilters() {
  return {
    workerId: document.getElementById('filter_worker').value,
    workTypeId: document.getElementById('filter_work_type').value,
    seibanId: document.getElementById('filter_seiban').value
  }
}

function applyFilters(query, filters) {
  if (filters.workerId) query = query.eq('worker_id', filters.workerId)
  if (filters.workTypeId) query = query.eq('work_type_id', filters.workTypeId)
  if (filters.seibanId) query = query.eq('seiban_id', filters.seibanId)
  return query
}

async function loadFilterOptions() {
  await Promise.all([
    loadWorkerFilterOptions(),
    loadWorkTypeFilterOptions(),
    loadSeibanFilterOptions()
  ])
}

async function loadWorkerFilterOptions() {
  const { data } = await supabase
    .from('worker_master')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')

  const select = document.getElementById('filter_worker')
  select.innerHTML = '<option value="">全作業者</option>'
  if (!data) return

  data.forEach(worker => {
    const option = document.createElement('option')
    option.value = worker.id
    option.textContent = worker.name
    select.appendChild(option)
  })
}

async function loadWorkTypeFilterOptions() {
  const { data } = await supabase
    .from('work_type_master')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')

  const select = document.getElementById('filter_work_type')
  select.innerHTML = '<option value="">全作業内容</option>'
  if (!data) return

  data.forEach(type => {
    const option = document.createElement('option')
    option.value = type.id
    option.textContent = type.name
    select.appendChild(option)
  })
}

async function loadSeibanFilterOptions() {
  const { data } = await supabase
    .from('seiban_master')
    .select('id, seiban, equipment_name')
    .order('seiban')

  const select = document.getElementById('filter_seiban')
  select.innerHTML = '<option value="">全製番</option>'
  if (!data) return

  data.forEach(item => {
    const option = document.createElement('option')
    option.value = item.id
    option.textContent = `${item.seiban} ${item.equipment_name || ''}`.trim()
    select.appendChild(option)
  })
}

window.searchEditSeiban = async function() {
  const seiban = document.getElementById('edit_seiban').value.trim()
  const equipmentInput = document.getElementById('edit_equipment_name')
  const statusEl = document.getElementById('edit_seiban_status')

  if (!seiban) {
    equipmentInput.value = ''
    equipmentInput.readOnly = false
    statusEl.textContent = ''
    return
  }

  const { data, error } = await supabase
    .from('seiban_master')
    .select('*')
    .eq('seiban', seiban)
    .maybeSingle()

  if (data) {
    equipmentInput.value = data.equipment_name
    equipmentInput.readOnly = true
    statusEl.textContent = '登録済み'
    statusEl.style.color = 'green'
  } else if (error) {
    console.error('製番の確認に失敗しました', error)
    statusEl.textContent = '製番の確認に失敗しました'
    statusEl.style.color = '#e74c3c'
  } else {
    equipmentInput.value = ''
    equipmentInput.readOnly = false
    statusEl.textContent = '未登録の製番です。設備名を入力してください'
    statusEl.style.color = '#e74c3c'
  }
}

function calcEditActualTime() {
  const start = document.getElementById('edit_start_time').value
  const end = document.getElementById('edit_end_time').value
  const break1 = parseInt(document.getElementById('edit_break1').value) || 0
  const break2 = parseInt(document.getElementById('edit_break2').value) || 0

  if (!start || !end) return

  const actual = timeToMinutes(end) - timeToMinutes(start) - break1 - break2
  const actualEl = document.getElementById('edit_actual_time')

  if (actual <= 0) {
    actualEl.textContent = '⚠️ 時間を確認してください'
    return
  }

  actualEl.textContent = minutesToHM(actual)
}

window.updateLog = async function() {
  if (!editingLog) return

  const workDate = document.getElementById('edit_work_date').value
  const seiban = document.getElementById('edit_seiban').value.trim()
  const equipmentName = document.getElementById('edit_equipment_name').value.trim()
  const workTypeId = document.getElementById('edit_work_type').value
  const startTime = document.getElementById('edit_start_time').value
  const endTime = document.getElementById('edit_end_time').value
  const break1 = parseInt(document.getElementById('edit_break1').value) || 0
  const break2 = parseInt(document.getElementById('edit_break2').value) || 0
  const note = document.getElementById('edit_note').value.trim()
  const workerId = document.getElementById('edit_worker').value
  const billingCompanyId = document.getElementById('edit_billing_company').value
  const rateType = document.getElementById('edit_rate_type').value

  if (!workDate || !seiban || !equipmentName || !workTypeId || !startTime || !endTime) {
    showMessage('⚠️ 必須項目を入力してください', 'error')
    return
  }

  const actualMinutes = timeToMinutes(endTime) - timeToMinutes(startTime) - break1 - break2
  if (actualMinutes <= 0) {
    showMessage('⚠️ 開始・終了・休憩時間を確認してください', 'error')
    return
  }

  const seibanId = await findOrCreateSeiban(seiban, equipmentName)
  if (!seibanId) return

  let appliedRate = null
  if (rateFeatureEnabled) {
    if (!billingCompanyId || !rateType || !workerId) {
      showMessage('⚠️ 元請け・作業者・単価区分を入力してください', 'error')
      return
    }

    appliedRate = await findApplicableRate({
      billingCompanyId,
      workerId,
      seibanId,
      rateType,
      actualMinutes
    })
    if (!appliedRate) return
  }

  const updateData = {
    work_date: workDate,
    seiban_id: seibanId,
    work_type_id: workTypeId,
    start_time: startTime,
    end_time: endTime,
    break1_minutes: break1,
    break2_minutes: break2,
    actual_minutes: actualMinutes,
    note,
    updated_at: new Date().toISOString()
  }

  if (workerFeatureEnabled) {
    updateData.worker_id = workerId || null
  }

  if (rateFeatureEnabled && appliedRate) {
    updateData.billing_company_id = billingCompanyId
    updateData.rate_type = rateType
    updateData.rate_master_id = appliedRate.id
    updateData.unit_price = appliedRate.amount
    updateData.billing_amount = appliedRate.billingAmount
  }

  const updatedText = createUpdatedConfirmText({
    workDate,
    workerId,
    seiban,
    equipmentName,
    workTypeName: getSelectText('edit_work_type'),
    startTime,
    endTime,
    actualMinutes
  })

  const { error } = await supabase
    .from('work_logs')
    .update(updateData)
    .eq('id', editingLog.id)

  if (error) {
    console.error('入力履歴の更新に失敗しました', error)
    showMessage('❌ 更新に失敗しました', 'error')
    return
  }

  showMessage(`✅ 更新しました\n${updatedText}`, 'success', 6000)
  editingLog = null
  document.getElementById('edit_panel').classList.remove('active')
  window.loadLogs()
}

async function findOrCreateSeiban(seiban, equipmentName) {
  const { data: existing, error: findError } = await supabase
    .from('seiban_master')
    .select('id')
    .eq('seiban', seiban)
    .maybeSingle()

  if (findError) {
    console.error('製番の確認に失敗しました', findError)
    showMessage('❌ 製番の確認に失敗しました', 'error')
    return null
  }

  if (existing) return existing.id

  const { data: newSeiban, error: insertError } = await supabase
    .from('seiban_master')
    .insert({ seiban, equipment_name: equipmentName })
    .select()
    .single()

  if (insertError || !newSeiban) {
    console.error('製番の登録に失敗しました', insertError)
    showMessage('❌ 製番の登録に失敗しました', 'error')
    return null
  }

  return newSeiban.id
}

async function findApplicableRate({ billingCompanyId, workerId, seibanId, rateType, actualMinutes }) {
  let query = supabase
    .from('rate_master')
    .select('id, amount')
    .eq('is_active', true)
    .eq('rate_type', rateType)
    .eq('billing_company_id', billingCompanyId)

  if (isContractRate(rateType)) {
    query = query.eq('seiban_id', seibanId).is('worker_id', null)
  } else {
    query = query.eq('worker_id', workerId).is('seiban_id', null)
  }

  const { data, error } = await query

  if (error || !data) {
    console.error('単価確認に失敗しました', error)
    showMessage('❌ 単価確認に失敗しました', 'error')
    return null
  }

  if (data.length === 0) {
    const message = isContractRate(rateType)
      ? '⚠️ 請負単価が未設定です。元請け・製番・単価区分を確認してください'
      : '⚠️ 単価が未設定です。元請け・作業者・単価区分を確認してください'
    showMessage(message, 'error')
    return null
  }

  if (data.length > 1) {
    showMessage('⚠️ 単価マスタが重複しています。単価マスタを確認してください', 'error')
    return null
  }

  const rate = data[0]
  return {
    id: rate.id,
    amount: rate.amount,
    billingAmount: calculateBillingAmount(rateType, actualMinutes, rate.amount)
  }
}

document.getElementById('edit_start_time').addEventListener('input', calcEditActualTime)
document.getElementById('edit_end_time').addEventListener('input', calcEditActualTime)
document.getElementById('edit_break1').addEventListener('input', calcEditActualTime)
document.getElementById('edit_break2').addEventListener('input', calcEditActualTime)
await loadWorkTypes()
await loadWorkers()
await checkRateFeature()
await loadFilterOptions()
window.loadLogs()
