import { supabase } from './supabaseClient.js'
import {
  calculateBillingAmount,
  fillRateTypeSelect,
  isContractRate
} from './rate-utils.js'

const BILLING_INPUT_ENABLED = false
const RATE_INPUT_ENABLED = false

let workerFeatureEnabled = false
let billingCompanyFeatureEnabled = false
let rateFeatureEnabled = false
let messageTimer = null
const LAST_BILLING_COMPANY_KEY_PREFIX = 'kosu_last_billing_company_'

// 今日の日付をセットします。toISOString()はUTC基準なので、日本時間では日付がずれることがあります。
document.getElementById('work_date').value = formatDate(new Date())
hideDisabledBillingControls()

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function hideDisabledBillingControls() {
  if (BILLING_INPUT_ENABLED && RATE_INPUT_ENABLED) return

  const billingSelect = document.getElementById('billing_company')
  const rateSelect = document.getElementById('rate_type')

  if (!BILLING_INPUT_ENABLED && billingSelect) hideControl(billingSelect)
  if (!RATE_INPUT_ENABLED && rateSelect) hideControl(rateSelect)
}

function hideControl(element) {
  element.hidden = true
  element.disabled = true
  element.setAttribute('aria-hidden', 'true')
  element.classList.add('is-hidden')
  element.style.display = 'none'
}

