import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ブラウザで動くアプリなので、このキーは利用者から見えます。
// Supabase側でRLSを有効にし、公開してよい操作だけ許可してください。
const SUPABASE_URL = 'https://hiibhvtlnwihfiufzuph.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Q8mZdRrn14hFacdUPrNTaw_DyqmSVXv'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
