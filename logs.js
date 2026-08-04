import { supabase } from './supabaseClient.js'
import { requireAuth, ROLES } from './auth.js'
import {
  calculateBillingAmount,
  fillRateTypeSelect,
  isContractRate
} from './rate-utils.js'
import { hasTimeOverlap } from './time-rules.mjs'
import {
  createProductionNumberKey,
  formatProductionNumberLabel,
  getProductionNumberKey,
  isSimilarProductionNumber,
  normalizeProductionNumber
} from './production-number-utils.mjs'

const authContext = await requireAuth([ROLES.ADMIN, ROLES.WORKER])
const RATE_EDIT_ENABLED = false

let logs = []
let editingLog = null
let workerFeatureEnabled = false
let rateFeatureEnabled = false
let billingCompanies = []
let isUpdating = false
let isRegisteringEditSeiban = false
let selectedEditSeiban = null
let editSeibanSearchSeq = 0
const deletingLogIds = new Set()

const today = new Date()
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
document.getElementById('date_from').value = formatDate(firstDay)
document.getElementById('date_to').value = formatDate(today)
hideDisabledRateControls()

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function hideDisabledRateControls() {
  if (RATE_EDIT_ENABLED) return

  const billingSelect = document.getElementById('edit_billing_company')
  const rateSelect = document.getElementById('edit_rate_type')

  if (billingSelect) hideControl(billingSelect)
  if (rateSelect) hideControl(rateSelect)
}

function hideControl(element) {
  element.hidden = true
  element.disabled = true
  element.setAttribute('aria-hidden', 'true')
  element.classList.add('is-hidden')
  element.style.display = 'none'
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

  let query = supabase
    .from('worker_master')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (authContext.isWorker) {
    query = query.eq('id', authContext.profile.worker_id)
  }

  const { data, error } = await query

  if (error || !data) {
    workerFeatureEnabled = false
    group.style.display = 'none'
    return
  }

  workerFeatureEnabled = true
  group.style.display = ''
  select.disabled = authContext.isWorker

  data.forEach(worker => {
    const option = document.createElement('option')
    option.value = worker.id
    option.textContent = worker.name
    select.appendChild(option)
  })

  if (authContext.isWorker) {
    select.value = authContext.profile.worker_id || ''
  }
}

async function checkRateFeature() {
  fillRateTypeSelect(document.getElementById('edit_rate_type'))

  if (!RATE_EDIT_ENABLED) {
    rateFeatureEnabled = false
    hideDisabledRateControls()
    return
  }

  const [{ error: rateError }, { error: logError }] = await Promise.all([
    supabase.from('rate_master').select('id').limit(1),
    supabase.from('work_logs').select('billing_company_id, rate_type, rate_master_id, unit_price, billing_amount').limit(1)
  ])

  rateFeatureEnabled = !rateError && !logError
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

  if (!from || !to || from > to) {
    showMessage('⚠️ 開始日と終了日の範囲を確認してください', 'error')
    return
  }

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

  if (authContext.isWorker) {
    query = query.eq('worker_id', authContext.profile.worker_id)
  }

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

    actions.appendChild(editButton)
    if (authContext.isAdmin) actions.appendChild(deleteButton)
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
  if (deletingLogIds.has(id)) return

  if (!authContext.isAdmin) {
    showMessage('❌ 削除は管理者だけが実行できます', 'error')
    return
  }

  const target = logs.find(log => log.id === id)
  if (!target) return

  if (!confirm(`${createDeleteConfirmText(target)}\n\nこの入力履歴を削除しますか？`)) return

  deletingLogIds.add(id)

  try {
    const { data: deletedLog, error } = await supabase
      .from('work_logs')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error || !deletedLog) {
      console.error('入力履歴の削除に失敗しました', error)
      showMessage('❌ 削除に失敗しました。権限または通信状態を確認してください', 'error')
      return
    }

    if (editingLog?.id === id) {
      window.cancelEdit()
    }

    showMessage(`✅ 削除しました\n${createDeleteConfirmText(target)}`, 'success', 6000)
    await window.loadLogs()
  } catch (error) {
    console.error('入力履歴の削除処理で予期しないエラーが発生しました', error)
    showMessage('❌ 削除処理を完了できませんでした。通信状態を確認してください', 'error')
  } finally {
    deletingLogIds.delete(id)
  }
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
    workerId: authContext.isWorker
      ? authContext.profile.worker_id
      : document.getElementById('filter_worker').value,
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
  let query = supabase
    .from('worker_master')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')

  if (authContext.isWorker) {
    query = query.eq('id', authContext.profile.worker_id)
  }

  const { data } = await query

  const select = document.getElementById('filter_worker')
  select.innerHTML = '<option value="">全作業者</option>'
  if (!data) return

  data.forEach(worker => {
    const option = document.createElement('option')
    option.value = worker.id
    option.textContent = worker.name
    select.appendChild(option)
  })

  if (authContext.isWorker) {
    select.value = authContext.profile.worker_id || ''
    select.disabled = true
  }
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
  const { data } = await fetchActiveSeibans()

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

