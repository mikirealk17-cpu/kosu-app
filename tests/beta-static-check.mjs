import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getSafeLocalRedirect } from '../login-redirect.mjs'
import {
  getRecentProductionNumberKeys,
  isSimilarProductionNumber,
  normalizeProductionNumber,
  rememberRecentProductionNumber,
  sortProductionNumberCandidatesByRecent
} from '../production-number-utils.mjs'
import { hasTimeOverlap } from '../time-rules.mjs'

const files = await Promise.all([
  'app.js',
  'auth.js',
  'logs.js',
  'login.js',
  'login-redirect.mjs',
  'production-number-utils.mjs',
  'time-rules.mjs',
  'summary.js',
  'seibans.js',
  'index.html',
  'logs.html',
  'supabaseClient.js',
  'SUPABASE_AUTH_RLS_POLICIES.sql',
  'SUPABASE_BETA_AUDIT_SETUP.sql',
  'SUPABASE_BETA_VALIDATION_SETUP.sql',
  'SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql',
  'SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql',
  'SUPABASE_SEIBAN_PRODUCTION_NUMBER_RLS_HARDEN.sql',
  'SEIBAN_PRODUCTION_NUMBER_DB_RUNBOOK.md'
].map(async path => [path, await readFile(new URL(`../${path}`, import.meta.url), 'utf8')]))

const source = Object.fromEntries(files)

assert.match(source['index.html'], /id="save_button"/)
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
assert.match(source['app.js'], /normalizeProductionNumber/)
assert.match(source['app.js'], /showDefaultSeibanCandidates/)
assert.match(source['logs.js'], /registerEditSeibanFromInput/)
assert.match(source['logs.js'], /showDefaultEditSeibanCandidates/)
assert.match(source['seibans.js'], /merge_pending_seiban/)
assert.match(source['auth.js'], /const WORKER_BLOCKED_HREFS = \[/)
assert.doesNotMatch(source['auth.js'], /WORKER_BLOCKED_HREFS = \[[\s\S]*?'summary\.html'[\s\S]*?\]/)
assert.match(source['summary.js'], /requireAuth\(\[ROLES\.ADMIN, ROLES\.WORKER\]\)/)
assert.match(source['summary.js'], /authContext\.isWorker[\s\S]*authContext\.profile\.worker_id/)
assert.match(source['summary.js'], /select\.disabled = authContext\.isWorker/)
assert.match(source['SUPABASE_BETA_AUDIT_SETUP.sql'], /create table if not exists public\.audit_log/i)
assert.match(source['SUPABASE_BETA_AUDIT_SETUP.sql'], /old_data jsonb/i)
assert.match(source['SUPABASE_BETA_VALIDATION_SETUP.sql'], /work_logs_actual_minutes_beta/i)
assert.match(source['SUPABASE_BETA_VALIDATION_SETUP.sql'], /not valid/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /seiban_master_seiban_key_uidx/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /merge_pending_seiban/i)
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

const browserSource = Object.entries(source)
  .filter(([path]) => path.endsWith('.js'))
  .map(([, value]) => value)
  .join('\n')

assert.doesNotMatch(browserSource, /service_role\s*[:=]/i)
assert.doesNotMatch(browserSource, /sb_secret_/i)

for (const htmlPath of ['index.html', 'logs.html']) {
  const ids = [...source[htmlPath].matchAll(/\sid="([^"]+)"/g)].map(match => match[1])
  assert.equal(new Set(ids).size, ids.length, `${htmlPath} に重複したidがあります`)
}

const loginUrl = 'https://kosu-app-kappa.vercel.app/login.html'
assert.equal(getSafeLocalRedirect('logs.html?from=login', loginUrl), 'logs.html?from=login')
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
assert.match(source['production-number-utils.mjs'], /rememberRecentProductionNumber/)
assert.match(source['production-number-utils.mjs'], /sortProductionNumberCandidatesByRecent/)
assert.match(source['production-number-utils.mjs'], /kosu_recent_seiban_keys_v1/)

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
