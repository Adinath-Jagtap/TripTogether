-- ==========================================================
-- TripTogether: Intelligent Travel Resilience Platform
-- Database Schema for Supabase PostgreSQL
-- ==========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Trips Table
CREATE TABLE IF NOT EXISTS public.trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  country TEXT,
  description TEXT,
  cover_image TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  budget NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  invite_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'disrupted')),
  resilience_score NUMERIC DEFAULT 85 CHECK (resilience_score >= 0 AND resilience_score <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Trip Members Table
CREATE TABLE IF NOT EXISTS public.trip_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, user_id)
);

-- 4. Bookings Table (Itinerary items)
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('flight', 'hotel', 'transfer', 'activity', 'train', 'bus', 'event', 'other')),
  title TEXT NOT NULL,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  origin_location TEXT,
  destination_location TEXT,
  venue TEXT,
  cost NUMERIC DEFAULT 0,
  cancellation_policy TEXT,
  vendor TEXT,
  confirmation_number TEXT,
  day_number INT,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'at_risk', 'disrupted', 'cancelled', 'rescheduled')),
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Booking Dependencies (Directed Acyclic Graph edges)
CREATE TABLE IF NOT EXISTS public.booking_dependencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  upstream_booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  downstream_booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  dependency_type TEXT DEFAULT 'sequential',
  buffer_minutes INT DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(upstream_booking_id, downstream_booking_id)
);

-- 6. Disruptions & Simulations
CREATE TABLE IF NOT EXISTS public.disruptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT,
  delay_minutes INT DEFAULT 0,
  is_simulated BOOLEAN DEFAULT false,
  affected_booking_ids JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT DEFAULT 'other',
  paid_by UUID,
  split_type TEXT DEFAULT 'equal' CHECK (split_type IN ('equal', 'exact', 'percentage', 'custom', 'full')),
  date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Expense Shares
CREATE TABLE IF NOT EXISTS public.expense_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  share_amount NUMERIC NOT NULL,
  UNIQUE(expense_id, user_id)
);

-- 9. Settlements
CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Immutable Audit Ledger (Hash-Chained)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  affected_users JSONB DEFAULT '[]'::jsonb,
  entry_hash TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  sequence_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trips_owner ON public.trips(owner_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON public.trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user ON public.trip_members(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_trip ON public.bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_start ON public.bookings(start_datetime);
CREATE INDEX IF NOT EXISTS idx_dependencies_trip ON public.booking_dependencies(trip_id);
CREATE INDEX IF NOT EXISTS idx_expenses_trip ON public.expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_ledger_trip_seq ON public.ledger_entries(trip_id, sequence_number);

-- ==========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disruptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can insert and update their own profile." ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- Trips policies
CREATE POLICY "Users can view trips they belong to" ON public.trips
  FOR SELECT USING (
    auth.uid() = owner_id OR
    EXISTS (SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = id AND tm.user_id = auth.uid())
  );
CREATE POLICY "Users can insert trips" ON public.trips
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Trip owners can update trips" ON public.trips
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Trip owners can delete trips" ON public.trips
  FOR DELETE USING (auth.uid() = owner_id);

-- Trip Members policies (Completely non-recursive: does NOT query trips table)
CREATE POLICY "Users can view trip memberships" ON public.trip_members
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert trip membership" ON public.trip_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own membership" ON public.trip_members
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own membership" ON public.trip_members
  FOR DELETE USING (auth.uid() = user_id);

-- Bookings policies
CREATE POLICY "Allow read bookings" ON public.bookings
  FOR SELECT USING (true);
CREATE POLICY "Allow write bookings" ON public.bookings
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Dependencies policies
CREATE POLICY "Allow read dependencies" ON public.booking_dependencies
  FOR SELECT USING (true);
CREATE POLICY "Allow write dependencies" ON public.booking_dependencies
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Expenses policies
CREATE POLICY "Allow read expenses" ON public.expenses
  FOR SELECT USING (true);
CREATE POLICY "Allow manage expenses" ON public.expenses
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Settlements policies
CREATE POLICY "Allow read settlements" ON public.settlements
  FOR SELECT USING (true);
CREATE POLICY "Allow manage settlements" ON public.settlements
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Ledger policies
CREATE POLICY "Allow read ledger" ON public.ledger_entries
  FOR SELECT USING (true);
CREATE POLICY "Allow append ledger" ON public.ledger_entries
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Trigger for automatic user profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