async function fetchActiveSeibans() {
  const result = await supabase
    .from('seiban_master')
    .select('id, seiban, seiban_key, equipment_name, customer_name, status, is_active')
    .eq('is_active', true)
    .order('seiban')

  if (!isMissingSeibanMetadataColumn(result.error)) return result

  return supabase
    .from('seiban_master')
    .select('id, seiban, equipment_name')
    .order('seiban')
}

function isMissingSeibanMetadataColumn(error) {
  if (!error) return false
  const message = String(error.message || '')
  return error.code === '42703'
    || message.includes('seiban_key')
    || message.includes('customer_name')
    || message.includes('status')
    || message.includes('is_active')
}

async function findActiveSeibanByCode(seiban) {
  const key = createProductionNumberKey(seiban)
  const result = await supabase
    .from('seiban_master')
    .select('id, seiban, seiban_key, equipment_name, customer_name, status, is_active')
    .eq('seiban_key', key)
    .eq('is_active', true)
    .maybeSingle()

  if (!isMissingSeibanMetadataColumn(result.error)) return result

  return supabase
    .from('seiban_master')
    .select('id, seiban, equipment_name')
    .eq('seiban', key)
    .maybeSingle()
}

async function insertActiveSeiban(payload) {
  const normalizedSeiban = normalizeProductionNumber(payload.seiban)
  const metadataPayload = {
    ...payload,
    seiban: normalizedSeiban,
    seiban_key: createProductionNumberKey(normalizedSeiban),
    is_active: true,
    status: authContext.isWorker ? 'pending' : 'confirmed',
    created_by: authContext.session.user.id,
    confirmed_by: authContext.isAdmin ? authContext.session.user.id : null,
    confirmed_at: authContext.isAdmin ? new Date().toISOString() : null
  }

  const result = await supabase
    .from('seiban_master')
    .insert(metadataPayload)
    .select()
    .single()

  if (!isMissingSeibanMetadataColumn(result.error)) return result

  return {
    data: null,
    error: result.error || new Error('生産番号の仮登録にはSUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sqlの実行が必要です')
  }
}

window.searchEditSeiban = async function() {
  const seiban = normalizeProductionNumber(document.getElementById('edit_seiban').value)
  const equipmentInput = document.getElementById('edit_equipment_name')
  const statusEl = document.getElementById('edit_seiban_status')
  const searchSeq = ++editSeibanSearchSeq
  selectedEditSeiban = null

  if (!seiban) {
    equipmentInput.value = ''
    equipmentInput.readOnly = false
    statusEl.textContent = ''
    renderEditSeibanCandidates([])
    setEditRegisterSeibanVisible(false)
    return
  }

  const { data, error } = await fetchEditSeibanCandidates(seiban)
  if (searchSeq !== editSeibanSearchSeq) return

  if (error) {
    console.error('製番の確認に失敗しました', error)
    statusEl.textContent = '製番の確認に失敗しました'
    statusEl.style.color = '#e74c3c'
    renderEditSeibanCandidates([])
    setEditRegisterSeibanVisible(false)
    return
  }

  const exact = findExactSeiban(data, seiban)
  if (exact) {
    selectEditSeiban(exact)
    equipmentInput.readOnly = true
    statusEl.textContent = exact.status === 'pending' ? '未確認の登録済み生産番号です' : '登録済み'
    statusEl.style.color = 'green'
    renderEditSeibanCandidates(data, exact.id)
    setEditRegisterSeibanVisible(false)
  } else {
    equipmentInput.value = ''
    equipmentInput.readOnly = false
    statusEl.textContent = data.length > 0
      ? '似た生産番号があります。候補を確認してください'
      : '未登録の生産番号です。設備名を入力してください'
    statusEl.style.color = '#e74c3c'
    renderEditSeibanCandidates(data)
    setEditRegisterSeibanVisible(true)
  }
}

