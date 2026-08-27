import { createClient } from '@supabase/supabase-js'

// Phase 7 (Controlled Beta Infrastructure Gate 3) — configurable via
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY so a local/CI E2E run (.env)
// can point at the separate, non-production compass-e2e-test project
// instead of live production. Falls back to the existing hardcoded
// production values so the deployed app keeps working unchanged for
// anyone who hasn't set these — production itself doesn't need this
// change to function, only the test environment does.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZWVnZnNvaWpoZG5udnVxamluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NTU2MjYsImV4cCI6MjA5NzAzMTYyNn0.IPdANRIK94XdCWy7aK1MOiIVqYgPKmvN8_ZJ6LCENBI'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
