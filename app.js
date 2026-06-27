import { supabase } from './supabaseClient.js'

let workerFeatureEnabled = false

// 今日の日付をセットします。toISOString()はUTC基準なので、日本時間では日付がずれることがあります。
document.getElementById('work_date').value = formatDate(new Date())

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

  const { error } = await supabase
    .from('work_logs')
    .insert(logData)

  if (error) {
    console.error('工数の保存に失敗しました', error)
    showMessage('❌ 保存に失敗しました', 'error')
  } else {
    showMessage('✅ 保存しました！', 'success')
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
  el.textContent = text
  el.className = type
  setTimeout(() => {
    el.textContent = ''
    el.className = ''
  }, 3000)
}

// イベントリスナー
document.getElementById('start_time').addEventListener('input', () => handleNumericInput('start_time', 4))
document.getElementById('end_time').addEventListener('input', () => handleNumericInput('end_time', 4))
document.getElementById('start_time').addEventListener('blur', () => formatTimeField('start_time'))
document.getElementById('end_time').addEventListener('blur', () => formatTimeField('end_time'))
document.getElementById('break1').addEventListener('input', () => handleNumericInput('break1'))
document.getElementById('break2').addEventListener('input', () => handleNumericInput('break2'))

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

loadWorkTypes()
loadWorkers()
