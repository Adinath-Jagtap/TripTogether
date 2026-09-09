const fs = require('fs');
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const [k, ...v] = l.split('=');
      return [k.trim(), v.join('=').trim()];
    })
);
const { createClient } = require('@supabase/supabase-js');
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const u1 = 'd0000000-0000-0000-0000-000000000001';
const u2 = 'd0000000-0000-0000-0000-000000000002';
const u3 = 'd0000000-0000-0000-0000-000000000003';
const u4 = 'd0000000-0000-0000-0000-000000000004';

const tripId = 'a0000000-0000-0000-0000-000000000001';

const b1  = 'b0000000-0000-0000-0000-000000000001';
const b2  = 'b0000000-0000-0000-0000-000000000002';
const b3  = 'b0000000-0000-0000-0000-000000000003';
const b4  = 'b0000000-0000-0000-0000-000000000004';
const b5  = 'b0000000-0000-0000-0000-000000000005';
const b6  = 'b0000000-0000-0000-0000-000000000006';
const b7  = 'b0000000-0000-0000-0000-000000000007';
const b8  = 'b0000000-0000-0000-0000-000000000008';
const b9  = 'b0000000-0000-0000-0000-000000000009';
const b10 = 'b0000000-0000-0000-0000-000000000010';
const b11 = 'b0000000-0000-0000-0000-000000000011';

const e1 = 'e0000000-0000-0000-0000-000000000001';
const e2 = 'e0000000-0000-0000-0000-000000000002';
const e3 = 'e0000000-0000-0000-0000-000000000003';
const e4 = 'e0000000-0000-0000-0000-000000000004';

const baseDate = new Date();
baseDate.setDate(baseDate.getDate() + 2);
baseDate.setHours(0, 0, 0, 0);

const addHours = (days, hours, minutes = 0) => {
  const d = new Date(baseDate.getTime());
  d.setDate(d.getDate() + days);
  d.setHours(d.getHours() + hours);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
};