async function fetchEditSeibanCandidates(seiban) {
  const key = createProductionNumberKey(seiban)
  const result = await supabase
    .from('seiban_master')
    .select('id, seiban, seiban_key, equipment_name, customer_name, status, is_active')
    .order('seiban')
    .limit(300)

  if (result.error && isMissingSeibanMetadataColumn(result.error)) {
    const fallback = await supabase
      .from('seiban_master')
      .select('id, seiban, equipment_name, is_active')
      .order('seiban')
      .limit(300)
    if (fallback.error || !fallback.data) return fallback
    return { data: filterSeibanCandidates(fallback.data, key), error: null }
  }

  if (result.error || !result.data) return result
  return { data: filterSeibanCandidates(result.data, key), error: null }
}

function filterSeibanCandidates(rows, key) {
  return rows
    .filter(row => row.is_active !== false)
    .map(row => ({ ...row, seiban_key: getProductionNumberKey(row) }))
    .filter(row => (
      row.seiban_key === key
      || row.seiban_key.includes(key)
      || key.includes(row.seiban_key)
      || isSimilarProductionNumber(key, row.seiban_key)
    ))
    .slice(0, 8)
}

function findExactSeiban(rows, seiban) {
  const key = createProductionNumberKey(seiban)
  return rows.find(row => getProductionNumberKey(row) === key) || null
}

function selectEditSeiban(row) {
  selectedEditSeiban = row
  document.getElementById('edit_seiban').value = normalizeProductionNumber(row.seiban)
  document.getElementById('edit_equipment_name').value = row.equipment_name || ''
}

function renderEditSeibanCandidates(rows, selectedId = null) {
  const container = document.getElementById('edit_seiban_suggestions')
  if (!container) return
  container.innerHTML = ''

  if (!rows || rows.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'seiban-suggestion-empty'
    empty.textContent = '一致する登録済み生産番号はありません'
    container.appendChild(empty)
    return
  }

  rows.forEach(row => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `seiban-suggestion${row.id === selectedId ? ' is-selected' : ''}`
    button.textContent = formatProductionNumberLabel(row)
    button.addEventListener('click', () => {
      selectEditSeiban(row)
      document.getElementById('edit_equipment_name').readOnly = true
      document.getElementById('edit_seiban_status').textContent = row.status === 'pending'
        ? '未確認の登録済み生産番号です'
        : '登録済み'
      document.getElementById('edit_seiban_status').style.color = 'green'
      setEditRegisterSeibanVisible(false)
      renderEditSeibanCandidates(rows, row.id)
    })
    container.appendChild(button)
  })
}

function setEditRegisterSeibanVisible(visible) {
  const button = document.getElementById('edit_register_seiban_button')
  if (!button) return
  button.hidden = !visible
  button.disabled = isRegisteringEditSeiban
}

