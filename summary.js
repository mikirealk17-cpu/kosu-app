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
  if (currentTab === 'worker') {
    await loadWorkerSummary()
    return
  }

  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value

  const { data, error } = await supabase
    .from('work_logs')
    .select(`
      actual_minutes,
      work_date,
      seiban_master (
        seiban,
        equipment_name
      )
    `)
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date')

  if (error || !data) {
    console.error('集計データの取得に失敗しました', error)
    const message = error?.message ? `データの取得に失敗しました: ${escapeHtml(error.message)}` : 'データの取得に失敗しました'
    document.getElementById('summary_table').innerHTML = `<p>${message}</p>`
    return
  }

  if (currentTab === 'seiban') renderSeiban(data)
  if (currentTab === 'equipment') renderEquipment(data)
  if (currentTab === 'daily') renderDaily(data)
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
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

async function loadWorkerSummary() {
  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value

  const { data, error } = await supabase
    .from('work_logs')
    .select('actual_minutes, worker_id')
    .gte('work_date', from)
    .lte('work_date', to)

  if (error || !data) {
    console.error('作業者別集計データの取得に失敗しました', error)
    document.getElementById('summary_table').innerHTML = '<p>作業者別集計には、Supabase側でworker_masterとwork_logs.worker_idの設定が必要です</p>'
    return
  }

  await loadWorkerNameMap()
  renderWorker(data)
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

window.loadData()
