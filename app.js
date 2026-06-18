import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://hiibhvtlnwihfiufzuph.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Q8mZdRrn14hFacdUPrNTaw_DyqmSVXv'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// 今日の日付をセット
document.getElementById('work_date').value = new Date().toISOString().split('T')[0]

// 作業内容を読み込む
async function loadWorkTypes() {
  const { data } = await supabase
    .from('work_type_master')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  const select = document.getElementById('work_type')
  select.innerHTML = ''
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
  if (seiban.length < 1) return

  const { data } = await supabase
    .from('seiban_master')
    .select('*')
    .eq('seiban', seiban)
    .single()

  const equipmentInput = document.getElementById('equipment_name')
  const statusEl = document.getElementById('seiban_status')

  if (data) {
    equipmentInput.value = data.equipment_name
    equipmentInput.readOnly = true
    statusEl.textContent = '✅ 登録済み'
    statusEl.style.color = 'green'
  } else {
    equipmentInput.value = ''
    equipmentInput.readOnly = false
    statusEl.textContent = '⚠️ 未登録の製番です。設備名を入力してください'
    statusEl.style.color = '#e74c3c'
  }

  calcActualTime()
}

// 実働時間を計算
function calcActualTime() {
  const start = document.getElementById('start_time').value
  const end = document.getElementById('end_time').value
  const break1 = parseInt(document.getElementById('break1').value) || 0
  const break2 = parseInt(document.getElementById('break2').value) || 0

  if (!start || !end) return

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

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// 保存する
async function saveLog() {
  const seiban = document.getElementById('seiban').value.trim()
  const equipmentName = document.getElementById('equipment_name').value.trim()
  const workTypeId = document.getElementById('work_type').value
  const workDate = document.getElementById('work_date').value
  const startTime = document.getElementById('start_time').value
  const endTime = document.getElementById('end_time').value
  const break1 = parseInt(document.getElementById('break1').value) || 0
  const break2 = parseInt(document.getElementById('break2').value) || 0
  const note = document.getElementById('note').value.trim()

  if (!seiban || !equipmentName || !workDate || !startTime || !endTime) {
    showMessage('⚠️ 必須項目を入力してください', 'error')
    return
  }

  const actualMinutes = timeToMinutes(endTime) - timeToMinutes(startTime) - break1 - break2

  // 製番が未登録なら登録する
  let seibanId
  const { data: existing } = await supabase
    .from('seiban_master')
    .select('id')
    .eq('seiban', seiban)
    .single()

  if (existing) {
    seibanId = existing.id
  } else {
    const { data: newSeiban } = await supabase
      .from('seiban_master')
      .insert({ seiban, equipment_name: equipmentName })
      .select()
      .single()
    seibanId = newSeiban.id
  }

  // 工数を保存
  const { error } = await supabase
    .from('work_logs')
    .insert({
      work_date: workDate,
      seiban_id: seibanId,
      work_type_id: workTypeId,
      start_time: startTime,
      end_time: endTime,
      break1_minutes: break1,
      break2_minutes: break2,
      actual_minutes: actualMinutes,
      note
    })

  if (error) {
    showMessage('❌ 保存に失敗しました', 'error')
  } else {
    showMessage('✅ 保存しました！', 'success')
    document.getElementById('note').value = ''
  }
}

function showMessage(text, type) {
  const el = document.getElementById('message')
  el.textContent = text
  el.className = type
  setTimeout(() => { el.textContent = '' }, 3000)
}

// イベントリスナー
document.getElementById('start_time').addEventListener('input', calcActualTime)
document.getElementById('end_time').addEventListener('input', calcActualTime)
document.getElementById('break1').addEventListener('input', calcActualTime)
document.getElementById('break2').addEventListener('input', calcActualTime)

window.searchSeiban = searchSeiban
window.saveLog = saveLog

loadWorkTypes()