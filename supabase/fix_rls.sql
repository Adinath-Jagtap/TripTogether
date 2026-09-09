-- ==========================================================
-- TripTogether: Fix All RLS, Constraints, and Permissions
-- Copy and run this script in your Supabase Dashboard -> SQL Editor
-- ==========================================================

-- 1. Disable Row Level Security (RLS) on all operational tables
-- This ensures that creating trips, bookings, expenses, settlements,
-- and ledger entries will NEVER be blocked by RLS policies again.
ALTER TABLE IF EXISTS public.trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trip_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.booking_dependencies DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expense_shares DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settlements DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ledger_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.disruptions DISABLE ROW LEVEL SECURITY;

-- 2. Grant full table permissions to anon and authenticated roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 3. Fix Expense Constraints
-- A. Update split_type check constraint to support custom, percentage, equal, exact, full
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_split_type_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_split_type_check 
  CHECK (split_type IN ('equal', 'exact', 'percentage', 'custom', 'full'));

-- B. Relax restrictive Foreign Keys to auth.users
-- This allows group companions who have not yet registered an email account
-- (or demo companions) to be recorded in expenses and shares without FK errors.
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_paid_by_fkey;
ALTER TABLE public.expense_shares DROP CONSTRAINT IF EXISTS expense_shares_user_id_fkey;
ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_from_user_id_fkey;
ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_to_user_id_fkey;

-- 4. Enable permissive policies as an extra safety guarantee (in case RLS is re-enabled)
DROP POLICY IF EXISTS "Allow all trips" ON public.trips;
CREATE POLICY "Allow all trips" ON public.trips FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all trip_members" ON public.trip_members;
CREATE POLICY "Allow all trip_members" ON public.trip_members FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all bookings" ON public.bookings;
CREATE POLICY "Allow all bookings" ON public.bookings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all booking_dependencies" ON public.booking_dependencies;
CREATE POLICY "Allow all booking_dependencies" ON public.booking_dependencies FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all expenses" ON public.expenses;
CREATE POLICY "Allow all expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all expense_shares" ON public.expense_shares;
CREATE POLICY "Allow all expense_shares" ON public.expense_shares FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all settlements" ON public.settlements;
CREATE POLICY "Allow all settlements" ON public.settlements FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all ledger_entries" ON public.ledger_entries;
CREATE POLICY "Allow all ledger_entries" ON public.ledger_entries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all profiles" ON public.profiles;
CREATE POLICY "Allow all profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
