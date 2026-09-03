import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getSafeLocalRedirect } from '../login-redirect.mjs'
import {
  filterRecentProductionNumberCandidates,
  getRecentProductionNumberKeys,
  isSimilarProductionNumber,
  normalizeProductionNumber,
  rememberRecentProductionNumber,
  sortProductionNumberCandidatesByRecent
} from '../production-number-utils.mjs'
import { hasTimeOverlap } from '../time-rules.mjs'
import {
  EMPTY_COMPANY_ID,
  chooseActiveCompany,
  getCompanyInsertFields,
  isAdminRole,
  isMissingMultiCompanyFunctionError,
  scopeCompanyQuery
} from '../company-context.mjs'

const files = await Promise.all([
  'app.js',
  'admin.html',
  'admin.js',
  'auth.js',
  'logs.js',
  'login.js',
  'login-redirect.mjs',
  'production-number-utils.mjs',
  'time-rules.mjs',
  'summary.js',
  'seibans.js',
  'companies.html',
  'companies.js',
  'company-users.html',
  'company-users.js',
  'company-context.mjs',
  'rates.js',
  'workers.js',
  'work-types.js',
  'billing-companies.js',
  'index.html',
  'logs.html',
  'style.css',
  'supabaseClient.js',
  'SUPABASE_AUTH_RLS_POLICIES.sql',
  'SUPABASE_BETA_AUDIT_CONFIRM_ONLY.sql',
  'SUPABASE_BETA_AUDIT_SETUP.sql',
  'SUPABASE_BETA_VALIDATION_CONFIRM_ONLY.sql',
  'SUPABASE_BETA_VALIDATION_SETUP.sql',
  'SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql',
  'SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql',
  'SUPABASE_SEIBAN_PRODUCTION_NUMBER_RLS_HARDEN.sql',
  'SEIBAN_PRODUCTION_NUMBER_DB_RUNBOOK.md',
  'SUPABASE_MULTI_COMPANY_CONFIRM_ONLY.sql',
  'SUPABASE_MULTI_COMPANY_BACKFILL_TEMPLATE.sql',
  'supabase/migrations/202608180001_multi_company_prepare.sql',
  'supabase/migrations/202608180002_multi_company_enforce.sql',
  'supabase/functions/invite-company-user/index.ts'
].map(async path => [path, await readFile(new URL(`../${path}`, import.meta.url), 'utf8')]))

const source = Object.fromEntries(files)

