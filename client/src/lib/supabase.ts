import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wpnxaadvyxmhlcgdobla.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwbnhhYWR2eXhtaGxjZ2RvYmxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNTE4NDYsImV4cCI6MjA4NDcyNzg0Nn0.MCALR4sEoewuhKCOp_W_gNVkNjWfQquiuaqX8XVZtcU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
