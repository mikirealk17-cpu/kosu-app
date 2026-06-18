import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://hiibhvtlnwihfiufzuph.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Q8mZdRrn14hFacdUPrNTaw_DyqmSVXv'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

let currentTab = 'seiban'

const today = new Date()
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
document.getElementById('date_from').value = firstDay.toISOString().split('T')[0]
document.getElementById('date_to').value = today.toISOString().split('T')[0]

window.switchTab = function(tab) {
  currentTab = tab
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'))
  event.target.classList.add('active')
  window.loadData()
}

window.loadData = async function() {
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
    document.getElementById('summary_table').innerHTML = '<p>データの取得に失敗しました</p>'
    return
  }

  if (currentTab === 'seiban') renderSeiban(data)
  if (currentTab === 'equipment') renderEquipment(data)
  if (currentTab === 'daily') renderDaily(data)
}

function minutesToHM(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h${String(m).padStart(2, '0')}m`
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
    html += `<tr><td>${seiban}</td><td>${val.equipment}</td><td>${minutesToHM(val.minutes)}</td></tr>`
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
    html += `<tr><td>${equipment}</td><td>${minutesToHM(minutes)}</td></tr>`
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
    html += `<tr><td>${date}</td><td>${minutesToHM(minutes)}</td></tr>`
    total += minutes
  })
  html += `<tr class="total-row"><td>合計</td><td>${minutesToHM(total)}</td></tr>`
  html += '</table>'
  document.getElementById('summary_table').innerHTML = html
}

window.loadData()