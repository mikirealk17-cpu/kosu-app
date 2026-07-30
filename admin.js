import { supabase } from './supabaseClient.js'
import { requireAuth, ROLES } from './auth.js'

await requireAuth([ROLES.ADMIN])

const countTargets = [
  { id: 'count_workers', table: 'worker_master', label: '作業者', activeOnly: true },
  { id: 'count_work_types', table: 'work_type_master', label: '作業内容', activeOnly: true },
  { id: 'count_seibans', table: 'seiban_master', label: '製番', activeOnly: true },
  { id: 'count_logs', table: 'work_logs', label: '工数記録' }
]

async function loadAdminCounts() {
  const status = document.getElementById('admin_status')
  status.textContent = '登録件数を読み込み中です...'

  const results = await Promise.all(countTargets.map(loadCount))
  const failed = results.filter(result => !result.ok)

  if (failed.length > 0) {
    status.textContent = '一部の登録件数を読み込めませんでした'
    return
  }

  status.textContent = '登録件数を表示しました'
}

async function loadCount(target) {
  let query = supabase
    .from(target.table)
    .select('*', { count: 'exact', head: true })

  if (target.activeOnly) query = query.eq('is_active', true)

  let { count, error } = await query

  if (target.activeOnly && isMissingActiveColumn(error)) {
    const fallback = await supabase
      .from(target.table)
      .select('*', { count: 'exact', head: true })
    count = fallback.count
    error = fallback.error
  }

  const el = document.getElementById(target.id)

  if (error) {
    console.error(`${target.label}の件数取得に失敗しました`, error)
    el.textContent = '--'
    return { ok: false }
  }

  el.textContent = String(count ?? 0)
  return { ok: true }
}

function isMissingActiveColumn(error) {
  if (!error) return false
  return error.code === '42703' || String(error.message || '').includes('is_active')
}

loadAdminCounts()
