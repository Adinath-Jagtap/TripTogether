-- ==========================================================
-- TripTogether: Master Database Reset & Seed Script
-- Clean slate: Truncates all existing operational data
-- Seeds the Grand "Tokyo Cherry Blossom & Mount Fuji Odyssey"
-- for the Demo Account (demo@triptogether.app / demo123456).
--
-- Note: chal Pradesh is intentionally NOT seeded so you can
-- perform the live PDF Extraction demo in front of the judges!
-- ==========================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Ensure RLS is disabled and constraints are relaxed for smooth testing
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

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_split_type_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_split_type_check 
  CHECK (split_type IN ('equal', 'exact', 'percentage', 'custom', 'full'));

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_paid_by_fkey;
ALTER TABLE public.expense_shares DROP CONSTRAINT IF EXISTS expense_shares_user_id_fkey;
ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_from_user_id_fkey;
ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_to_user_id_fkey;

-- 2. TRUNCATE ALL EXISTING OPERATIONAL DATA (Clean Slate)
TRUNCATE TABLE 
  public.ledger_entries,
  public.settlements,
  public.expense_shares,
  public.expenses,
  public.disruptions,
  public.booking_dependencies,
  public.bookings,
  public.trip_members,
  public.trips,
  public.profiles
CASCADE;

-- 3. Create Demo User & Companions in auth.users
-- Password for all demo accounts: demo123456
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at
) VALUES 
(
  '00000000-0000-0000-0000-000000000000',
  'd0000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'demo@triptogether.app',
  crypt('demo123456', gen_salt('bf', 10)),
  NOW(), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Demo Explorer"}'::jsonb,
  false, NOW(), NOW()
),
(
  '00000000-0000-0000-0000-000000000000',
  'd0000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated',
  'aarav@triptogether.app',
  crypt('demo123456', gen_salt('bf', 10)),
  NOW(), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Aarav Sharma"}'::jsonb,
  false, NOW(), NOW()
),
(
  '00000000-0000-0000-0000-000000000003',
  'd0000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated',
  'priya@triptogether.app',
  crypt('demo123456', gen_salt('bf', 10)),
  NOW(), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Priya Patel"}'::jsonb,
  false, NOW(), NOW()
),
(
  '00000000-0000-0000-0000-000000000000',
  'd0000000-0000-0000-0000-000000000004',
  'authenticated',
  'authenticated',
  'rohan@triptogether.app',
  crypt('demo123456', gen_salt('bf', 10)),
  NOW(), NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Rohan Mehta"}'::jsonb,
  false, NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE SET
  encrypted_password = crypt('demo123456', gen_salt('bf', 10)),
  email_confirmed_at = NOW();

-- Mandatory for Supabase signInWithPassword: insert into auth.identities
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES
('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', jsonb_build_object('sub', 'd0000000-0000-0000-0000-000000000001', 'email', 'demo@triptogether.app'), 'email', 'demo@triptogether.app', NOW(), NOW(), NOW()),
('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', jsonb_build_object('sub', 'd0000000-0000-0000-0000-000000000002', 'email', 'aarav@triptogether.app'), 'email', 'aarav@triptogether.app', NOW(), NOW(), NOW()),
('d0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', jsonb_build_object('sub', 'd0000000-0000-0000-0000-000000000003', 'email', 'priya@triptogether.app'), 'email', 'priya@triptogether.app', NOW(), NOW(), NOW()),
('d0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', jsonb_build_object('sub', 'd0000000-0000-0000-0000-000000000004', 'email', 'rohan@triptogether.app'), 'email', 'rohan@triptogether.app', NOW(), NOW(), NOW())
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 4. Create Public Profiles
INSERT INTO public.profiles (id, full_name, email)
VALUES
('d0000000-0000-0000-0000-000000000001', 'Demo Explorer', 'demo@triptogether.app'),
('d0000000-0000-0000-0000-000000000002', 'Aarav Sharma', 'aarav@triptogether.app'),
('d0000000-0000-0000-0000-000000000003', 'Priya Patel', 'priya@triptogether.app'),
('d0000000-0000-0000-0000-000000000004', 'Rohan Mehta', 'rohan@triptogether.app')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- 5. Seed Grand Tokyo Expedition, Bookings, Graph Dependencies, Disruption & Expenses
DO $$
DECLARE
  v_u1 UUID := 'd0000000-0000-0000-0000-000000000001'; -- Demo Explorer
  v_u2 UUID := 'd0000000-0000-0000-0000-000000000002'; -- Aarav Sharma
  v_u3 UUID := 'd0000000-0000-0000-0000-000000000003'; -- Priya Patel
  v_u4 UUID := 'd0000000-0000-0000-0000-000000000004'; -- Rohan Mehta

  v_trip_id UUID := 'a0000000-0000-0000-0000-000000000001';

  -- Stable UUIDs for the 11 Tokyo/Kyoto bookings
  v_b1  UUID := 'b0000000-0000-0000-0000-000000000001';
  v_b2  UUID := 'b0000000-0000-0000-0000-000000000002';
  v_b3  UUID := 'b0000000-0000-0000-0000-000000000003';
  v_b4  UUID := 'b0000000-0000-0000-0000-000000000004';
  v_b5  UUID := 'b0000000-0000-0000-0000-000000000005';
  v_b6  UUID := 'b0000000-0000-0000-0000-000000000006';
  v_b7  UUID := 'b0000000-0000-0000-0000-000000000007';
  v_b8  UUID := 'b0000000-0000-0000-0000-000000000008';
  v_b9  UUID := 'b0000000-0000-0000-0000-000000000009';
  v_b10 UUID := 'b0000000-0000-0000-0000-000000000010';
  v_b11 UUID := 'b0000000-0000-0000-0000-000000000011';

  -- Stable UUIDs for expenses
  v_e1 UUID := 'e0000000-0000-0000-0000-000000000001';
  v_e2 UUID := 'e0000000-0000-0000-0000-000000000002';
  v_e3 UUID := 'e0000000-0000-0000-0000-000000000003';
  v_e4 UUID := 'e0000000-0000-0000-0000-000000000004';

  -- Base date starts upcoming (2 days from now)
  v_base TIMESTAMPTZ := date_trunc('day', NOW() + INTERVAL '2 days');
BEGIN

  -- 5A. Insert Master Tokyo Trip
  INSERT INTO public.trips (
    id, owner_id, title, destination, country, description,
    start_date, end_date, budget, currency, invite_code, status, resilience_score
  ) VALUES (
    v_trip_id,
    v_u1,
    'Tokyo Cherry Blossom & Mount Fuji Odyssey',
    'Tokyo & Kyoto',
    'Japan',
    '10-Day high-resilience group exploration across Shinjuku, Shibuya, Kyoto bullet train, Lake Ashi, and Mount Fuji.',
    (v_base)::DATE,
    (v_base + INTERVAL '10 days')::DATE,
    165000,
    'INR',
    'TOKYO26',
    'active',
    88
  );

  -- 5B. Insert Trip Members
  INSERT INTO public.trip_members (trip_id, user_id, role) VALUES
    (v_trip_id, v_u1, 'owner'),
    (v_trip_id, v_u2, 'admin'),
    (v_trip_id, v_u3, 'member'),
    (v_trip_id, v_u4, 'member');

  -- 5C. Insert 11 Detailed Itinerary Bookings
  -- Day 1: Flight ANA NH830 to Tokyo Haneda
  INSERT INTO public.bookings (
    id, trip_id, type, title, start_datetime, end_datetime,
    origin_location, destination_location, cost, vendor,
    confirmation_number, day_number, status, risk_level
  ) VALUES (
    v_b1, v_trip_id, 'flight', 'ANA NH830: Mumbai (BOM) to Tokyo Haneda (HND)',
    v_base + INTERVAL '08 hours',
    v_base + INTERVAL '17 hours 30 minutes',
    'Mumbai Chhatrapati Shivaji Airport (BOM)', 'Tokyo Haneda International Airport (HND)',
    46000, 'All Nippon Airways', 'ANA-NH830-491', 1, 'confirmed', 'low'
  );

  -- Day 1: Haneda Limousine Express Bus to Shinjuku
  INSERT INTO public.bookings (
    id, trip_id, type, title, start_datetime, end_datetime,
    origin_location, destination_location, cost, vendor,
    confirmation_number, day_number, status, risk_level
  ) VALUES (
    v_b2, v_trip_id, 'transfer', 'Haneda Airport Limousine Bus to Shinjuku Express',
    v_base + INTERVAL '19 hours',
    v_base + INTERVAL '20 hours 15 minutes',
    'Haneda Airport Terminal 3', 'Shinjuku Expressway Bus Terminal',
    2400, 'Airport Transport Service Co.', 'LIM-HND-992', 1, 'confirmed', 'low'
  );

  -- Day 1-4: Hotel Gracery Shinjuku (Godzilla Head Tower)
  INSERT INTO public.bookings (
    id, trip_id, type, title, start_datetime, end_datetime,
    venue, cost, cancellation_policy, vendor,
    confirmation_number, day_number, status, risk_level
  ) VALUES (
    v_b3, v_trip_id, 'hotel', 'Hotel Gracery Shinjuku (Godzilla Tower Stay)',
    v_base + INTERVAL '21 hours',
    v_base + INTERVAL '3 days 10 hours',
    'Hotel Gracery Shinjuku, Kabukicho, Tokyo', 38000,
    'Free cancellation up to 48h before check-in', 'Gracery Hospitality Group',
    'HGS-TYO-8821', 1, 'confirmed', 'low'
  );

  -- Day 2: Shibuya Sky & Meiji Shrine Guided Walk
  INSERT INTO public.bookings (
    id, trip_id, type, title, start_datetime, end_datetime,
    venue, cost, vendor, confirmation_number, day_number, status, risk_level
  ) VALUES (
    v_b4, v_trip_id, 'activity', 'Shibuya Sky 360 Observatory & Meiji Shrine Walk',
    v_base + INTERVAL '1 day 10 hours',
    v_base + INTERVAL '1 day 15 hours',
    'Shibuya Scramble Square Rooftop', 3600, 'Tokyo Metropolitan Tours',
    'TMT-SHIB-302', 2, 'confirmed', 'low'
  );

  -- Day 3: TeamLab Planets & Tsukiji Outer Market Food Tour
  INSERT INTO public.bookings (
    id, trip_id, type, title, start_datetime, end_datetime,
    venue, cost, vendor, confirmation_number, day_number, status, risk_level
  ) VALUES (
    v_b5, v_trip_id, 'activity', 'TeamLab Planets Immersive Digital Art & Tsukiji Market',
    v_base + INTERVAL '2 days 09 hours 30 minutes',
    v_base + INTERVAL '2 days 14 hours',
    'Toyosu teamLab Planets, Tokyo', 4800, 'teamLab Tokyo',
    'TLP-TYO-551', 3, 'confirmed', 'low'
  );

  -- Day 4: Tokaido Shinkansen Nozomi High-Speed Bullet Train (Tokyo to Kyoto)
  -- ACTIVELY AT RISK: Simulates the rail disruption to trigger AI recovery!
  INSERT INTO public.bookings (
    id, trip_id, type, title, start_datetime, end_datetime,
    origin_location, destination_location, cost, vendor,
    confirmation_number, day_number, status, risk_level, risk_reason
  ) VALUES (
    v_b6, v_trip_id, 'train', 'Tokaido Shinkansen Nozomi Bullet Train: Tokyo to Kyoto',
    v_base + INTERVAL '3 days 11 hours 30 minutes',
    v_base + INTERVAL '3 days 14 hours',
    'Tokyo Central Station', 'Kyoto Main Station',
    11200, 'JR Central Shinkansen', 'JR-NZM-218', 4, 'at_risk', 'high',
    'Typhoon rainstorm warning: JR Central reports 180-min speed restrictions between Shin-Yokohama and Nagoya.'
  );

  -- Day 4-7: Kyoto Traditional Machiya Ryokan Gion Stay
  INSERT INTO public.bookings (
    id, trip_id, type, title, start_datetime, end_datetime,
    venue, cost, cancellation_policy, vendor,
    confirmation_number, day_number, status, risk_level
  ) VALUES (
    v_b7, v_trip_id, 'hotel', 'Kyoto Traditional Machiya Ryokan Gion Stay',
    v_base + INTERVAL '3 days 15 hours',
    v_base + INTERVAL '6 days 10 hours',
    'Gion Higashiyama Historical District, Kyoto', 42000,
    '50% refund if cancelled 24h prior', 'Kyoto Ryokan Preservation Trust',
    'RYO-KYO-771', 4, 'confirmed', 'medium'
  );

  -- Day 5: Fushimi Inari Taisha & Arashiyama Bamboo Grove
  INSERT INTO public.bookings (
    id, trip_id, type, title, start_datetime, end_datetime,
    venue, cost, vendor, confirmation_number, day_number, status, risk_level
  ) VALUES (
    v_b8, v_trip_id, 'activity', 'Fushimi Inari 10,000 Torii Gates & Arashiyama Bamboo Walk',
    v_base + INTERVAL '4 days 09 hours',
    v_base + INTERVAL '4 days 15 hours 30 minutes',
    'Fushimi Inari Taisha & Sagano Bamboo Forest', 2800, 'Kyoto Cultural Heritage Expeditions',
    'KCH-TORI-102', 5, 'confirmed', 'low'
  );

  -- Day 6: Gion Tea Ceremony & Kaiseki Banquet
  INSERT INTO public.bookings (
    id, trip_id, type, title, start_datetime, end_datetime,
    venue, cost, vendor, confirmation_number, day_number, status, risk_level
  ) VALUES (
    v_b9, v_trip_id, 'activity', 'Gion Tea Ceremony & Traditional Kaiseki Banquet',
    v_base + INTERVAL '5 days 17 hours',
    v_base + INTERVAL '5 days 21 hours',
    'Gion Chaya Tea House, Kyoto', 16000, 'Kyoto Artisan Culinary Guild',
    'GION-TEA-401', 6, 'confirmed', 'low'
  );

  -- Day 7-9: Mount Fuji View Onsen & Spa Resort (Lake Kawaguchiko)
  INSERT INTO public.bookings (
    id, trip_id, type, title, start_datetime, end_datetime,
    venue, cost, cancellation_policy, vendor,
    confirmation_number, day_number, status, risk_level
  ) VALUES (
    v_b10, v_trip_id, 'hotel', 'Mount Fuji Onsen & Ryokan Resort (Lake Kawaguchiko)',
    v_base + INTERVAL '6 days 15 hours',
    v_base + INTERVAL '8 days 10 hours',
    'Lake Kawaguchiko Onsen Village, Yamanashi', 28000,
    'Non-refundable within 48 hours of check-in', 'Fuji Onsen Resorts',
    'FJI-ONS-552', 7, 'confirmed', 'low'
  );

  -- Day 8: Mount Fuji 5th Station & Lake Ashi Pirate Cruise
  INSERT INTO public.bookings (
    id, trip_id, type, title, start_datetime, end_datetime,
    venue, cost, vendor, confirmation_number, day_number, status, risk_level
  ) VALUES (
    v_b11, v_trip_id, 'activity', 'Mount Fuji 5th Station & Lake Ashi Scenic Cruise',
    v_base + INTERVAL '7 days 09 hours',
    v_base + INTERVAL '7 days 16 hours',
    'Fuji Subaru Line 5th Station & Hakone Lake Ashi', 6500, 'Hakone Sightseeing Cruise',
    'FUJI-CRZ-889', 8, 'confirmed', 'low'
  );

  -- 5D. Insert 8 Directed Acyclic Graph (DAG) Dependencies
  INSERT INTO public.booking_dependencies (trip_id, upstream_booking_id, downstream_booking_id, buffer_minutes, dependency_type) VALUES
    -- Flight -> Airport Limousine (buffer 90 mins for customs & baggage)
    (v_trip_id, v_b1, v_b2, 90, 'sequential'),
    -- Limousine -> Hotel Gracery Check-in (buffer 45 mins)
    (v_trip_id, v_b2, v_b3, 45, 'sequential'),
    -- Hotel Check-in -> Shibuya Sky
    (v_trip_id, v_b3, v_b4, 120, 'buffer'),
    -- Shibuya Sky -> TeamLab Planets
    (v_trip_id, v_b4, v_b5, 180, 'sequential'),
    -- Shinjuku Hotel Checkout -> Shinkansen Bullet Train
    (v_trip_id, v_b3, v_b6, 90, 'sequential'),
    -- Shinkansen -> Kyoto Ryokan Check-in
    (v_trip_id, v_b6, v_b7, 60, 'sequential'),
    -- Kyoto Ryokan -> Fushimi Inari
    (v_trip_id, v_b7, v_b8, 90, 'buffer'),
    -- Kyoto Ryokan Checkout -> Mount Fuji Onsen Resort Check-in
    (v_trip_id, v_b7, v_b10, 120, 'sequential');

  -- 5E. Insert Simulated/Active Disruption for the Shinkansen delay
  INSERT INTO public.disruptions (
    trip_id, booking_id, type, severity, description,
    delay_minutes, is_simulated, affected_booking_ids, status
  ) VALUES (
    v_trip_id,
    v_b6,
    'weather_delay',
    'high',
    'Typhoon weather alert: Tokaido Shinkansen Nozomi bullet train suspended due to extreme crosswinds near Shizuoka. Estimated 180-minute delay impacting Kyoto hotel check-in.',
    180,
    false,
    jsonb_build_array(v_b6, v_b7),
    'active'
  );

  -- 5F. Insert 4 Group Expenses
  -- Expense 1: Hotel Gracery Shinjuku Stay (Equal Split among all 4)
  INSERT INTO public.expenses (
    id, trip_id, paid_by, amount, title, category, split_type, notes
  ) VALUES (
    v_e1, v_trip_id, v_u1, 38000,
    'Hotel Gracery Shinjuku Stay (4 nights)',
    'accommodation', 'equal', 'Group stay in Kabukicho, Tokyo'
  );

  -- Expense 2: Shinkansen Nozomi Bullet Train Tickets (Percentage Split: 40% Demo, 20% Aarav, 20% Priya, 20% Rohan)
  INSERT INTO public.expenses (
    id, trip_id, paid_by, amount, title, category, split_type, notes
  ) VALUES (
    v_e2, v_trip_id, v_u2, 44800,
    'Tokaido Shinkansen Nozomi Bullet Train Tickets (4 pax)',
    'transit', 'percentage', 'High speed reserved cars'
  );

  -- Expense 3: Kyoto Gion Kaiseki Gala Dinner (Custom Split: Demo 5000, Aarav 4000, Priya 4000, Rohan 3000)
  INSERT INTO public.expenses (
    id, trip_id, paid_by, amount, title, category, split_type, notes
  ) VALUES (
    v_e3, v_trip_id, v_u3, 16000,
    'Kyoto Gion Kaiseki Gala Banquet & Tea Ceremony',
    'food', 'custom', 'Traditional 8-course banquet'
  );

  -- Expense 4: Mount Fuji Lake Ashi VIP Cruise (Equal Split among all 4)
  INSERT INTO public.expenses (
    id, trip_id, paid_by, amount, title, category, split_type, notes
  ) VALUES (
    v_e4, v_trip_id, v_u4, 6500,
    'Mount Fuji Lake Ashi Scenic Cruise VIP Passes',
    'activity', 'equal', 'Pirate ship cruise on Lake Ashi'
  );

  -- 5G. Insert Expense Shares
  -- Expense 1 Shares (Equal: 38000 / 4 = 9500 each)
  INSERT INTO public.expense_shares (expense_id, user_id, share_amount) VALUES
    (v_e1, v_u1, 9500),
    (v_e1, v_u2, 9500),
    (v_e1, v_u3, 9500),
    (v_e1, v_u4, 9500);

  -- Expense 2 Shares (Percentage: 40% Demo = 17920, 20% others = 8960 each)
  INSERT INTO public.expense_shares (expense_id, user_id, share_amount) VALUES
    (v_e2, v_u1, 17920),
    (v_e2, v_u2, 8960),
    (v_e2, v_u3, 8960),
    (v_e2, v_u4, 8960);

  -- Expense 3 Shares (Custom: Demo 5000, Aarav 4000, Priya 4000, Rohan 3000)
  INSERT INTO public.expense_shares (expense_id, user_id, share_amount) VALUES
    (v_e3, v_u1, 5000),
    (v_e3, v_u2, 4000),
    (v_e3, v_u3, 4000),
    (v_e3, v_u4, 3000);

  -- Expense 4 Shares (Equal: 6500 / 4 = 1625 each)
  INSERT INTO public.expense_shares (expense_id, user_id, share_amount) VALUES
    (v_e4, v_u1, 1625),
    (v_e4, v_u2, 1625),
    (v_e4, v_u3, 1625),
    (v_e4, v_u4, 1625);

  -- 5H. Insert a Completed Settlement
  INSERT INTO public.settlements (
    trip_id, from_user_id, to_user_id, amount, status
  ) VALUES (
    v_trip_id, v_u2, v_u1, 5000, 'completed'
  );

  -- 5I. Seed Cryptographic Ledger Entries
  INSERT INTO public.ledger_entries (
    trip_id, event_type, description, amount, affected_users, entry_hash, previous_hash, sequence_number
  ) VALUES 
  (
    v_trip_id,
    'TRIP_INITIALIZED',
    'Tokyo Cherry Blossom & Mount Fuji Odyssey initialized',
    0,
    jsonb_build_array(v_u1, v_u2, v_u3, v_u4),
    encode(digest('genesis-tokyo-2026', 'sha256'), 'hex'),
    '0000000000000000000000000000000000000000000000000000000000000000',
    1
  ),
  (
    v_trip_id,
    'EXPENSE_ADDED',
    'Hotel Gracery Shinjuku Stay (4 nights) paid by Demo Explorer',
    38000,
    jsonb_build_array(v_u1, v_u2, v_u3, v_u4),
    encode(digest('expense-e1-hotel-gracery', 'sha256'), 'hex'),
    encode(digest('genesis-tokyo-2026', 'sha256'), 'hex'),
    2
  ),
  (
    v_trip_id,
    'EXPENSE_ADDED',
    'Tokaido Shinkansen Nozomi Bullet Train Tickets paid by Aarav Sharma',
    44800,
    jsonb_build_array(v_u1, v_u2, v_u3, v_u4),
    encode(digest('expense-e2-shinkansen', 'sha256'), 'hex'),
    encode(digest('expense-e1-hotel-gracery', 'sha256'), 'hex'),
    3
  ),
  (
    v_trip_id,
    'SETTLEMENT_RECORDED',
    'Aarav Sharma settled 5000 INR to Demo Explorer',
    5000,
    jsonb_build_array(v_u2, v_u1),
    encode(digest('settlement-aarav-demo-5000', 'sha256'), 'hex'),
    encode(digest('expense-e2-shinkansen', 'sha256'), 'hex'),
    4
  );

END $$;