async function registerEditSeibanFromInput() {
  if (isRegisteringEditSeiban) return

  const seiban = normalizeProductionNumber(document.getElementById('edit_seiban').value)
  const equipmentName = document.getElementById('edit_equipment_name').value.trim()

  if (!seiban) {
    showMessage('⚠️ 生産番号を入力してください', 'error')
    return
  }

  if (!equipmentName) {
    showMessage('⚠️ 新しい生産番号の設備名を入力してください', 'error')
    return
  }

  isRegisteringEditSeiban = true
  setEditRegisterSeibanVisible(true)

  try {
    const { data: candidates, error } = await fetchEditSeibanCandidates(seiban)
    if (error) {
      console.error('生産番号の確認に失敗しました', error)
      showMessage('❌ 生産番号の確認に失敗しました', 'error')
      return
    }

    const exact = findExactSeiban(candidates || [], seiban)
    if (exact) {
      selectEditSeiban(exact)
      showMessage('✅ 同じ生産番号が登録済みだったため、既存の生産番号を選択しました', 'success')
      setEditRegisterSeibanVisible(false)
      return
    }

    const similarText = (candidates || []).length
      ? `\n\n似た生産番号:\n${candidates.map(row => `・${formatProductionNumberLabel(row)}`).join('\n')}`
      : ''
    const ok = confirm([
      '新しい生産番号として登録しますか？',
      `生産番号：${seiban}`,
      '似た生産番号が登録されていないか、もう一度確認してください。',
      similarText
    ].filter(Boolean).join('\n'))

    if (!ok) {
      showMessage('⚠️ 生産番号の登録を中止しました', 'error')
      return
    }

    const { data: newSeiban, error: insertError } = await insertActiveSeiban({
      seiban,
      equipment_name: equipmentName
    })

    if (insertError || !newSeiban) {
      if (insertError?.code === '23505') {
        const { data: existing } = await findActiveSeibanByCode(seiban)
        if (existing) {
          selectEditSeiban(existing)
          showMessage('✅ 同じ生産番号が登録済みだったため、既存の生産番号を選択しました', 'success')
          return
        }
      }

      console.error('生産番号の登録に失敗しました', insertError)
      showMessage('❌ 生産番号の登録に失敗しました。DB設定または通信状態を確認してください', 'error')
      return
    }

    selectEditSeiban(newSeiban)
    document.getElementById('edit_equipment_name').readOnly = true
    document.getElementById('edit_seiban_status').textContent = authContext.isWorker
      ? '未確認の生産番号として登録しました'
      : '確認済み生産番号として登録しました'
    document.getElementById('edit_seiban_status').style.color = 'green'
    setEditRegisterSeibanVisible(false)
    showMessage('✅ 生産番号を登録しました。このまま履歴を更新できます', 'success')
  } finally {
    isRegisteringEditSeiban = false
    const button = document.getElementById('edit_register_seiban_button')
    if (button) button.disabled = false
  }
}

function calcEditActualTime() {
  const start = document.getElementById('edit_start_time').value
  const end = document.getElementById('edit_end_time').value
  const break1 = Number(document.getElementById('edit_break1').value || 0)
  const break2 = Number(document.getElementById('edit_break2').value || 0)

  if (!start || !end) return

  if (!Number.isInteger(break1) || !Number.isInteger(break2) || break1 < 0 || break2 < 0) {
    document.getElementById('edit_actual_time').textContent = '⚠️ 休憩時間を確認してください'
    return
  }

  const actual = timeToMinutes(end) - timeToMinutes(start) - break1 - break2
  const actualEl = document.getElementById('edit_actual_time')

  if (actual <= 0) {
    actualEl.textContent = '⚠️ 時間を確認してください'
    return
  }

  actualEl.textContent = minutesToHM(actual)
}

window.updateLog = async function() {
  if (isUpdating) return

  isUpdating = true
  setUpdateInProgress(true)

  try {
    await updateLogOnce()
  } catch (error) {
    console.error('入力履歴の更新処理で予期しないエラーが発生しました', error)
    showMessage('❌ 更新処理を完了できませんでした。通信状態を確認して、もう一度お試しください', 'error')
  } finally {
    isUpdating = false
    setUpdateInProgress(false)
  }
}