async function seed() {
  console.log('🚀 Starting Clean Slate & Tokyo Grand Odyssey Seed...');

  // 1. Clean operational tables in reverse dependency order
  console.log('🧹 Clearing operational tables...');
  await s.from('ledger_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await s.from('settlements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await s.from('expense_shares').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await s.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await s.from('disruptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await s.from('booking_dependencies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await s.from('bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await s.from('trip_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await s.from('trips').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // 2. Upsert Profiles
  console.log('👤 Seeding Profiles...');
  await s.from('profiles').upsert([
    { id: u1, full_name: 'Demo Explorer', email: 'demo@triptogether.app' },
    { id: u2, full_name: 'Aarav Sharma', email: 'aarav@triptogether.app' },
    { id: u3, full_name: 'Priya Patel', email: 'priya@triptogether.app' },
    { id: u4, full_name: 'Rohan Mehta', email: 'rohan@triptogether.app' }
  ]);

  // 3. Seed Master Tokyo Trip
  console.log('🗾 Seeding Tokyo Grand Trip...');
  const endDate = new Date(baseDate.getTime());
  endDate.setDate(endDate.getDate() + 10);

  const { error: tErr } = await s.from('trips').insert({
    id: tripId,
    owner_id: u1,
    title: 'Tokyo Cherry Blossom & Mount Fuji Odyssey',
    destination: 'Tokyo & Kyoto',
    country: 'Japan',
    description: '10-Day high-resilience group exploration across Shinjuku, Shibuya, Kyoto bullet train, Lake Ashi, and Mount Fuji.',
    start_date: baseDate.toISOString().slice(0, 10),
    end_date: endDate.toISOString().slice(0, 10),
    budget: 165000,
    currency: 'INR',
    invite_code: 'TOKYO26',
    status: 'active',
    resilience_score: 88
  });
  if (tErr) console.error('Trip insert error:', tErr);

  // 4. Seed Members
  console.log('👥 Seeding Trip Members...');
  const { error: mErr } = await s.from('trip_members').insert([
    { trip_id: tripId, user_id: u1, role: 'owner' },
    { trip_id: tripId, user_id: u2, role: 'admin' },
    { trip_id: tripId, user_id: u3, role: 'member' },
    { trip_id: tripId, user_id: u4, role: 'member' }
  ]);
  if (mErr) console.error('Members insert error:', mErr);

  // 5. Seed Bookings
  console.log('📅 Seeding 11 Bookings...');
  const { error: bErr } = await s.from('bookings').insert([
    {
      id: b1, trip_id: tripId, type: 'flight',
      title: 'ANA NH830: Mumbai (BOM) to Tokyo Haneda (HND)',
      start_datetime: addHours(0, 8), end_datetime: addHours(0, 17, 30),
      origin_location: 'Mumbai Chhatrapati Shivaji Airport (BOM)',
      destination_location: 'Tokyo Haneda International Airport (HND)',
      cost: 46000, vendor: 'All Nippon Airways', confirmation_number: 'ANA-NH830-491',
      day_number: 1, status: 'confirmed', risk_level: 'low'
    },
    {
      id: b2, trip_id: tripId, type: 'transfer',
      title: 'Haneda Airport Limousine Bus to Shinjuku Express',
      start_datetime: addHours(0, 19), end_datetime: addHours(0, 20, 15),
      origin_location: 'Haneda Airport Terminal 3',
      destination_location: 'Shinjuku Expressway Bus Terminal',
      cost: 2400, vendor: 'Airport Transport Service Co.', confirmation_number: 'LIM-HND-992',
      day_number: 1, status: 'confirmed', risk_level: 'low'
    },
    {
      id: b3, trip_id: tripId, type: 'hotel',
      title: 'Hotel Gracery Shinjuku (Godzilla Tower Stay)',
      start_datetime: addHours(0, 21), end_datetime: addHours(3, 10),
      venue: 'Hotel Gracery Shinjuku, Kabukicho, Tokyo', cost: 38000,
      cancellation_policy: 'Free cancellation up to 48h before check-in',
      vendor: 'Gracery Hospitality Group', confirmation_number: 'HGS-TYO-8821',
      day_number: 1, status: 'confirmed', risk_level: 'low'
    },
    {
      id: b4, trip_id: tripId, type: 'activity',
      title: 'Shibuya Sky 360 Observatory & Meiji Shrine Walk',
      start_datetime: addHours(1, 10), end_datetime: addHours(1, 15),
      venue: 'Shibuya Scramble Square Rooftop', cost: 3600,
      vendor: 'Tokyo Metropolitan Tours', confirmation_number: 'TMT-SHIB-302',
      day_number: 2, status: 'confirmed', risk_level: 'low'
    },
    {
      id: b5, trip_id: tripId, type: 'activity',
      title: 'TeamLab Planets Immersive Digital Art & Tsukiji Market',
      start_datetime: addHours(2, 9, 30), end_datetime: addHours(2, 14),
      venue: 'Toyosu teamLab Planets, Tokyo', cost: 4800,
      vendor: 'teamLab Tokyo', confirmation_number: 'TLP-TYO-551',
      day_number: 3, status: 'confirmed', risk_level: 'low'
    },
    {
      id: b6, trip_id: tripId, type: 'train',
      title: 'Tokaido Shinkansen Nozomi Bullet Train: Tokyo to Kyoto',
      start_datetime: addHours(3, 11, 30), end_datetime: addHours(3, 14),
      origin_location: 'Tokyo Central Station', destination_location: 'Kyoto Main Station',
      cost: 11200, vendor: 'JR Central Shinkansen', confirmation_number: 'JR-NZM-218',
      day_number: 4, status: 'at_risk', risk_level: 'high',
      risk_reason: 'Typhoon rainstorm warning: JR Central reports 180-min speed restrictions between Shin-Yokohama and Nagoya.'
    },
    {
      id: b7, trip_id: tripId, type: 'hotel',
      title: 'Kyoto Traditional Machiya Ryokan Gion Stay',
      start_datetime: addHours(3, 15), end_datetime: addHours(6, 10),
      venue: 'Gion Higashiyama Historical District, Kyoto', cost: 42000,
      cancellation_policy: '50% refund if cancelled 24h prior',
      vendor: 'Kyoto Ryokan Preservation Trust', confirmation_number: 'RYO-KYO-771',
      day_number: 4, status: 'confirmed', risk_level: 'medium'
    },
    {
      id: b8, trip_id: tripId, type: 'activity',
      title: 'Fushimi Inari 10,000 Torii Gates & Arashiyama Bamboo Walk',
      start_datetime: addHours(4, 9), end_datetime: addHours(4, 15, 30),
      venue: 'Fushimi Inari Taisha & Sagano Bamboo Forest', cost: 2800,
      vendor: 'Kyoto Cultural Heritage Expeditions', confirmation_number: 'KCH-TORI-102',
      day_number: 5, status: 'confirmed', risk_level: 'low'
    },
    {
      id: b9, trip_id: tripId, type: 'activity',
      title: 'Gion Tea Ceremony & Traditional Kaiseki Banquet',
      start_datetime: addHours(5, 17), end_datetime: addHours(5, 21),
      venue: 'Gion Chaya Tea House, Kyoto', cost: 16000,
      vendor: 'Kyoto Artisan Culinary Guild', confirmation_number: 'GION-TEA-401',
      day_number: 6, status: 'confirmed', risk_level: 'low'
    },
    {
      id: b10, trip_id: tripId, type: 'hotel',
      title: 'Mount Fuji Onsen & Ryokan Resort (Lake Kawaguchiko)',
      start_datetime: addHours(6, 15), end_datetime: addHours(8, 10),
      venue: 'Lake Kawaguchiko Onsen Village, Yamanashi', cost: 28000,
      cancellation_policy: 'Non-refundable within 48 hours of check-in',
      vendor: 'Fuji Onsen Resorts', confirmation_number: 'FJI-ONS-552',
      day_number: 7, status: 'confirmed', risk_level: 'low'
    },
    {
      id: b11, trip_id: tripId, type: 'activity',
      title: 'Mount Fuji 5th Station & Lake Ashi Scenic Cruise',
      start_datetime: addHours(7, 9), end_datetime: addHours(7, 16),
      venue: 'Fuji Subaru Line 5th Station & Hakone Lake Ashi', cost: 6500,
      vendor: 'Hakone Sightseeing Cruise', confirmation_number: 'FUJI-CRZ-889',
      day_number: 8, status: 'confirmed', risk_level: 'low'
    }
  ]);
  if (bErr) console.error('Bookings insert error:', bErr);

  // 6. Seed Dependencies
  console.log('🔗 Seeding 8 Graph Dependencies...');
  const { error: depErr } = await s.from('booking_dependencies').insert([
    { trip_id: tripId, upstream_booking_id: b1, downstream_booking_id: b2, buffer_minutes: 90, dependency_type: 'sequential' },
    { trip_id: tripId, upstream_booking_id: b2, downstream_booking_id: b3, buffer_minutes: 45, dependency_type: 'sequential' },
    { trip_id: tripId, upstream_booking_id: b3, downstream_booking_id: b4, buffer_minutes: 120, dependency_type: 'buffer' },
    { trip_id: tripId, upstream_booking_id: b4, downstream_booking_id: b5, buffer_minutes: 180, dependency_type: 'sequential' },
    { trip_id: tripId, upstream_booking_id: b3, downstream_booking_id: b6, buffer_minutes: 90, dependency_type: 'sequential' },
    { trip_id: tripId, upstream_booking_id: b6, downstream_booking_id: b7, buffer_minutes: 60, dependency_type: 'sequential' },
    { trip_id: tripId, upstream_booking_id: b7, downstream_booking_id: b8, buffer_minutes: 90, dependency_type: 'buffer' },
    { trip_id: tripId, upstream_booking_id: b7, downstream_booking_id: b10, buffer_minutes: 120, dependency_type: 'sequential' }
  ]);
  if (depErr) console.error('Dependencies insert error:', depErr);

  // 7. Seed Active Disruption
  console.log('⚠️ Seeding Active Disruption (Shinkansen Delay)...');
  const { error: disErr } = await s.from('disruptions').insert({
    trip_id: tripId,
    booking_id: b6,
    type: 'weather_delay',
    severity: 'high',
    description: 'Typhoon weather alert: Tokaido Shinkansen Nozomi bullet train suspended due to extreme crosswinds near Shizuoka. Estimated 180-minute delay impacting Kyoto hotel check-in.',
    delay_minutes: 180,
    is_simulated: false,
    affected_booking_ids: [b6, b7],
    status: 'active'
  });
  if (disErr) console.error('Disruption insert error:', disErr);

  // 8. Seed Expenses (Matching exact columns in public.expenses: id, trip_id, title, amount, category, paid_by, split_type, date, notes)
  console.log('💳 Seeding 4 Group Expenses...');
  const { error: expErr } = await s.from('expenses').insert([
    {
      id: e1, trip_id: tripId, paid_by: u1, amount: 38000,
      title: 'Hotel Gracery Shinjuku Stay (4 nights)',
      category: 'accommodation', split_type: 'equal',
      notes: 'Group stay in Kabukicho, Tokyo'
    },
    {
      id: e2, trip_id: tripId, paid_by: u2, amount: 44800,
      title: 'Tokaido Shinkansen Nozomi Bullet Train Tickets (4 pax)',
      category: 'transit', split_type: 'percentage',
      notes: 'High speed reserved cars'
    },
    {
      id: e3, trip_id: tripId, paid_by: u3, amount: 16000,
      title: 'Kyoto Gion Kaiseki Gala Banquet & Tea Ceremony',
      category: 'food', split_type: 'custom',
      notes: 'Traditional 8-course banquet'
    },
    {
      id: e4, trip_id: tripId, paid_by: u4, amount: 6500,
      title: 'Mount Fuji Lake Ashi Scenic Cruise VIP Passes',
      category: 'activity', split_type: 'equal',
      notes: 'Pirate ship cruise on Lake Ashi'
    }
  ]);
  if (expErr) console.error('Expenses insert error:', expErr);

  // 9. Seed Expense Shares (Matching: expense_id, user_id, share_amount)
  console.log('🍰 Seeding Expense Shares...');
  const { error: shErr } = await s.from('expense_shares').insert([
    // e1: equal (38000 / 4 = 9500 each)
    { expense_id: e1, user_id: u1, share_amount: 9500 },
    { expense_id: e1, user_id: u2, share_amount: 9500 },
    { expense_id: e1, user_id: u3, share_amount: 9500 },
    { expense_id: e1, user_id: u4, share_amount: 9500 },
    // e2: percentage (40% Demo = 17920, 20% others = 8960 each)
    { expense_id: e2, user_id: u1, share_amount: 17920 },
    { expense_id: e2, user_id: u2, share_amount: 8960 },
    { expense_id: e2, user_id: u3, share_amount: 8960 },
    { expense_id: e2, user_id: u4, share_amount: 8960 },
    // e3: custom (Demo 5000, Aarav 4000, Priya 4000, Rohan 3000)
    { expense_id: e3, user_id: u1, share_amount: 5000 },
    { expense_id: e3, user_id: u2, share_amount: 4000 },
    { expense_id: e3, user_id: u3, share_amount: 4000 },
    { expense_id: e3, user_id: u4, share_amount: 3000 },
    // e4: equal (6500 / 4 = 1625 each)
    { expense_id: e4, user_id: u1, share_amount: 1625 },
    { expense_id: e4, user_id: u2, share_amount: 1625 },
    { expense_id: e4, user_id: u3, share_amount: 1625 },
    { expense_id: e4, user_id: u4, share_amount: 1625 }
  ]);
  if (shErr) console.error('Shares insert error:', shErr);

  // 10. Seed Settlement (Matching: trip_id, from_user_id, to_user_id, amount, status)
  console.log('🤝 Seeding Settlement...');
  const { error: stErr } = await s.from('settlements').insert({
    trip_id: tripId,
    from_user_id: u2,
    to_user_id: u1,
    amount: 5000,
    status: 'completed'
  });
  if (stErr) console.error('Settlement insert error:', stErr);

  // 11. Seed Cryptographic Ledger Entries (Matching: trip_id, event_type, description, amount, affected_users, entry_hash, previous_hash, sequence_number)
  console.log('⛓️ Seeding Cryptographic Ledger...');
  const { error: ledErr } = await s.from('ledger_entries').insert([
    {
      trip_id: tripId,
      event_type: 'TRIP_INITIALIZED',
      description: 'Tokyo Cherry Blossom & Mount Fuji Odyssey initialized',
      amount: 0,
      affected_users: [u1, u2, u3, u4],
      previous_hash: '0000000000000000000000000000000000000000000000000000000000000000',
      entry_hash: 'c8f384a6b29147d3e0984f18392a8b9f71295b348d2e85a73b9e59104fa281dc',
      sequence_number: 1
    },
    {
      trip_id: tripId,
      event_type: 'EXPENSE_ADDED',
      description: 'Hotel Gracery Shinjuku Stay (4 nights) paid by Demo Explorer',
      amount: 38000,
      affected_users: [u1, u2, u3, u4],
      previous_hash: 'c8f384a6b29147d3e0984f18392a8b9f71295b348d2e85a73b9e59104fa281dc',
      entry_hash: '7a19c5b209d8e34891b2c45f9e8a712395d820b13498f72a56c38190de47219a',
      sequence_number: 2
    },
    {
      trip_id: tripId,
      event_type: 'EXPENSE_ADDED',
      description: 'Tokaido Shinkansen Nozomi Bullet Train Tickets paid by Aarav Sharma',
      amount: 44800,
      affected_users: [u1, u2, u3, u4],
      previous_hash: '7a19c5b209d8e34891b2c45f9e8a712395d820b13498f72a56c38190de47219a',
      entry_hash: '59b8a71c3d902e8471b56f2948ca718293d05e21948ba72819cd0517823e94aa',
      sequence_number: 3
    },
    {
      trip_id: tripId,
      event_type: 'SETTLEMENT_RECORDED',
      description: 'Aarav Sharma settled 5000 INR to Demo Explorer',
      amount: 5000,
      affected_users: [u2, u1],
      previous_hash: '59b8a71c3d902e8471b56f2948ca718293d05e21948ba72819cd0517823e94aa',
      entry_hash: '3e89a5b7c120984f2918da4790184b2938ca718294bd8291048ca718294bd829',
      sequence_number: 4
    }
  ]);
  if (ledErr) console.error('Ledger insert error:', ledErr);

  console.log('✅ Grand Tokyo Odyssey Seed Successfully Completed!');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
