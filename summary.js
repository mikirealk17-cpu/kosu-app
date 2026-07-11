import { supabase } from './supabaseClient.js'
import { getRateTypeLabel, isContractRate } from './rate-utils.js'

const BILLING_COMPANY_CSV_ENABLED = false

let currentTab = 'seiban'
let workerNameMap = {}
let billingCompanyNameMap = {}

const summaryCsvLabels = {
  seiban: '製番別CSV',
  seiban_detail: '製番明細CSV',
  daily: '日別CSV',
  monthly: '月別CSV',
  worker: '作業者別CSV',
  billing_company: '元請け別CSV'
}

const today = new Date()
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
document.getElementById('date_from').value = formatDate(firstDay)
document.getElementById('date_to').value = formatDate(today)

window.switchTab = function(tab) {
  currentTab = tab
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'))
  document.querySelector(`[onclick="switchTab('${tab}')"]`).classList.add('active')
  updateSummaryCsvOption()
  window.loadData()
}

window.loadData = async function() {
  setSummaryStatus('集計を更新中です...')

  if (currentTab === 'worker') {
    await loadWorkerSummary()
    return
  }

  if (currentTab === 'billing_company') {
    await loadBillingCompanySummary()
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
      start_time,
      end_time,
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
    console.error('集計データの取得に失敗しました', error)
    const message = error?.message ? `データの取得に失敗しました: ${escapeHtml(error.message)}` : 'データの取得に失敗しました'
    document.getElementById('summary_table').innerHTML = `<p>${message}</p>`
    renderSummaryMetrics([])
    setSummaryStatus('集計の取得に失敗しました')
    return
  }

  renderSummaryMetrics(data)
  if (currentTab === 'seiban') renderSeiban(data)
  if (currentTab === 'seiban_detail') {
    await loadWorkerNameMap()
    renderSeibanDetail(data)
  }
  if (currentTab === 'daily') renderDaily(data)
  if (currentTab === 'monthly') renderMonthly(data)
  setSummaryStatus(`${data.length}件のデータを表示しました`)
}

