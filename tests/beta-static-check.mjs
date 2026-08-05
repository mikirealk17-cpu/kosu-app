import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getSafeLocalRedirect } from '../login-redirect.mjs'
import {
  isSimilarProductionNumber,
  normalizeProductionNumber
} from '../production-number-utils.mjs'
import { hasTimeOverlap } from '../time-rules.mjs'

const files = await Promise.all([
  'app.js',
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
  'SUPABASE_BETA_AUDIT_SETUP.sql',
  'SUPABASE_BETA_VALIDATION_SETUP.sql',
  'SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql',
  'SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql',
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
assert.match(source['login-redirect.mjs'], /candidate\.origin !== current\.origin/)
assert.match(source['summary.js'], /exportRows\.rows\.length === 0/)
assert.match(source['summary.js'], /const refreshed = await window\.loadData\(\)/)
assert.match(source['summary.js'], /getDisplayedRowsForExport/)
assert.match(source['app.js'], /normalizeProductionNumber/)
assert.match(source['logs.js'], /registerEditSeibanFromInput/)
assert.match(source['seibans.js'], /merge_pending_seiban/)
assert.match(source['SUPABASE_BETA_AUDIT_SETUP.sql'], /create table if not exists public\.audit_log/i)
assert.match(source['SUPABASE_BETA_AUDIT_SETUP.sql'], /old_data jsonb/i)
assert.match(source['SUPABASE_BETA_VALIDATION_SETUP.sql'], /work_logs_actual_minutes_beta/i)
assert.match(source['SUPABASE_BETA_VALIDATION_SETUP.sql'], /not valid/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /seiban_master_seiban_key_uidx/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql'], /merge_pending_seiban/i)
assert.match(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql'], /duplicate_count/i)
assert.doesNotMatch(source['SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql'], /\b(update|delete|insert|alter|create)\b/i)
assert.match(source['SEIBAN_PRODUCTION_NUMBER_DB_RUNBOOK.md'], /empty_key_rows/)
assert.match(source['SEIBAN_PRODUCTION_NUMBER_DB_RUNBOOK.md'], /SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP\.sql/)

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

console.log('β版の静的安全チェック: OK')
