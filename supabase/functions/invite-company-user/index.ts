import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function getSafeAppOrigin(value: string) {
  try {
    const url = new URL(value)
    const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) return ''
    if (url.username || url.password) return ''
    return url.origin
  } catch {
    return ''
  }
}

async function deleteCreatedUser(adminClient: ReturnType<typeof createClient>, userId: string) {
  const { error } = await adminClient.auth.admin.deleteUser(userId)
  if (error) console.error('Auth user cleanup failed', error.message)
  return !error
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response(405, { ok: false, message: '許可されていない操作です' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appOrigin = Deno.env.get('APP_ORIGIN')
  const safeAppOrigin = appOrigin ? getSafeAppOrigin(appOrigin) : ''
  const authorization = request.headers.get('Authorization') || ''

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !safeAppOrigin || !authorization.startsWith('Bearer ')) {
    return response(500, { ok: false, message: '招待機能のサーバー設定が未完了です' })
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false }
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData.user) return response(401, { ok: false, message: 'ログインし直してください' })

  const { data: caller, error: callerError } = await adminClient
    .from('user_profiles')
    .select('role, company_id, is_active')
    .eq('auth_user_id', userData.user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (callerError || !caller || !['system_admin', 'company_admin'].includes(caller.role)) {
    return response(403, { ok: false, message: '利用者を追加する権限がありません' })
  }

  let body: { email?: string; role?: string; workerId?: string | null; companyId?: string | null }
  try {
    body = await request.json()
  } catch {
    return response(400, { ok: false, message: '入力内容を確認してください' })
  }

  const email = String(body.email || '').trim().toLowerCase()
  const requestedRole = String(body.role || '')
  const targetRole = caller.role === 'company_admin' ? 'worker' : requestedRole
  const targetCompanyId = caller.role === 'company_admin' ? caller.company_id : body.companyId
  const workerId = targetRole === 'worker' ? body.workerId : null

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response(400, { ok: false, message: '正しいメールアドレスを入力してください' })
  }
  if (!['worker', 'company_admin'].includes(targetRole) || !targetCompanyId) {
    return response(400, { ok: false, message: '会社と権限を確認してください' })
  }
  if (caller.role === 'company_admin' && body.companyId && body.companyId !== caller.company_id) {
    return response(403, { ok: false, message: '別会社の利用者は追加できません' })
  }

  const { data: company } = await adminClient
    .from('company_master')
    .select('id')
    .eq('id', targetCompanyId)
    .eq('is_active', true)
    .maybeSingle()
  if (!company) return response(400, { ok: false, message: '利用中の会社を選択してください' })

  if (targetRole === 'worker') {
    if (!workerId) return response(400, { ok: false, message: '作業者を選択してください' })
    const { data: worker } = await adminClient
      .from('worker_master')
      .select('id')
      .eq('id', workerId)
      .eq('company_id', targetCompanyId)
      .eq('is_active', true)
      .maybeSingle()
    if (!worker) return response(400, { ok: false, message: 'この会社の作業者を選択してください' })
  }

  const temporaryPassword = `${crypto.randomUUID()}-${crypto.randomUUID()}Aa1!`
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true
  })
  if (createError || !created.user) {
    console.error('Auth user creation failed', createError?.message)
    return response(409, { ok: false, message: 'このメールアドレスは登録済みか、現在招待できません' })
  }

  const { error: profileError } = await adminClient.from('user_profiles').insert({
    auth_user_id: created.user.id,
    company_id: targetCompanyId,
    worker_id: workerId,
    role: targetRole,
    is_active: true
  })
  if (profileError) {
    console.error('Profile creation failed', profileError.message)
    const cleaned = await deleteCreatedUser(adminClient, created.user.id)
    if (!cleaned) {
      return response(500, { ok: false, message: '招待処理の復旧が必要です。システム管理者に連絡してください' })
    }
    return response(409, { ok: false, message: '作業者がすでに別アカウントへ紐づいている可能性があります' })
  }

  const redirectTo = `${safeAppOrigin}/update-password.html`
  const { error: mailError } = await adminClient.auth.resetPasswordForEmail(email, { redirectTo })
  if (mailError) {
    console.error('Password setup mail failed', mailError.message)
    const cleaned = await deleteCreatedUser(adminClient, created.user.id)
    if (!cleaned) {
      return response(500, { ok: false, message: 'メール送信後の復旧が必要です。システム管理者に連絡してください' })
    }
    return response(502, { ok: false, message: 'メール送信に失敗しました。時間を置いて再度お試しください' })
  }

  return response(200, { ok: true })
})
