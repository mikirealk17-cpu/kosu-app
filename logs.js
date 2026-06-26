import { supabase } from './supabaseClient.js'

let logs = []
let editingLog = null
let workerFeatureEnabled = false

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

function showMessage(text, type) {
  const el = document.getElementById('message')
  el.textContent = text
  el.className = type
  setTimeout(() => {
    el.textContent = ''
    el.className = ''
  }, 3000)
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

window.loadLogs = async function() {
  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value
  const workerSelect = workerFeatureEnabled ? 'worker_id,' : ''

  const { data, error } = await supabase
    .from('work_logs')
    .select(`
      id,
      work_date,
      seiban_id,
      work_type_id,
      ${workerSelect}
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

    const button = document.createElement('button')
    button.textContent = '編集する'
    button.addEventListener('click', () => startEdit(log.id))

    item.append(main, sub, button)
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

  document.getElementById('edit_panel').classList.add('active')
  calcEditActualTime()
  document.getElementById('edit_panel').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

window.cancelEdit = function() {
  editingLog = null
  document.getElementById('edit_panel').classList.remove('active')
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

  const { error } = await supabase
    .from('work_logs')
    .update(updateData)
    .eq('id', editingLog.id)

  if (error) {
    console.error('入力履歴の更新に失敗しました', error)
    showMessage('❌ 更新に失敗しました', 'error')
    return
  }

  showMessage('✅ 更新しました', 'success')
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

document.getElementById('edit_start_time').addEventListener('input', calcEditActualTime)
document.getElementById('edit_end_time').addEventListener('input', calcEditActualTime)
document.getElementById('edit_break1').addEventListener('input', calcEditActualTime)
document.getElementById('edit_break2').addEventListener('input', calcEditActualTime)

await loadWorkTypes()
await loadWorkers()
window.loadLogs()
