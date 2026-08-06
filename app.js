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
  normalizeProductionNumber,
  PRODUCTION_NUMBER_CANDIDATE_LIMIT,
  rememberRecentProductionNumber,
  sortProductionNumberCandidatesByRecent,
  compareProductionNumberCandidates
} from './production-number-utils.mjs'

const authContext = await requireAuth([ROLES.ADMIN, ROLES.WORKER])
const BILLING_INPUT_ENABLED = false
const RATE_INPUT_ENABLED = false

let workerFeatureEnabled = false
let billingCompanyFeatureEnabled = false
let rateFeatureEnabled = false
let messageTimer = null
let isSaving = false
let isRegisteringSeiban = false
let selectedSeiban = null
let seibanSearchSeq = 0
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
  const input = document.getElementById('seiban')
  const seiban = normalizeProductionNumber(input.value)
  const equipmentInput = document.getElementById('equipment_name')
  const statusEl = document.getElementById('seiban_status')
  const searchSeq = ++seibanSearchSeq
  selectedSeiban = null

  if (seiban.length < 1) {
    equipmentInput.value = ''
    equipmentInput.readOnly = false
    statusEl.textContent = '候補から選ぶと入力ミスを防げます'
    statusEl.style.color = '#667085'
    await showDefaultSeibanCandidates(searchSeq)
    setRegisterSeibanVisible(false)
    return
  }

  const { data, error } = await fetchSeibanCandidates(seiban)
  if (searchSeq !== seibanSearchSeq) return

  if (error) {
    console.error('製番の確認に失敗しました', error)
    equipmentInput.value = ''
    equipmentInput.readOnly = false
    statusEl.textContent = '製番の確認に失敗しました'
    statusEl.style.color = '#e74c3c'
    renderSeibanCandidates([])
    setRegisterSeibanVisible(false)
    return
  }

  const exact = findExactSeiban(data, seiban)
  if (exact) {
    selectSeiban(exact)
    equipmentInput.readOnly = true
    statusEl.textContent = exact.status === 'pending' ? '未確認の登録済み生産番号です' : '登録済み'
    statusEl.style.color = 'green'
    renderSeibanCandidates(data, exact.id)
    setRegisterSeibanVisible(false)
  } else {
    equipmentInput.value = ''
    equipmentInput.readOnly = false
    statusEl.textContent = data.length > 0
      ? '似た生産番号があります。候補を確認してください'
      : '未登録の生産番号です。設備名を入力してください'
    statusEl.style.color = '#e74c3c'
    renderSeibanCandidates(data)
    setRegisterSeibanVisible(true)
  }

  calcActualTime()
}

async function showDefaultSeibanCandidates(searchSeq = ++seibanSearchSeq) {
  const input = document.getElementById('seiban')
  if (normalizeProductionNumber(input.value)) return

  const { data, error } = await fetchSeibanCandidates('', { allowEmpty: true })
  if (searchSeq !== seibanSearchSeq) return

  if (error) {
    console.error('製番候補の取得に失敗しました', error)
    renderSeibanCandidates([], null, '製番候補を読み込めませんでした')
    return
  }

  renderSeibanCandidates(data, null, '登録済みの製番候補はありません')
}

async function fetchSeibanCandidates(seiban, options = {}) {
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
    return { data: filterSeibanCandidates(fallback.data, key, options), error: null }
  }

  if (result.error || !result.data) return result
  return { data: filterSeibanCandidates(result.data, key, options), error: null }
}

function filterSeibanCandidates(rows, key, options = {}) {
  const activeRows = rows
    .filter(row => row.is_active !== false)
    .map(row => ({ ...row, seiban_key: getProductionNumberKey(row) }))

  if (!key && options.allowEmpty) {
    return sortProductionNumberCandidatesByRecent(activeRows).slice(0, PRODUCTION_NUMBER_CANDIDATE_LIMIT)
  }

  return activeRows
    .filter(row => (
      row.seiban_key === key
      || row.seiban_key.includes(key)
      || key.includes(row.seiban_key)
      || isSimilarProductionNumber(key, row.seiban_key)
    ))
    .sort((a, b) => compareProductionNumberCandidates(a, b))
    .slice(0, PRODUCTION_NUMBER_CANDIDATE_LIMIT)
}

