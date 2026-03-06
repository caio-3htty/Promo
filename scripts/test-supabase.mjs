import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

(async () => {
  try {
    const { data, error, status } = await supabase.from('obras').select('*').limit(1);
    console.log('status:', status);
    if (error) console.error('error:', error);
    else console.log('data:', data);
  } catch (err) {
    console.error('unexpected error:', err);
  }
  process.exit(0);
})();
