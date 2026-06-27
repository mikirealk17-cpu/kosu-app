import { supabase } from './supabaseClient.js'

let currentTab = 'seiban'
let workerNameMap = {}

const today = new Date()
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
document.getElementById('date_from').value = formatDate(firstDay)
document.getElementById('date_to').value = formatDate(today)

window.switchTab = function(tab) {
  currentTab = tab
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'))
  document.querySelector(`[onclick="switchTab('${tab}')"]`).classList.add('active')
  window.loadData()
}

window.loadData = async function() {
  setSummaryStatus('集計を更新中です...')

  if (currentTab === 'worker') {
    await loadWorkerSummary()
    return
  }

  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value
  const filters = getFilters()

  let query = supabase
    .from('work_logs')
    .select(`
      actual_minutes,
      work_date,
      worker_id,
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
    .order('work_date')

  query = applyFilters(query, filters)

  const { data, error } = await query

  if (error || !data) {
    console.error('集計データの取得に失敗しました', error)
    const message = error?.message ? `データの取得に失敗しました: ${escapeHtml(error.message)}` : 'データの取得に失敗しました'
    document.getElementById('summary_table').innerHTML = `<p>${message}</p>`
    setSummaryStatus('集計の取得に失敗しました')
    return
  }

  if (currentTab === 'seiban') renderSeiban(data)
  if (currentTab === 'equipment') renderEquipment(data)
  if (currentTab === 'daily') renderDaily(data)
  setSummaryStatus(`${data.length}件のデータを表示しました`)
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function minutesToHM(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h${String(m).padStart(2, '0')}m`
}

function formatTime(time) {
  return time ? time.slice(0, 5) : ''
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function escapeCsv(value) {
  const text = value == null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function setSummaryStatus(text) {
  document.getElementById('summary_status').textContent = text
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

async function loadWorkerNameMap() {
  const { data } = await supabase
    .from('worker_master')
    .select('id, name')

  workerNameMap = {}
  if (!data) return

  data.forEach(worker => {
    workerNameMap[worker.id] = worker.name
  })
}

async function loadFilterOptions() {
  await Promise.all([
    loadWorkerOptions(),
    loadWorkTypeOptions(),
    loadSeibanOptions()
  ])
}

async function loadWorkerOptions() {
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

async function loadWorkTypeOptions() {
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

async function loadSeibanOptions() {
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

window.exportCsv = async function() {
  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value
  const filters = getFilters()

  let query = supabase
    .from('work_logs')
    .select(`
      work_date,
      worker_id,
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
    .order('work_date')

  query = applyFilters(query, filters)

  const { data, error } = await query

  if (error || !data) {
    console.error('CSV出力データの取得に失敗しました', error)
    alert('CSV出力データの取得に失敗しました')
    return
  }

  await loadWorkerNameMap()

  const headers = [
    '日付',
    '作業者',
    '製番',
    '設備名',
    '作業内容',
    '開始時間',
    '終了時間',
    '休憩1分',
    '休憩2分',
    '実働分',
    '実働時間',
    '備考'
  ]

  const rows = data.map(row => [
    row.work_date,
    workerNameMap[row.worker_id] || '',
    row.seiban_master?.seiban || '',
    row.seiban_master?.equipment_name || '',
    row.work_type_master?.name || '',
    formatTime(row.start_time),
    formatTime(row.end_time),
    row.break1_minutes || 0,
    row.break2_minutes || 0,
    row.actual_minutes || 0,
    minutesToHM(row.actual_minutes || 0),
    row.note || ''
  ])

  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ].join('\n')

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `kosu_${from}_${to}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function loadWorkerSummary() {
  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value
  const filters = getFilters()

  let query = supabase
    .from('work_logs')
    .select('actual_minutes, worker_id, seiban_id, work_type_id')
    .gte('work_date', from)
    .lte('work_date', to)

  query = applyFilters(query, filters)

  const { data, error } = await query

  if (error || !data) {
    console.error('作業者別集計データの取得に失敗しました', error)
    document.getElementById('summary_table').innerHTML = '<p>作業者別集計には、Supabase側でworker_masterとwork_logs.worker_idの設定が必要です</p>'
    setSummaryStatus('作業者別集計の取得に失敗しました')
    return
  }

  await loadWorkerNameMap()
  renderWorker(data)
  setSummaryStatus(`${data.length}件のデータを表示しました`)
}

function renderSeiban(data) {
  const map = {}
  data.forEach(row => {
    const seiban = row.seiban_master?.seiban || '不明'
    const equipment = row.seiban_master?.equipment_name || '不明'
    if (!map[seiban]) map[seiban] = { equipment, minutes: 0 }
    map[seiban].minutes += row.actual_minutes || 0
  })

  let html = '<table><tr><th>製番</th><th>設備名</th><th>工数</th></tr>'
  let total = 0
  Object.entries(map).forEach(([seiban, val]) => {
    html += `<tr><td>${escapeHtml(seiban)}</td><td>${escapeHtml(val.equipment)}</td><td>${minutesToHM(val.minutes)}</td></tr>`
    total += val.minutes
  })
  html += `<tr class="total-row"><td colspan="2">合計</td><td>${minutesToHM(total)}</td></tr>`
  html += '</table>'
  document.getElementById('summary_table').innerHTML = html
}

function renderEquipment(data) {
  const map = {}
  data.forEach(row => {
    const equipment = row.seiban_master?.equipment_name || '不明'
    if (!map[equipment]) map[equipment] = 0
    map[equipment] += row.actual_minutes || 0
  })

  let html = '<table><tr><th>設備名</th><th>工数</th></tr>'
  let total = 0
  Object.entries(map).forEach(([equipment, minutes]) => {
    html += `<tr><td>${escapeHtml(equipment)}</td><td>${minutesToHM(minutes)}</td></tr>`
    total += minutes
  })
  html += `<tr class="total-row"><td>合計</td><td>${minutesToHM(total)}</td></tr>`
  html += '</table>'
  document.getElementById('summary_table').innerHTML = html
}

function renderDaily(data) {
  const map = {}
  data.forEach(row => {
    const date = row.work_date
    if (!map[date]) map[date] = 0
    map[date] += row.actual_minutes || 0
  })

  let html = '<table><tr><th>日付</th><th>工数</th></tr>'
  let total = 0
  Object.entries(map).forEach(([date, minutes]) => {
    html += `<tr><td>${escapeHtml(date)}</td><td>${minutesToHM(minutes)}</td></tr>`
    total += minutes
  })
  html += `<tr class="total-row"><td>合計</td><td>${minutesToHM(total)}</td></tr>`
  html += '</table>'
  document.getElementById('summary_table').innerHTML = html
}

function renderWorker(data) {
  const map = {}
  data.forEach(row => {
    const worker = workerNameMap[row.worker_id] || '作業者未設定'
    if (!map[worker]) map[worker] = 0
    map[worker] += row.actual_minutes || 0
  })

  let html = '<table><tr><th>作業者</th><th>工数</th></tr>'
  let total = 0
  Object.entries(map).forEach(([worker, minutes]) => {
    html += `<tr><td>${escapeHtml(worker)}</td><td>${minutesToHM(minutes)}</td></tr>`
    total += minutes
  })
  html += `<tr class="total-row"><td>合計</td><td>${minutesToHM(total)}</td></tr>`
  html += '</table>'
  document.getElementById('summary_table').innerHTML = html
}

await loadFilterOptions()
window.loadData()