async function updateLogOnce() {
  if (!editingLog) return

  const workDate = document.getElementById('edit_work_date').value
  const seiban = normalizeProductionNumber(document.getElementById('edit_seiban').value)
  const equipmentName = document.getElementById('edit_equipment_name').value.trim()
  const workTypeId = document.getElementById('edit_work_type').value
  const startTime = document.getElementById('edit_start_time').value
  const endTime = document.getElementById('edit_end_time').value
  const break1 = Number(document.getElementById('edit_break1').value || 0)
  const break2 = Number(document.getElementById('edit_break2').value || 0)
  const note = document.getElementById('edit_note').value.trim()
  const workerId = authContext.isWorker
    ? authContext.profile.worker_id
    : document.getElementById('edit_worker').value
  const billingCompanyId = document.getElementById('edit_billing_company').value
  const rateType = document.getElementById('edit_rate_type').value

  if (!workDate || !seiban || !equipmentName || !workTypeId || !startTime || !endTime) {
    showMessage('⚠️ 必須項目を入力してください', 'error')
    return
  }

  if (seiban.length > 100 || equipmentName.length > 200 || note.length > 1000) {
    showMessage('⚠️ 製番・設備名・備考の文字数を確認してください', 'error')
    return
  }

  if (workerFeatureEnabled && !workerId) {
    showMessage('⚠️ 作業者を選択してください', 'error')
    return
  }

  if (
    !isValidTime(startTime)
    || !isValidTime(endTime)
    || !Number.isInteger(break1)
    || !Number.isInteger(break2)
    || break1 < 0
    || break2 < 0
    || break1 > 1440
    || break2 > 1440
  ) {
    showMessage('⚠️ 開始・終了・休憩時間を正しく入力してください', 'error')
    return
  }

  const actualMinutes = timeToMinutes(endTime) - timeToMinutes(startTime) - break1 - break2
  if (actualMinutes <= 0) {
    showMessage('⚠️ 終了時間は開始時間より後にし、休憩時間は勤務時間より短くしてください', 'error')
    return
  }

  const hasOverlap = await hasOverlappingTimeLog(workerId, workDate, startTime, endTime, editingLog.id)
  if (hasOverlap === null) {
    showMessage('❌ 時間の重複確認に失敗したため更新できません。通信状態を確認してください', 'error')
    return
  }

  if (hasOverlap && !confirm('同じ作業者・同じ日付で時間が重なる入力があります。このまま更新しますか？')) {
    showMessage('⚠️ 更新を中止しました', 'error')
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

  const { data: updatedLog, error } = await supabase
    .from('work_logs')
    .update(updateData)
    .eq('id', editingLog.id)
    .select('id')
    .maybeSingle()

  if (error || !updatedLog) {
    console.error('入力履歴の更新に失敗しました', error)
    showMessage('❌ 更新に失敗しました。権限または通信状態を確認してください', 'error')
    return
  }

  showMessage(`✅ 更新しました\n${updatedText}`, 'success', 6000)
  editingLog = null
  document.getElementById('edit_panel').classList.remove('active')
  window.loadLogs()
}

function setUpdateInProgress(inProgress) {
  const button = document.getElementById('update_button')
  if (!button) return
  button.disabled = inProgress
  button.textContent = inProgress ? '更新中...' : '更新する'
}

function isValidTime(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false
  return Number.isFinite(timeToMinutes(value))
}

async function hasOverlappingTimeLog(workerId, workDate, startTime, endTime, excludedId) {
  if (!workerFeatureEnabled || !workerId) return false

  let query = supabase
    .from('work_logs')
    .select('id, start_time, end_time')
    .eq('work_date', workDate)
    .eq('worker_id', workerId)

  if (excludedId) query = query.neq('id', excludedId)

  const { data, error } = await query
  if (error || !data) {
    console.error('重複確認に失敗しました', error)
    return null
  }

  return data.some(log => (
    hasTimeOverlap(startTime, endTime, log.start_time, log.end_time)
  ))
}

async function findOrCreateSeiban(seiban, equipmentName) {
  const { data: existing, error: findError } = await findActiveSeibanByCode(seiban)

  if (findError) {
    console.error('製番の確認に失敗しました', findError)
    showMessage('❌ 製番の確認に失敗しました', 'error')
    return null
  }

  if (existing) return existing.id

  showMessage('⚠️ 未登録の生産番号です。候補を確認し、「新しい生産番号として登録」を押してから更新してください', 'error')
  return null
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
document.getElementById('edit_seiban').addEventListener('blur', () => {
  const input = document.getElementById('edit_seiban')
  input.value = normalizeProductionNumber(input.value)
})
document.getElementById('edit_register_seiban_button')?.addEventListener('click', registerEditSeibanFromInput)
await loadWorkTypes()
await loadWorkers()
await checkRateFeature()
await loadFilterOptions()
window.loadLogs()
