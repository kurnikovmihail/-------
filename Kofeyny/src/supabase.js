import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://stchndvxbjcyjvlpwldh.supabase.co'
const supabaseKey = 'sb_publishable_7newlZ72nU9JVDFV6oB3Xw_JfzZM-qK'

export const supabase = createClient(supabaseUrl, supabaseKey)