// 作業内容を読み込む
async function loadWorkTypes() {
  const { data, error } = await supabase
    .from('work_type_master')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  const select = document.getElementById('work_type')
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

// 製番で設備名を検索
async function searchSeiban() {
  const seiban = document.getElementById('seiban').value.trim()
  const equipmentInput = document.getElementById('equipment_name')
  const statusEl = document.getElementById('seiban_status')

  if (seiban.length < 1) {
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
    equipmentInput.value = ''
    equipmentInput.readOnly = false
    statusEl.textContent = '製番の確認に失敗しました'
    statusEl.style.color = '#e74c3c'
  } else {
    equipmentInput.value = ''
    equipmentInput.readOnly = false
    statusEl.textContent = '未登録の製番です。設備名を入力してください'
    statusEl.style.color = '#e74c3c'
  }

  calcActualTime()
}

// 実働時間を計算
function calcActualTime() {
  const start = normalizeTimeInput(document.getElementById('start_time').value)
  const end = normalizeTimeInput(document.getElementById('end_time').value)
  const break1 = parseInt(document.getElementById('break1').value) || 0
  const break2 = parseInt(document.getElementById('break2').value) || 0

  if (!start || !end) {
    document.getElementById('actual_time').textContent = '--時間--分'
    return
  }

  const startMin = timeToMinutes(start)
  const endMin = timeToMinutes(end)
  const actual = endMin - startMin - break1 - break2

  if (actual <= 0) {
    document.getElementById('actual_time').textContent = '⚠️ 時間を確認してください'
    return
  }

  const h = Math.floor(actual / 60)
  const m = actual % 60
  document.getElementById('actual_time').textContent = `${h}時間${m}分`
}

function sanitizeNumericInput(id, maxLength = null) {
  const input = document.getElementById(id)
  let value = input.value.replace(/\D/g, '')
  if (maxLength) value = value.slice(0, maxLength)
  input.value = value
}

function normalizeTimeInput(value) {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 1 || digits.length > 4) return ''

  let h
  let m
  if (digits.length <= 2) {
    h = Number(digits)
    m = 0
  } else if (digits.length === 3) {
    h = Number(digits.slice(0, 1))
    m = Number(digits.slice(1, 3))
  } else {
    h = Number(digits.slice(0, 2))
    m = Number(digits.slice(2, 4))
  }
  if (h > 23 || m > 59) return ''

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatTimeField(id) {
  const input = document.getElementById(id)
  const time = normalizeTimeInput(input.value)
  if (time) input.value = time
}

function handleNumericInput(id, maxLength = null) {
  sanitizeNumericInput(id, maxLength)
  calcActualTime()
}

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// 保存する
async function saveLog() {
  const workerId = document.getElementById('worker').value
  const billingCompanyId = BILLING_INPUT_ENABLED ? document.getElementById('billing_company').value : ''
  const rateType = RATE_INPUT_ENABLED ? document.getElementById('rate_type').value : ''
  const seiban = document.getElementById('seiban').value.trim()
  const equipmentName = document.getElementById('equipment_name').value.trim()
  const workTypeId = document.getElementById('work_type').value
  const workDate = document.getElementById('work_date').value
  const startTime = normalizeTimeInput(document.getElementById('start_time').value)
  const endTime = normalizeTimeInput(document.getElementById('end_time').value)
  const break1 = parseInt(document.getElementById('break1').value) || 0
  const break2 = parseInt(document.getElementById('break2').value) || 0
  const note = document.getElementById('note').value.trim()

  if (!seiban || !equipmentName || !workTypeId || !workDate || !startTime || !endTime) {
    showMessage('⚠️ 必須項目を入力してください', 'error')
    return
  }

  if (workerFeatureEnabled && !workerId) {
    showMessage('⚠️ 必須項目を入力してください', 'error')
    return
  }

  if (BILLING_INPUT_ENABLED && billingCompanyFeatureEnabled && !billingCompanyId) {
    showMessage('⚠️ 元請けを選択してください', 'error')
    return
  }

  if (RATE_INPUT_ENABLED && rateFeatureEnabled && (!billingCompanyId || !rateType)) {
    showMessage('⚠️ 元請け・単価区分を選択してください', 'error')
    return
  }

  const actualMinutes = timeToMinutes(endTime) - timeToMinutes(startTime) - break1 - break2

  if (actualMinutes <= 0) {
    showMessage('⚠️ 開始・終了・休憩時間を確認してください', 'error')
    return
  }

  const hasDuplicate = await hasDuplicateTimeLog(workerId, workDate, startTime, endTime)
  if (hasDuplicate && !confirm('同じ作業者・同じ日付で時間が重なる入力があります。このまま保存しますか？')) {
    showMessage('⚠️ 保存を中止しました', 'error')
    return
  }

  // 製番が未登録なら登録する
  let seibanId
  const { data: existing, error: findSeibanError } = await supabase
    .from('seiban_master')
    .select('id')
    .eq('seiban', seiban)
    .maybeSingle()

  if (findSeibanError) {
    console.error('製番の確認に失敗しました', findSeibanError)
    showMessage('❌ 製番の確認に失敗しました', 'error')
    return
  }

  if (existing) {
    seibanId = existing.id
  } else {
    const { data: newSeiban, error: insertSeibanError } = await supabase
      .from('seiban_master')
      .insert({ seiban, equipment_name: equipmentName })
      .select()
      .single()

    if (insertSeibanError || !newSeiban) {
      console.error('製番の登録に失敗しました', insertSeibanError)
      showMessage('❌ 製番の登録に失敗しました', 'error')
      return
    }

    seibanId = newSeiban.id
  }

  let appliedRate = null
  if (RATE_INPUT_ENABLED && rateFeatureEnabled) {
    appliedRate = await findApplicableRate({
      billingCompanyId,
      workerId,
      seibanId,
      rateType,
      actualMinutes
    })
    if (!appliedRate) return
  }

  // 工数を保存
  const logData = {
    work_date: workDate,
    seiban_id: seibanId,
    work_type_id: workTypeId,
    start_time: startTime,
    end_time: endTime,
    break1_minutes: break1,
    break2_minutes: break2,
    actual_minutes: actualMinutes,
    note
  }

  // DB側にworker_id列がある場合だけ作業者IDを保存します。
  if (workerFeatureEnabled) {
    logData.worker_id = workerId
  }

  // DB側にbilling_company_id列がある場合だけ、入力時点の元請けを保存します。
  if (BILLING_INPUT_ENABLED && billingCompanyFeatureEnabled) {
    logData.billing_company_id = billingCompanyId
  }

  if (RATE_INPUT_ENABLED && rateFeatureEnabled && appliedRate) {
    logData.rate_type = rateType
    logData.rate_master_id = appliedRate.id
    logData.unit_price = appliedRate.amount
    logData.billing_amount = appliedRate.billingAmount
  }

  const { error } = await supabase
    .from('work_logs')
    .insert(logData)

  if (error) {
    console.error('工数の保存に失敗しました', error)
    showMessage('❌ 保存に失敗しました', 'error')
  } else {
    if (BILLING_INPUT_ENABLED) rememberBillingCompany(workerId, billingCompanyId)
    showMessage('✓ 保存しました', 'success')
    resetFormForNextInput()
  }
}

async function hasDuplicateTimeLog(workerId, workDate, startTime, endTime) {
  if (!workerFeatureEnabled || !workerId) return false

  const { data, error } = await supabase
    .from('work_logs')
    .select('id, start_time, end_time')
    .eq('work_date', workDate)
    .eq('worker_id', workerId)

  if (error || !data) {
    console.error('重複確認に失敗しました', error)
    return false
  }

  const startMin = timeToMinutes(startTime)
  const endMin = timeToMinutes(endTime)

  return data.some(log => {
    const logStart = timeToMinutes(log.start_time)
    const logEnd = timeToMinutes(log.end_time)
    return startMin < logEnd && endMin > logStart
  })
}

function resetFormForNextInput() {
  document.getElementById('seiban').value = ''
  document.getElementById('equipment_name').value = ''
  document.getElementById('equipment_name').readOnly = false
  document.getElementById('seiban_status').textContent = ''
  document.getElementById('start_time').value = ''
  document.getElementById('end_time').value = ''
  document.getElementById('break1').value = ''
  document.getElementById('break2').value = ''
  document.getElementById('actual_time').textContent = '--時間--分'
  document.getElementById('note').value = ''
  document.getElementById('seiban').focus()
}

function showMessage(text, type) {
  const el = document.getElementById('message')
  if (messageTimer) clearTimeout(messageTimer)

  el.textContent = text
  el.className = `${type} is-visible`

  messageTimer = setTimeout(() => {
    el.classList.add('is-hiding')
    setTimeout(() => {
      el.textContent = ''
      el.className = ''
    }, 220)
  }, type === 'success' ? 2400 : 3000)
}

// イベントリスナー
document.getElementById('start_time').addEventListener('input', () => handleNumericInput('start_time', 4))
document.getElementById('end_time').addEventListener('input', () => handleNumericInput('end_time', 4))
document.getElementById('start_time').addEventListener('blur', () => formatTimeField('start_time'))
document.getElementById('end_time').addEventListener('blur', () => formatTimeField('end_time'))
document.getElementById('break1').addEventListener('input', () => handleNumericInput('break1'))
document.getElementById('break2').addEventListener('input', () => handleNumericInput('break2'))
document.getElementById('worker').addEventListener('change', () => {
  if (!BILLING_INPUT_ENABLED) return
  applyLastBillingCompany(document.getElementById('worker').value)
})

window.searchSeiban = searchSeiban
window.saveLog = saveLog

async function loadWorkers() {
  const { data, error } = await supabase
    .from('worker_master')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  const select = document.getElementById('worker')
  select.innerHTML = ''

  const emptyOption = document.createElement('option')
  emptyOption.value = ''
  emptyOption.textContent = '作業者を選択'
  select.appendChild(emptyOption)

  if (error || !data) {
    console.error('作業者一覧の取得に失敗しました', error)
    workerFeatureEnabled = false
    select.disabled = true
    emptyOption.textContent = '作業者DB未設定'
    showMessage('⚠️ 作業者DBが未設定のため、作業者なしで保存します', 'error')
    return
  }

  workerFeatureEnabled = true
  select.disabled = false

  data.forEach(worker => {
    const option = document.createElement('option')
    option.value = worker.id
    option.textContent = worker.name
    select.appendChild(option)
  })
}

async function loadBillingCompanies() {
  const select = document.getElementById('billing_company')
  select.innerHTML = ''

  if (!BILLING_INPUT_ENABLED) {
    billingCompanyFeatureEnabled = false
    hideControl(select)
    return
  }

  const emptyOption = document.createElement('option')
  emptyOption.value = ''
  emptyOption.textContent = '元請けを選択'
  select.appendChild(emptyOption)

  const { error: columnError } = await supabase
    .from('work_logs')
    .select('billing_company_id')
    .limit(1)

  if (columnError) {
    console.error('元請け列の確認に失敗しました', columnError)
    billingCompanyFeatureEnabled = false
    select.disabled = true
    emptyOption.textContent = '元請けDB未設定'
    return
  }

  let { data, error } = await supabase
    .from('billing_company_master')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')
    .order('name')

  if (error) {
    const fallback = await supabase
      .from('billing_company_master')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order')
      .order('name')
    data = fallback.data
    error = fallback.error
  }

  if (error || !data) {
    console.error('元請け一覧の取得に失敗しました', error)
    billingCompanyFeatureEnabled = false
    select.disabled = true
    emptyOption.textContent = '元請けDB未設定'
    return
  }

  if (data.length === 0) {
    billingCompanyFeatureEnabled = false
    select.disabled = true
    emptyOption.textContent = '元請けを登録してください'
    return
  }

  billingCompanyFeatureEnabled = true
  select.disabled = false

  data.forEach(company => {
    const option = document.createElement('option')
    option.value = company.id
    option.textContent = company.name
    select.appendChild(option)
  })

  applyLastBillingCompany(document.getElementById('worker').value)
}

async function checkRateFeature() {
  fillRateTypeSelect(document.getElementById('rate_type'))

  const rateSelect = document.getElementById('rate_type')

  if (!RATE_INPUT_ENABLED) {
    rateFeatureEnabled = false
    hideControl(rateSelect)
    return
  }

  const [{ error: rateError }, { error: logError }] = await Promise.all([
    supabase.from('rate_master').select('id').limit(1),
    supabase.from('work_logs').select('rate_type, rate_master_id, unit_price, billing_amount').limit(1)
  ])

  rateFeatureEnabled = !rateError && !logError
  rateSelect.disabled = !rateFeatureEnabled

  if (!rateFeatureEnabled) {
    rateSelect.innerHTML = '<option value="">単価DB未設定</option>'
  }
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

async function applyLastBillingCompany(workerId) {
  if (!billingCompanyFeatureEnabled) return

  const select = document.getElementById('billing_company')
  select.value = ''
  if (!workerId) return

  const savedCompanyId = localStorage.getItem(`${LAST_BILLING_COMPANY_KEY_PREFIX}${workerId}`)
  if (savedCompanyId && hasBillingCompanyOption(savedCompanyId)) {
    select.value = savedCompanyId
  }

  const { data, error } = await supabase
    .from('work_logs')
    .select('billing_company_id')
    .eq('worker_id', workerId)
    .not('billing_company_id', 'is', null)
    .order('work_date', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return

  const companyId = data[0].billing_company_id
  if (companyId && hasBillingCompanyOption(companyId)) {
    select.value = companyId
  }
}

function hasBillingCompanyOption(companyId) {
  const select = document.getElementById('billing_company')
  return Array.from(select.options).some(option => option.value === companyId)
}

function rememberBillingCompany(workerId, billingCompanyId) {
  if (!workerId || !billingCompanyId) return
  localStorage.setItem(`${LAST_BILLING_COMPANY_KEY_PREFIX}${workerId}`, billingCompanyId)
}

loadWorkTypes()
loadWorkers()
loadBillingCompanies()
checkRateFeature()