assert.match(source['index.html'], /id="save_button"/)
assert.match(source['index.html'], /＋ 未登録の生産番号を新しく登録する/)
assert.match(source['logs.html'], /＋ 未登録の生産番号を新しく登録する/)
assert.match(source['style.css'], /\.register-seiban-btn[\s\S]*min-height: 54px/)
assert.match(source['style.css'], /\.register-seiban-btn[\s\S]*box-shadow/)
assert.match(source['app.js'], /if \(isSaving\) return/)
assert.match(source['app.js'], /hasDuplicate === null/)
assert.match(source['logs.html'], /id="update_button"/)
assert.match(source['logs.js'], /if \(isUpdating\) return/)
assert.match(source['logs.js'], /hasOverlappingTimeLog/)
assert.match(source['logs.js'], /\.neq\('id', excludedId\)/)
assert.match(source['login.js'], /getSafeLocalRedirect/)
assert.match(source['login.js'], /\['index\.html', 'logs\.html', 'summary\.html'\]/)
assert.match(source['login-redirect.mjs'], /candidate\.origin !== current\.origin/)
assert.match(source['summary.js'], /exportRows\.rows\.length === 0/)
assert.match(source['summary.js'], /const refreshed = await window\.loadData\(\)/)
assert.match(source['summary.js'], /getDisplayedRowsForExport/)
assert.match(source['summary.js'], /headers: \['日付', '製番', '設備名', '作業者', '作業内容', '実働時間'\]/)
assert.match(source['summary.js'], /<th>作業内容<\/th>/)
assert.doesNotMatch(source['summary.js'], /headers: \[[^\]]*'開始時間'[^\]]*\]/)
assert.doesNotMatch(source['summary.js'], /headers: \[[^\]]*'終了時間'[^\]]*\]/)
assert.doesNotMatch(source['summary.js'], /headers: \[[^\]]*'休憩1分'[^\]]*\]/)
assert.doesNotMatch(source['summary.js'], /headers: \[[^\]]*'休憩2分'[^\]]*\]/)
assert.doesNotMatch(source['summary.js'], /headers: \[[^\]]*'実働分'[^\]]*\]/)
assert.match(source['app.js'], /normalizeProductionNumber/)
assert.match(source['app.js'], /showDefaultSeibanCandidates/)
assert.match(source['app.js'], /insertError\?\.code === '23505'[\s\S]*findActiveSeiban\(seiban\)/)
assert.match(source['app.js'], /status: authContext\.isWorker \? 'pending' : 'confirmed'/)
assert.match(source['logs.js'], /registerEditSeibanFromInput/)
assert.match(source['logs.js'], /showDefaultEditSeibanCandidates/)
assert.match(source['logs.js'], /insertError\?\.code === '23505'[\s\S]*findActiveSeibanByCode\(seiban\)/)
assert.match(source['logs.js'], /status: authContext\.isWorker \? 'pending' : 'confirmed'/)
assert.match(source['seibans.js'], /merge_pending_seiban/)
assert.match(source['seibans.js'], /status: 'confirmed',[\s\S]*confirmed_by: authContext\.session\.user\.id[\s\S]*confirmed_at: new Date\(\)\.toISOString\(\)/)
assert.match(source['auth.js'], /const WORKER_BLOCKED_HREFS = \[/)
assert.match(source['auth.js'], /WORKER_BLOCKED_HREFS = \[[\s\S]*?'companies\.html'[\s\S]*?'company-users\.html'[\s\S]*?\]/)
assert.doesNotMatch(source['auth.js'], /WORKER_BLOCKED_HREFS = \[[\s\S]*?'summary\.html'[\s\S]*?\]/)
assert.match(source['summary.js'], /requireAuth\(\[ROLES\.ADMIN, ROLES\.COMPANY_ADMIN, ROLES\.WORKER\]\)/)
assert.match(source['summary.js'], /authContext\.isWorker[\s\S]*authContext\.profile\.worker_id/)
assert.match(source['summary.js'], /select\.disabled = authContext\.isWorker/)
assert.match(source['summary.js'], /applyWorkerSummaryMode/)
assert.match(source['summary.js'], /自分の工数集計/)
assert.match(source['summary.js'], /他の作業者は含めません/)
assert.match(source['auth.js'], /自分の履歴確認、自分の集計/)
assert.match(source['SUPABASE_BETA_AUDIT_SETUP.sql'], /create table if not exists public\.audit_log/i)
assert.match(source['SUPABASE_BETA_AUDIT_SETUP.sql'], /old_data jsonb/i)
assert.match(source['SUPABASE_BETA_AUDIT_CONFIRM_ONLY.sql'], /audit_ready_summary|target_tables|audit_triggers/)
assert.doesNotMatch(source['SUPABASE_BETA_AUDIT_CONFIRM_ONLY.sql'], /\b(update|delete|insert|alter|create)\b/i)
assert.match(source['SUPABASE_BETA_VALIDATION_CONFIRM_ONLY.sql'], /work_logs_existing_data|seiban_master_existing_data|expected_constraints_present/)
assert.doesNotMatch(source['SUPABASE_BETA_VALIDATION_CONFIRM_ONLY.sql'], /\b(update|delete|insert|alter|create)\b/i)
assert.match(source['SUPABASE_BETA_VALIDATION_SETUP.sql'], /work_logs_actual_minutes_beta/i)
assert.match(source['SUPABASE_BETA_VALIDATION_SETUP.sql'], /not valid/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /seiban_master_seiban_key_uidx/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /merge_pending_seiban/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /only system_admin can merge seiban_master rows/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /source seiban must exist and be pending/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /update public\.work_logs[\s\S]*where seiban_id = source_id;[\s\S]*delete from public\.seiban_master[\s\S]*where id = source_id;/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /revoke all on function public\.merge_pending_seiban\(uuid, uuid\) from anon/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /(^|\n)begin;\n/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /(^|\n)commit;\n/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /Run SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY\.sql/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_RLS_HARDEN.sql'], /status = 'pending'/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_RLS_HARDEN.sql'], /created_by = auth\.uid\(\)/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_RLS_HARDEN.sql'], /only system_admin can merge seiban_master rows/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_RLS_HARDEN.sql'], /revoke all on function public\.normalize_seiban_key\(text\) from anon/i)
assert.match(source['SUPABASE_AUTH_RLS_POLICIES.sql'], /column_name in \('status', 'created_by', 'confirmed_by', 'confirmed_at'\)/i)
assert.match(source['SUPABASE_AUTH_RLS_POLICIES.sql'], /status = 'pending'/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql'], /duplicate_count/i)
assert.doesNotMatch(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql'], /\b(update|delete|insert|alter|create)\b/i)
assert.match(source['SEIBAN_PRODUCTION_NUMBER_DB_RUNBOOK.md'], /empty_key_rows/)
assert.match(source['SEIBAN_PRODUCTION_NUMBER_DB_RUNBOOK.md'], /SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP\.sql/)
assert.match(source['SEIBAN_PRODUCTION_NUMBER_DB_RUNBOOK.md'], /SUPABASE_SEIBAN_PRODUCTION_NUMBER_RLS_HARDEN\.sql/)
assert.match(source['auth.js'], /COMPANY_ADMIN: 'company_admin'/)
assert.match(source['auth.js'], /multi_company_ready/)
assert.match(source['auth.js'], /この会社は現在利用できません/)
assert.match(source['auth.js'], /ACTIVE_COMPANY_STORAGE_KEY/)
assert.match(source['admin.html'], /href="companies\.html"/)
assert.match(source['admin.html'], /href="company-users\.html"/)
assert.match(source['companies.js'], /requireAuth\(\[ROLES\.ADMIN\]\)/)
assert.match(source['company-users.js'], /requireAuth\(\[ROLES\.ADMIN, ROLES\.COMPANY_ADMIN\]\)/)
assert.match(source['company-users.js'], /functions\.invoke\('invite-company-user'/)
assert.match(source['company-users.js'], /scopeCompanyQuery/)
assert.match(source['app.js'], /getCompanyInsertFields\(authContext\)/)
assert.match(source['logs.js'], /getCompanyInsertFields\(authContext\)/)
for (const path of ['admin.js', 'app.js', 'logs.js', 'rates.js', 'seibans.js', 'summary.js', 'workers.js', 'work-types.js', 'billing-companies.js']) {
  assert.match(source[path] || await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), /scopeCompanyQuery/)
}
for (const path of ['rates.js', 'seibans.js', 'workers.js', 'work-types.js', 'billing-companies.js']) {
  assert.match(source[path], /scopeCompanyQuery\(supabase[\s\S]*?\.update\([\s\S]*?authContext\)/)
}
assert.match(source['logs.js'], /scopeCompanyQuery\(supabase[\s\S]*?\.delete\(\)[\s\S]*?authContext\)/)
assert.match(source['logs.js'], /scopeCompanyQuery\(supabase[\s\S]*?\.update\(updateData\)[\s\S]*?authContext\)/)
assert.match(source['companies.js'], /try \{[\s\S]*finally \{[\s\S]*setSaving\(false\)/)
assert.match(source['supabase/migrations/202608180001_multi_company_prepare.sql'], /multi_company_enabled.*false/is)
assert.match(source['supabase/migrations/202608180001_multi_company_prepare.sql'], /multi_company_ready/i)
assert.match(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /company_id backfill is incomplete/i)
assert.match(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /cross-company work log reference exists/i)
assert.match(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /validate_work_log_company/i)
assert.match(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /company\.is_active = true/i)
assert.match(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /status = 'pending' and created_by = \(select auth\.uid\(\)\)/i)
assert.match(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /grant select on public\.user_profiles to authenticated/i)
assert.doesNotMatch(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /create policy profile_(insert|update)/i)
assert.match(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /target must belong to the same company/i)
assert.match(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /update public\.rate_master set seiban_id = target_id/i)
assert.match(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /user_profiles_auth_user_id_idx/i)
assert.match(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /revoke all on public\.company_master[\s\S]*from authenticated/i)
assert.match(source['supabase/migrations/202608180002_multi_company_enforce.sql'], /multi_company_enabled';\n[\s\S]*commit;/i)
assert.doesNotMatch(source['SUPABASE_MULTI_COMPANY_CONFIRM_ONLY.sql'], /\b(update|delete|insert|alter|create|drop)\b/i)
assert.match(source['SUPABASE_MULTI_COMPANY_CONFIRM_ONLY.sql'], /active_profile_count/i)
assert.match(source['SUPABASE_MULTI_COMPANY_CONFIRM_ONLY.sql'], /rate_type/i)
assert.match(source['SUPABASE_MULTI_COMPANY_BACKFILL_TEMPLATE.sql'], /target_company_id uuid := null/)
assert.match(source['SUPABASE_MULTI_COMPANY_BACKFILL_TEMPLATE.sql'], /Cross-company references remain/)
assert.match(source['SUPABASE_MULTI_COMPANY_BACKFILL_TEMPLATE.sql'], /set company_id = worker\.company_id/i)
assert.match(source['SUPABASE_MULTI_COMPANY_BACKFILL_TEMPLATE.sql'], /User profile company assignment is incomplete/i)
assert.match(source['supabase/functions/invite-company-user/index.ts'], /SUPABASE_SERVICE_ROLE_KEY/)
assert.match(source['supabase/functions/invite-company-user/index.ts'], /caller\.role === 'company_admin' \? 'worker'/)
assert.match(source['supabase/functions/invite-company-user/index.ts'], /body\.companyId !== caller\.company_id/)
assert.match(source['supabase/functions/invite-company-user/index.ts'], /auth\.admin\.deleteUser/)
assert.match(source['supabase/functions/invite-company-user/index.ts'], /supabase-js@2\.108\.2/)
assert.match(source['supabase/functions/invite-company-user/index.ts'], /getSafeAppOrigin/)
assert.match(source['supabase/functions/invite-company-user/index.ts'], /deleteCreatedUser/)
assert.match(source['supabaseClient.js'], /supabase-js@2\.108\.2/)

const browserSource = Object.entries(source)
  .filter(([path]) => path.endsWith('.js'))
  .map(([, value]) => value)
  .join('\n')

assert.doesNotMatch(browserSource, /service_role\s*[:=]/i)
assert.doesNotMatch(browserSource, /sb_secret_/i)

for (const htmlPath of ['index.html', 'logs.html', 'companies.html', 'company-users.html']) {
  const ids = [...source[htmlPath].matchAll(/\sid="([^"]+)"/g)].map(match => match[1])
  assert.equal(new Set(ids).size, ids.length, `${htmlPath} に重複したidがあります`)
}

const loginUrl = 'https://kosu-app-kappa.vercel.app/login.html'
assert.equal(getSafeLocalRedirect('logs.html?from=login', loginUrl), 'logs.html?from=login')
assert.equal(getSafeLocalRedirect('companies.html', loginUrl), 'companies.html')
assert.equal(getSafeLocalRedirect('company-users.html', loginUrl), 'company-users.html')
assert.equal(getSafeLocalRedirect('javascript:alert(1)', loginUrl), '')
assert.equal(getSafeLocalRedirect('https://example.com/admin.html', loginUrl), '')
assert.equal(getSafeLocalRedirect('//example.com/admin.html', loginUrl), '')
assert.equal(getSafeLocalRedirect('../admin.html', 'https://kosu-app-kappa.vercel.app/app/login.html'), '')
assert.equal(getSafeLocalRedirect('unknown.html', loginUrl), '')

assert.equal(hasTimeOverlap('08:00', '09:00', '08:30:00', '09:30:00'), true)
assert.equal(hasTimeOverlap('08:00', '09:00', '09:00:00', '10:00:00'), false)
assert.equal(hasTimeOverlap('09:00', '10:00', '08:00:00', '09:00:00'), false)
assert.equal(hasTimeOverlap('08:00', '10:00', '08:30:00', '09:30:00'), true)
assert.equal(hasTimeOverlap('invalid', '10:00', '08:30:00', '09:30:00'), false)

assert.equal(normalizeProductionNumber('ab-123'), 'AB-123')
assert.equal(normalizeProductionNumber('ＡＢ－１２３'), 'AB-123')
assert.equal(normalizeProductionNumber(' AB-123 '), 'AB-123')
assert.equal(normalizeProductionNumber('AB 123'), 'AB123')
assert.equal(normalizeProductionNumber('AB--123'), 'AB-123')
assert.equal(normalizeProductionNumber('AB－123'), 'AB-123')
assert.equal(isSimilarProductionNumber('AB-123', 'AB123'), true)
assert.equal(isSimilarProductionNumber('AB-123', 'AB-124'), true)
assert.equal(isSimilarProductionNumber('AB-123', 'XY-999'), false)
assert.equal(isAdminRole('system_admin'), true)
assert.equal(isAdminRole('company_admin'), true)
assert.equal(isAdminRole('worker'), false)
assert.equal(chooseActiveCompany([{ id: 'a' }, { id: 'b' }], 'b').id, 'b')
assert.equal(chooseActiveCompany([{ id: 'a' }], 'missing').id, 'a')
assert.deepEqual(getCompanyInsertFields({ multiCompanyEnabled: true, companyId: 'company-a' }), { company_id: 'company-a' })
assert.deepEqual(getCompanyInsertFields({ multiCompanyEnabled: false, companyId: 'company-a' }), {})
assert.equal(isMissingMultiCompanyFunctionError({ code: 'PGRST202' }), true)
assert.equal(isMissingMultiCompanyFunctionError({ code: '42883' }), true)
assert.equal(isMissingMultiCompanyFunctionError({ code: '42501', message: 'permission denied' }), false)
assert.equal(isMissingMultiCompanyFunctionError({ message: 'network request failed' }), false)
const companyScopeCalls = []
const fakeQuery = { eq(column, value) { companyScopeCalls.push([column, value]); return this } }
scopeCompanyQuery(fakeQuery, { multiCompanyEnabled: true, companyId: 'company-a' })
scopeCompanyQuery(fakeQuery, { multiCompanyEnabled: true, companyId: null })
assert.deepEqual(companyScopeCalls, [['company_id', 'company-a'], ['company_id', EMPTY_COMPANY_ID]])
assert.match(source['production-number-utils.mjs'], /rememberRecentProductionNumber/)
assert.match(source['production-number-utils.mjs'], /sortProductionNumberCandidatesByRecent/)
assert.match(source['production-number-utils.mjs'], /filterRecentProductionNumberCandidates/)
assert.match(source['production-number-utils.mjs'], /kosu_recent_seiban_keys_v1/)
assert.match(source['app.js'], /最近使った生産番号はまだありません。文字を入力して検索してください/)
assert.match(source['logs.js'], /最近使った生産番号はまだありません。文字を入力して検索してください/)

const fakeStorage = createFakeStorage()
rememberRecentProductionNumber({ seiban: 'AB-123', seiban_key: 'AB-123' }, fakeStorage)
rememberRecentProductionNumber({ seiban: 'CD-456', seiban_key: 'CD-456' }, fakeStorage)
rememberRecentProductionNumber({ seiban: 'AB-123', seiban_key: 'AB-123' }, fakeStorage)
assert.deepEqual(getRecentProductionNumberKeys(fakeStorage), ['AB-123', 'CD-456'])

const sortedCandidates = sortProductionNumberCandidatesByRecent([
  { seiban: 'ZZ-999', seiban_key: 'ZZ-999' },
  { seiban: 'CD-456', seiban_key: 'CD-456' },
  { seiban: 'AB-123', seiban_key: 'AB-123' }
], getRecentProductionNumberKeys(fakeStorage))
assert.deepEqual(sortedCandidates.map(row => row.seiban), ['AB-123', 'CD-456', 'ZZ-999'])

const recentOnlyCandidates = filterRecentProductionNumberCandidates([
  { seiban: 'ZZ-999', seiban_key: 'ZZ-999' },
  { seiban: 'CD-456', seiban_key: 'CD-456' },
  { seiban: 'AB-123', seiban_key: 'AB-123' }
], getRecentProductionNumberKeys(fakeStorage))
assert.deepEqual(recentOnlyCandidates.map(row => row.seiban), ['AB-123', 'CD-456'])

console.log('β版の静的安全チェック: OK')

function createFakeStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    }
  }
}