function updateSummaryCsvOption() {
  const csvOption = document.getElementById('summary_csv_option')
  const excelOption = document.getElementById('summary_excel_option')

  if (csvOption) csvOption.textContent = summaryCsvLabels[currentTab] || '表示中の集計CSV'
  if (excelOption) {
    const label = (summaryCsvLabels[currentTab] || '表示中の集計CSV').replace('CSV', 'Excel')
    excelOption.textContent = label
  }
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

function minutesToDecimalHours(minutes) {
  return Math.round((minutes / 60) * 100) / 100
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

async function loadBillingCompanyNameMap() {
  const { data, error } = await supabase
    .from('billing_company_master')
    .select('id, name')

  if (error || !data) {
    throw error || new Error('元請け一覧の取得に失敗しました')
  }

  billingCompanyNameMap = {}
  data.forEach(company => {
    billingCompanyNameMap[company.id] = company.name
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
  const button = document.querySelector('.csv-actions button')
  const originalText = button?.textContent || 'ファイル出力'
  if (button) {
    button.disabled = true
    button.textContent = '出力中...'
  }

  const csvType = document.getElementById('csv_type').value

  try {
    let success
    if (csvType === 'summary') {
      success = await exportSummaryCsv()
    } else if (csvType === 'summary_excel') {
      success = await exportSummaryExcel()
    } else if (csvType === 'detail_excel') {
      success = await exportDetailExcel()
    } else if (csvType === 'billing_company') {
      if (!BILLING_COMPANY_CSV_ENABLED) {
        alert('請求確認CSVは工数管理版では通常出力から外しています')
        success = false
      } else {
        success = await exportBillingCompanyCsv()
      }
    } else {
      success = await exportDetailCsv()
    }

    if (button) button.textContent = success === false ? originalText : '出力しました'
  } finally {
    if (button) {
      setTimeout(() => {
        button.disabled = false
        button.textContent = originalText
      }, 1600)
    }
  }
}

async function fetchSummaryRows() {
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
    throw error || new Error('CSV出力データの取得に失敗しました')
  }

  return data
}

async function exportDetailCsv() {
  let exportRows

  try {
    exportRows = await createDetailExportRows()
  } catch (error) {
    console.error('明細CSV出力データの取得に失敗しました', error)
    alert('明細CSV出力データの取得に失敗しました')
    return false
  }

  downloadCsv(exportRows.headers, exportRows.rows, `${exportRows.filenameBase}.csv`)
  return true
}

async function exportDetailExcel() {
  let exportRows

  try {
    exportRows = await createDetailExportRows()
  } catch (error) {
    console.error('明細Excel出力データの取得に失敗しました', error)
    alert('明細Excel出力データの取得に失敗しました')
    return false
  }

  downloadExcel(exportRows.headers, exportRows.rows, `${exportRows.filenameBase}.xls`)
  return true
}

async function createDetailExportRows() {
  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value
  const data = await fetchSummaryRows()

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

  return {
    headers,
    rows,
    filenameBase: `kosu_detail_${from}_${to}`
  }
}

async function exportSummaryCsv() {
  let exportRows

  try {
    exportRows = await createSummaryExportRows()
  } catch (error) {
    console.error('集計CSV出力データの取得に失敗しました', error)
    alert('集計CSV出力データの取得に失敗しました')
    return false
  }

  downloadCsv(exportRows.headers, exportRows.rows, `${exportRows.filenameBase}.csv`)
  return true
}

async function exportSummaryExcel() {
  let exportRows

  try {
    exportRows = await createSummaryExportRows()
  } catch (error) {
    console.error('集計Excel出力データの取得に失敗しました', error)
    alert('集計Excel出力データの取得に失敗しました')
    return false
  }

  downloadExcel(exportRows.headers, exportRows.rows, `${exportRows.filenameBase}.xls`)
  return true
}

async function createSummaryExportRows() {
  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value
  let data

  if (currentTab === 'billing_company') {
    data = await fetchBillingCompanyRows()
    await loadBillingCompanyNameMap()
  } else {
    data = await fetchSummaryRows()
  }

  if (currentTab !== 'billing_company') {
    await loadWorkerNameMap()
  }
  const { headers, rows } = createSummaryCsvRows(data)

  return {
    headers,
    rows,
    filenameBase: `kosu_summary_${currentTab}_${from}_${to}`
  }
}

async function exportBillingCompanyCsv() {
  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value
  let data

  try {
    data = await fetchBillingInvoiceRows()
    await Promise.all([
      loadWorkerNameMap(),
      loadBillingCompanyNameMap()
    ])
  } catch (error) {
    console.error('請求確認CSV出力データの取得に失敗しました', error)
    alert('請求確認CSVには、Supabase側で単価DB設定が必要です')
    return false
  }

  const invalidRows = data.filter(row => (
    !row.billing_company_id ||
    !row.rate_type ||
    !row.rate_master_id ||
    row.unit_price == null
  ))

  if (invalidRows.length > 0) {
    alert('単価情報が未設定の工数があるため、金額CSVを出力できません')
    return false
  }

  const { headers, rows } = createBillingCompanyInvoiceRows(data, from, to)
  downloadCsv(headers, rows, `kosu_billing_company_${from}_${to}.csv`)
  return true
}

function downloadCsv(headers, rows, filename) {
  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ].join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function downloadExcel(headers, rows, filename) {
  const colWidths = getExcelColumnWidths(headers)
  const colgroup = colWidths.map(width => `<col style="width: ${width}px;">`).join('')
  const headerHtml = headers
    .map(header => `<th>${escapeHtml(header)}</th>`)
    .join('')
  const rowsHtml = rows
    .map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell ?? '')}</td>`).join('')}</tr>`)
    .join('')
  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    table { border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 12px; }
    th { background: #f2f4f7; font-weight: 700; }
    th, td { border: 1px solid #c9d1dc; padding: 6px 8px; mso-number-format:"\\@"; vertical-align: top; white-space: nowrap; }
    td:last-child { white-space: normal; }
  </style>
</head>
<body>
  <table>
    <colgroup>${colgroup}</colgroup>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`.trim()

  const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  downloadBlob(blob, filename)
}

function getExcelColumnWidths(headers) {
  const widthMap = {
    '日付': 110,
    '作業者': 140,
    '製番': 130,
    '設備名': 220,
    '作業内容': 180,
    '開始時間': 90,
    '終了時間': 90,
    '休憩1分': 80,
    '休憩2分': 80,
    '実働分': 80,
    '実働時間': 100,
    '備考': 280,
    '月': 100,
    '件数': 80
  }

  return headers.map(header => widthMap[header] || 130)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function createSummaryCsvRows(data) {
  if (currentTab === 'seiban') return createSeibanSummaryRows(data)
  if (currentTab === 'seiban_detail') return createSeibanDetailRows(data)
  if (currentTab === 'daily') return createDailySummaryRows(data)
  if (currentTab === 'monthly') return createMonthlySummaryRows(data)
  if (currentTab === 'worker') return createWorkerSummaryRows(data)
  if (currentTab === 'billing_company') return createBillingCompanySummaryRows(data)
  return { headers: ['項目', '工数'], rows: [] }
}

function createSeibanSummaryRows(data) {
  const map = {}
  data.forEach(row => {
    const seiban = row.seiban_master?.seiban || '不明'
    const equipment = row.seiban_master?.equipment_name || '不明'
    if (!map[seiban]) map[seiban] = { equipment, minutes: 0 }
    map[seiban].minutes += row.actual_minutes || 0
  })

  return {
    headers: ['製番', '設備名', '実働分', '実働時間'],
    rows: Object.entries(map).map(([seiban, val]) => [
      seiban,
      val.equipment,
      val.minutes,
      minutesToHM(val.minutes)
    ])
  }
}

function createSeibanDetailRows(data) {
  return {
    headers: ['日付', '製番', '設備名', '作業者', '開始時間', '終了時間', '実働分', '実働時間'],
    rows: data.map(row => [
      row.work_date,
      row.seiban_master?.seiban || '',
      row.seiban_master?.equipment_name || '',
      workerNameMap[row.worker_id] || '',
      formatTime(row.start_time),
      formatTime(row.end_time),
      row.actual_minutes || 0,
      minutesToHM(row.actual_minutes || 0)
    ])
  }
}

function createDailySummaryRows(data) {
  const map = {}
  data.forEach(row => {
    if (!map[row.work_date]) map[row.work_date] = 0
    map[row.work_date] += row.actual_minutes || 0
  })

  return {
    headers: ['日付', '実働分', '実働時間'],
    rows: Object.entries(map).map(([date, minutes]) => [
      date,
      minutes,
      minutesToHM(minutes)
    ])
  }
}

function createMonthlySummaryRows(data) {
  const map = {}
  data.forEach(row => {
    const month = row.work_date.slice(0, 7)
    if (!map[month]) map[month] = { minutes: 0, count: 0 }
    map[month].minutes += row.actual_minutes || 0
    map[month].count += 1
  })

  return {
    headers: ['月', '件数', '実働分', '実働時間'],
    rows: Object.entries(map).map(([month, val]) => [
      month,
      val.count,
      val.minutes,
      minutesToHM(val.minutes)
    ])
  }
}

function createWorkerSummaryRows(data) {
  const map = {}
  data.forEach(row => {
    const worker = workerNameMap[row.worker_id] || '作業者未設定'
    if (!map[worker]) map[worker] = 0
    map[worker] += row.actual_minutes || 0
  })

  return {
    headers: ['作業者', '実働分', '実働時間'],
    rows: Object.entries(map).map(([worker, minutes]) => [
      worker,
      minutes,
      minutesToHM(minutes)
    ])
  }
}

function createBillingCompanySummaryRows(data) {
  const map = {}
  data.forEach(row => {
    const company = billingCompanyNameMap[row.billing_company_id] || '元請け未設定'
    if (!map[company]) map[company] = { count: 0, minutes: 0 }
    map[company].count += 1
    map[company].minutes += row.actual_minutes || 0
  })

  return {
    headers: ['元請け', '件数', '実働分', '実働時間'],
    rows: Object.entries(map).map(([company, val]) => [
      company,
      val.count,
      val.minutes,
      minutesToHM(val.minutes)
    ])
  }
}

function createBillingCompanyInvoiceRows(data, from, to) {
  const map = {}
  data.forEach(row => {
    const company = billingCompanyNameMap[row.billing_company_id] || '元請け未設定'
    const worker = workerNameMap[row.worker_id] || '作業者未設定'
    const seiban = row.seiban_master?.seiban || '不明'
    const equipment = row.seiban_master?.equipment_name || '不明'
    const workType = row.work_type_master?.name || '不明'
    const key = `${company}__${worker}__${seiban}__${equipment}__${workType}__${row.rate_type}__${row.unit_price}`

    if (!map[key]) {
      map[key] = {
        from,
        to,
        company,
        worker,
        seiban,
        equipment,
        workType,
        rateType: row.rate_type,
        unitPrice: Number(row.unit_price) || 0,
        count: 0,
        minutes: 0,
        amount: 0,
        contractKey: `${row.billing_company_id}__${row.seiban_id}`
      }
    }

    map[key].count += 1
    map[key].minutes += row.actual_minutes || 0
    if (!isContractRate(row.rate_type)) {
      map[key].amount += row.billing_amount || 0
    }
  })

  const countedContracts = new Set()
  const rows = Object.values(map)
    .sort((a, b) => (
      a.company.localeCompare(b.company, 'ja') ||
      a.seiban.localeCompare(b.seiban, 'ja') ||
      a.worker.localeCompare(b.worker, 'ja') ||
      a.workType.localeCompare(b.workType, 'ja')
    ))
    .map(row => {
      let amount = row.amount
      let billingFlag = '計上'

      if (isContractRate(row.rateType)) {
        if (countedContracts.has(row.contractKey)) {
          amount = 0
          billingFlag = '内訳のみ'
        } else {
          countedContracts.add(row.contractKey)
          amount = row.unitPrice
          billingFlag = '計上'
        }
      }

      return [
        row.from,
        row.to,
        row.company,
        getRateTypeLabel(row.rateType),
        row.worker,
        row.seiban,
        row.equipment,
        row.workType,
        row.count,
        row.minutes,
        minutesToHM(row.minutes),
        minutesToDecimalHours(row.minutes),
        row.unitPrice,
        amount,
        billingFlag
      ]
    })

  return {
    headers: ['開始日', '終了日', '元請け', '単価区分', '作業者', '製番', '設備名', '作業内容', '件数', '実働分', '実働時間', '実働時間(小数)', '単価', '金額', '請負計上フラグ'],
    rows
  }
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
    renderSummaryMetrics([])
    setSummaryStatus('作業者別集計の取得に失敗しました')
    return
  }

  await loadWorkerNameMap()
  renderSummaryMetrics(data)
  renderWorker(data)
  setSummaryStatus(`${data.length}件のデータを表示しました`)
}

async function loadBillingCompanySummary() {
  try {
    const data = await fetchBillingCompanyRows()
    await loadBillingCompanyNameMap()
    renderSummaryMetrics(data)
    renderBillingCompany(data)
    setSummaryStatus(`${data.length}件のデータを表示しました`)
  } catch (error) {
    console.error('元請け別集計データの取得に失敗しました', error)
    document.getElementById('summary_table').innerHTML = '<p>元請け別集計には、Supabase側で元請けDB設定が必要です</p>'
    renderSummaryMetrics([])
    setSummaryStatus('元請け別集計の取得に失敗しました')
  }
}

async function fetchBillingCompanyRows() {
  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value
  const filters = getFilters()

  let query = supabase
    .from('work_logs')
    .select(`
      actual_minutes,
      work_date,
      worker_id,
      seiban_id,
      billing_company_id,
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
    throw error || new Error('元請け別集計データの取得に失敗しました')
  }

  return data
}

async function fetchBillingInvoiceRows() {
  const from = document.getElementById('date_from').value
  const to = document.getElementById('date_to').value
  const filters = getFilters()

  let query = supabase
    .from('work_logs')
    .select(`
      actual_minutes,
      work_date,
      worker_id,
      seiban_id,
      billing_company_id,
      rate_type,
      rate_master_id,
      unit_price,
      billing_amount,
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
    throw error || new Error('請求確認CSV出力データの取得に失敗しました')
  }

  return data
}

function renderSummaryMetrics(data) {
  const totalMinutes = data.reduce((sum, row) => sum + (row.actual_minutes || 0), 0)
  const recordCount = data.length
  const averageMinutes = recordCount ? Math.round(totalMinutes / recordCount) : 0
  const workerCount = new Set(data.map(row => row.worker_id).filter(Boolean)).size

  const cards = [
    { label: '総実働時間', value: minutesToHM(totalMinutes), note: '期間内の合計' },
    { label: '入力件数', value: `${recordCount}件`, note: '保存済み工数' },
    { label: '平均実働', value: minutesToHM(averageMinutes), note: '1件あたり' },
    { label: '作業者数', value: `${workerCount}人`, note: '期間内に入力あり' }
  ]

  document.getElementById('summary_metrics').innerHTML = cards.map(card => `
    <article class="metric-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.note)}</small>
    </article>
  `).join('')
}

function renderBillingCompany(data) {
  const map = {}
  data.forEach(row => {
    const company = billingCompanyNameMap[row.billing_company_id] || '元請け未設定'
    if (!map[company]) {
      map[company] = { count: 0, minutes: 0 }
    }
    map[company].count += 1
    map[company].minutes += row.actual_minutes || 0
  })

  let html = '<table><tr><th>元請け</th><th>件数</th><th>工数</th></tr>'
  let totalMinutes = 0
  let totalCount = 0
  Object.entries(map).forEach(([company, val]) => {
    html += `<tr><td>${escapeHtml(company)}</td><td>${val.count}件</td><td>${minutesToHM(val.minutes)}</td></tr>`
    totalMinutes += val.minutes
    totalCount += val.count
  })
  html += `<tr class="total-row"><td>合計</td><td>${totalCount}件</td><td>${minutesToHM(totalMinutes)}</td></tr>`
  html += '</table>'
  document.getElementById('summary_table').innerHTML = html
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

function renderSeibanDetail(data) {
  let html = '<table><tr><th>日付</th><th>製番</th><th>作業者</th><th>時間</th><th>工数</th></tr>'
  let total = 0

  data.forEach(row => {
    const seiban = row.seiban_master?.seiban || '不明'
    const equipment = row.seiban_master?.equipment_name || '不明'
    const worker = workerNameMap[row.worker_id] || '作業者未設定'
    const time = `${formatTime(row.start_time)}-${formatTime(row.end_time)}`
    const minutes = row.actual_minutes || 0
    html += `
      <tr>
        <td>${escapeHtml(row.work_date)}</td>
        <td>${escapeHtml(seiban)}<br>${escapeHtml(equipment)}</td>
        <td>${escapeHtml(worker)}</td>
        <td>${escapeHtml(time)}</td>
        <td>${minutesToHM(minutes)}</td>
      </tr>
    `
    total += minutes
  })

  html += `<tr class="total-row"><td colspan="4">合計</td><td>${minutesToHM(total)}</td></tr>`
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

function renderMonthly(data) {
  const map = {}
  data.forEach(row => {
    const month = row.work_date.slice(0, 7)
    if (!map[month]) map[month] = { minutes: 0, count: 0 }
    map[month].minutes += row.actual_minutes || 0
    map[month].count += 1
  })

  let html = '<table><tr><th>月</th><th>件数</th><th>工数</th></tr>'
  let totalMinutes = 0
  let totalCount = 0
  Object.entries(map).forEach(([month, val]) => {
    html += `<tr><td>${escapeHtml(month)}</td><td>${val.count}件</td><td>${minutesToHM(val.minutes)}</td></tr>`
    totalMinutes += val.minutes
    totalCount += val.count
  })
  html += `<tr class="total-row"><td>合計</td><td>${totalCount}件</td><td>${minutesToHM(totalMinutes)}</td></tr>`
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

updateSummaryCsvOption()
await loadFilterOptions()
window.loadData()