async function findActiveSeiban(seiban) {
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

function findExactSeiban(rows, seiban) {
  const key = createProductionNumberKey(seiban)
  return rows.find(row => getProductionNumberKey(row) === key) || null
}

function selectSeiban(row) {
  selectedSeiban = row
  rememberRecentProductionNumber(row)
  document.getElementById('seiban').value = normalizeProductionNumber(row.seiban)
  document.getElementById('equipment_name').value = row.equipment_name || ''
}

function renderSeibanCandidates(rows, selectedId = null, emptyText = '一致する登録済み生産番号はありません') {
  const container = document.getElementById('seiban_suggestions')
  if (!container) return
  container.innerHTML = ''

  if (!rows || rows.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'seiban-suggestion-empty'
    empty.textContent = emptyText
    container.appendChild(empty)
    return
  }

  rows.forEach(row => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `seiban-suggestion${row.id === selectedId ? ' is-selected' : ''}`
    button.textContent = formatProductionNumberLabel(row)
    button.addEventListener('click', () => {
      selectSeiban(row)
      document.getElementById('equipment_name').readOnly = true
      document.getElementById('seiban_status').textContent = row.status === 'pending'
        ? '未確認の登録済み生産番号です'
        : '登録済み'
      document.getElementById('seiban_status').style.color = 'green'
      setRegisterSeibanVisible(false)
      renderSeibanCandidates(rows, row.id)
    })
    container.appendChild(button)
  })
}

function clearSeibanCandidates() {
  const container = document.getElementById('seiban_suggestions')
  if (container) container.innerHTML = ''
}

function setRegisterSeibanVisible(visible) {
  const button = document.getElementById('register_seiban_button')
  if (!button) return
  button.hidden = !visible
  button.disabled = isRegisteringSeiban
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

async function registerSeibanFromInput() {
  if (isRegisteringSeiban) return

  const seiban = normalizeProductionNumber(document.getElementById('seiban').value)
  const equipmentName = document.getElementById('equipment_name').value.trim()

  if (!seiban) {
    showMessage('⚠️ 生産番号を入力してください', 'error')
    return
  }

  if (!equipmentName) {
    showMessage('⚠️ 新しい生産番号の設備名を入力してください', 'error')
    return
  }

  isRegisteringSeiban = true
  setRegisterSeibanVisible(true)

  try {
    const { data: candidates, error } = await fetchSeibanCandidates(seiban)
    if (error) {
      console.error('生産番号の確認に失敗しました', error)
      showMessage('❌ 生産番号の確認に失敗しました', 'error')
      return
    }

    const exact = findExactSeiban(candidates || [], seiban)
    if (exact) {
      selectSeiban(exact)
      showMessage('✅ 同じ生産番号が登録済みだったため、既存の生産番号を選択しました', 'success')
      setRegisterSeibanVisible(false)
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
        const { data: existing } = await findActiveSeiban(seiban)
        if (existing) {
          selectSeiban(existing)
          showMessage('✅ 同じ生産番号が登録済みだったため、既存の生産番号を選択しました', 'success')
          return
        }
      }

      console.error('生産番号の登録に失敗しました', insertError)
      showMessage('❌ 生産番号の登録に失敗しました。DB設定または通信状態を確認してください', 'error')
      return
    }

    selectSeiban(newSeiban)
    document.getElementById('equipment_name').readOnly = true
    document.getElementById('seiban_status').textContent = authContext.isWorker
      ? '未確認の生産番号として登録しました'
      : '確認済み生産番号として登録しました'
    document.getElementById('seiban_status').style.color = 'green'
    setRegisterSeibanVisible(false)
    showMessage('✅ 生産番号を登録しました。このまま工数を保存できます', 'success')
  } finally {
    isRegisteringSeiban = false
    const button = document.getElementById('register_seiban_button')
    if (button) button.disabled = false
  }
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
  if (isSaving) return

  isSaving = true
  setSaveInProgress(true)

  try {
    await saveLogOnce()
  } catch (error) {
    console.error('工数の保存処理で予期しないエラーが発生しました', error)
    showMessage('❌ 保存処理を完了できませんでした。通信状態を確認して、もう一度お試しください', 'error')
  } finally {
    isSaving = false
    setSaveInProgress(false)
  }
}

async function saveLogOnce() {
  const workerId = getCurrentWorkerId()
  const billingCompanyId = BILLING_INPUT_ENABLED ? document.getElementById('billing_company').value : ''
  const rateType = RATE_INPUT_ENABLED ? document.getElementById('rate_type').value : ''
  const seiban = normalizeProductionNumber(document.getElementById('seiban').value)
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

  if (seiban.length > 100 || equipmentName.length > 200 || note.length > 1000) {
    showMessage('⚠️ 製番・設備名・備考の文字数を確認してください', 'error')
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

  if (break1 < 0 || break2 < 0 || break1 > 1440 || break2 > 1440) {
    showMessage('⚠️ 休憩時間は0〜1440分の整数で入力してください', 'error')
    return
  }

  if (actualMinutes <= 0) {
    showMessage('⚠️ 終了時間は開始時間より後にし、休憩時間は勤務時間より短くしてください', 'error')
    return
  }

  const hasDuplicate = await hasDuplicateTimeLog(workerId, workDate, startTime, endTime)
  if (hasDuplicate === null) {
    showMessage('❌ 時間の重複確認に失敗したため保存できません。通信状態を確認してください', 'error')
    return
  }

  if (hasDuplicate && !confirm('同じ作業者・同じ日付で時間が重なる入力があります。このまま保存しますか？')) {
    showMessage('⚠️ 保存を中止しました', 'error')
    return
  }

  const { data: existing, error: findSeibanError } = await findActiveSeiban(seiban)

  if (findSeibanError) {
    console.error('製番の確認に失敗しました', findSeibanError)
    showMessage('❌ 製番の確認に失敗しました', 'error')
    return
  }

  if (!existing) {
    showMessage('⚠️ 未登録の生産番号です。候補を確認し、「新しい生産番号として登録」を押してから保存してください', 'error')
    return
  }

  const seibanId = existing.id

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

  const { data: savedLog, error } = await supabase
    .from('work_logs')
    .insert(logData)
    .select('id')
    .single()

  if (error || !savedLog) {
    console.error('工数の保存に失敗しました', error)
    showMessage('❌ 保存に失敗しました', 'error')
  } else {
    if (BILLING_INPUT_ENABLED) rememberBillingCompany(workerId, billingCompanyId)
    showMessage(createSavedLogMessage({
      workDate,
      seiban,
      equipmentName,
      startTime,
      endTime,
      actualMinutes
    }), 'success')
    resetFormForNextInput()
  }
}

function setSaveInProgress(inProgress) {
  const button = document.getElementById('save_button')
  if (!button) return
  button.disabled = inProgress
  button.textContent = inProgress ? '保存中...' : '保存する'
}

function createSavedLogMessage({ workDate, seiban, equipmentName, startTime, endTime, actualMinutes }) {
  const worker = authContext.isWorker
    ? getSelectedOptionText('worker')
    : (workerFeatureEnabled ? getSelectedOptionText('worker') : '作業者未設定')

  return [
    `${formatDateForMessage(workDate)}　${worker || '作業者未設定'}`,
    `製番${seiban}　${equipmentName}`,
    `${startTime}〜${endTime}　実働${formatDurationForMessage(actualMinutes)}`,
    '保存しました'
  ].join('\n')
}

function formatDateForMessage(value) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return `${month}月${day}日`
}

function formatDurationForMessage(minutes) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  const decimalHours = Math.round((minutes / 60) * 100) / 100

  if (remainder === 0) return `${hours}時間`
  return `${hours}時間${remainder}分（${decimalHours}時間）`
}

function getSelectedOptionText(selectId) {
  const select = document.getElementById(selectId)
  return select?.options[select.selectedIndex]?.textContent?.trim() || ''
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
    return null
  }

  return data.some(log => (
    hasTimeOverlap(startTime, endTime, log.start_time, log.end_time)
  ))
}

function getCurrentWorkerId() {
  return authContext.isWorker
    ? authContext.profile.worker_id
    : document.getElementById('worker').value
}

function resetFormForNextInput() {
  selectedSeiban = null
  document.getElementById('seiban').value = ''
  document.getElementById('equipment_name').value = ''
  document.getElementById('equipment_name').readOnly = false
  document.getElementById('seiban_status').textContent = ''
  clearSeibanCandidates()
  setRegisterSeibanVisible(false)
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
  el.className = `${type} is-visible${text.includes('\n') ? ' has-detail' : ''}`

  messageTimer = setTimeout(() => {
    el.classList.add('is-hiding')
    setTimeout(() => {
      el.textContent = ''
      el.className = ''
    }, 220)
  }, type === 'success' ? 8500 : 3000)
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
document.getElementById('seiban').addEventListener('blur', () => {
  const input = document.getElementById('seiban')
  input.value = normalizeProductionNumber(input.value)
})
document.getElementById('seiban').addEventListener('focus', () => {
  if (!normalizeProductionNumber(document.getElementById('seiban').value)) {
    document.getElementById('seiban_status').textContent = '候補から選ぶと入力ミスを防げます'
    document.getElementById('seiban_status').style.color = '#667085'
    showDefaultSeibanCandidates()
  }
})
document.getElementById('register_seiban_button')?.addEventListener('click', registerSeibanFromInput)

window.searchSeiban = searchSeiban
window.saveLog = saveLog

async function loadWorkers() {
  let query = supabase
    .from('worker_master')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (authContext.isWorker) {
    query = query.eq('id', authContext.profile.worker_id)
  }

  const { data, error } = await query

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
