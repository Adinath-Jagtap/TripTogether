// Run: node --env-file=.env.local scripts/seed-demo-trip.js <YOUR_FIREBASE_USER_ID>
// Creates a 12-day demo trip with flights, trains, hotels (with phone numbers), activities, and dependencies

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, doc, setDoc } = require('firebase/firestore');

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

const db = getFirestore(app);

const addDays = (n, time = '09:00:00') => {
  const d = new Date(Date.now() + n * 86400000);
  return `${d.toISOString().slice(0, 10)}T${time}`;
};

async function seed() {
  const USER_ID = process.argv[2];
  if (!USER_ID) {
    console.error('Usage: node --env-file=.env.local scripts/seed-demo-trip.js <YOUR_FIREBASE_USER_ID>');
    process.exit(1);
  }

  console.log('🚀 Creating 12-day North India Grand Expedition...\n');

  // 1. Create trip
  const tripRef = await addDoc(collection(db, 'trips'), {
    title: 'North India Grand Expedition: Delhi → Manali → Kasol → Amritsar → Jaipur',
    destination: 'North India',
    country: 'India',
    description: '12-day adventure across the Himalayas, Golden Temple, and Pink City with flights, trains, river rafting, paragliding, and cultural experiences.',
    cover_image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4',
    start_date: addDays(2).slice(0, 10),
    end_date: addDays(14).slice(0, 10),
    budget: 65000,
    currency: 'INR',
    owner_id: USER_ID,
    owner_name: 'Demo User',
    member_ids: [USER_ID],
    status: 'active',
    resilience_score: 78,
    created_at: new Date(),
  });

  const tripId = tripRef.id;
  console.log(`✅ Trip created: ${tripId}\n`);

  // 2. Bookings — 18 items across 12 days
  const bookings = [
    // Day 1: Mumbai → Delhi
    {
      type: 'flight', title: 'IndiGo 6E-2341: Mumbai → Delhi',
      start_datetime: addDays(2, '06:00:00'), end_datetime: addDays(2, '08:15:00'),
      origin_location: 'Mumbai (BOM)', destination_location: 'Delhi (DEL)',
      cost: 4500, vendor: 'IndiGo Airlines', confirmation_number: 'IND-6E2341-X9',
      flight_number: '6E-2341', pnr: 'PNR8271934',
      status: 'confirmed', risk_level: 'medium', day_number: 1,
    },
    {
      type: 'transfer', title: 'Delhi Airport → Hotel Connaught',
      start_datetime: addDays(2, '09:30:00'), end_datetime: addDays(2, '10:45:00'),
      origin_location: 'Delhi Airport T1', destination_location: 'Connaught Place, Delhi',
      cost: 600, vendor: 'Uber Premier',
      status: 'confirmed', risk_level: 'low', day_number: 1,
    },
    {
      type: 'hotel', title: 'The Imperial New Delhi',
      start_datetime: addDays(2, '14:00:00'), end_datetime: addDays(3, '11:00:00'),
      venue: 'Janpath, Connaught Place, New Delhi',
      cost: 8500, vendor: 'The Imperial', confirmation_number: 'IMP-DLH-9921',
      contact_phone: '+918369848711', contact_name: 'Front Desk',
      status: 'confirmed', risk_level: 'low', day_number: 1,
    },
    {
      type: 'activity', title: 'Old Delhi Heritage Walk: Red Fort & Chandni Chowk',
      start_datetime: addDays(2, '16:00:00'), end_datetime: addDays(2, '20:00:00'),
      venue: 'Red Fort, Old Delhi',
      cost: 1200, vendor: 'Delhi Heritage Walks',
      status: 'confirmed', risk_level: 'low', day_number: 1,
    },
    // Day 2: Delhi → Manali (overnight bus)
    {
      type: 'bus', title: 'HRTC Volvo: Delhi → Manali (Overnight)',
      start_datetime: addDays(3, '17:00:00'), end_datetime: addDays(4, '05:00:00'),
      origin_location: 'ISBT Kashmere Gate, Delhi', destination_location: 'Manali Bus Stand',
      cost: 1800, vendor: 'HRTC Volvo', confirmation_number: 'HRTC-V-8829',
      pnr: 'BUS9912834',
      status: 'confirmed', risk_level: 'medium', day_number: 2,
    },
    // Day 3-5: Manali
    {
      type: 'hotel', title: 'Hotel Snow Peak Manali',
      start_datetime: addDays(4, '07:00:00'), end_datetime: addDays(6, '11:00:00'),
      venue: 'Mall Road, Manali, Himachal Pradesh',
      cost: 7200, vendor: 'Hotel Snow Peak', confirmation_number: 'HSP-2024-8812',
      contact_phone: '+917977270870', contact_name: 'Rajesh (Manager)',
      status: 'confirmed', risk_level: 'low', day_number: 3,
    },
    {
      type: 'activity', title: 'Solang Valley Paragliding & Snow Activities',
      start_datetime: addDays(4, '09:00:00'), end_datetime: addDays(4, '16:00:00'),
      venue: 'Solang Valley, Manali',
      cost: 3500, vendor: 'Himalayan Paragliding Co.',
      confirmation_number: 'HPC-SLG-441',
      status: 'confirmed', risk_level: 'medium', day_number: 3,
    },
    {
      type: 'activity', title: 'Old Manali Cafe Crawl & Hadimba Temple',
      start_datetime: addDays(5, '10:00:00'), end_datetime: addDays(5, '17:00:00'),
      venue: 'Old Manali & Dhungri Van Vihar',
      cost: 800, vendor: 'Local Guide Services',
      status: 'confirmed', risk_level: 'low', day_number: 4,
    },
    // Day 5: Manali → Kasol
    {
      type: 'activity', title: 'Beas River White Water Rafting',
      start_datetime: addDays(6, '08:00:00'), end_datetime: addDays(6, '11:00:00'),
      venue: 'Beas River, Kullu',
      cost: 1800, vendor: 'Kullu Adventure Sports',
      confirmation_number: 'RAFT-KLU-992',
      status: 'confirmed', risk_level: 'medium', day_number: 5,
    },
    {
      type: 'transfer', title: 'Drive: Manali → Kasol via Kullu',
      start_datetime: addDays(6, '12:00:00'), end_datetime: addDays(6, '15:30:00'),
      origin_location: 'Manali', destination_location: 'Kasol, Parvati Valley',
      cost: 1500, vendor: 'Tempo Traveller',
      status: 'confirmed', risk_level: 'low', day_number: 5,
    },
    {
      type: 'hotel', title: 'Kasol Riverside Camp & Bonfire Night',
      start_datetime: addDays(6, '16:00:00'), end_datetime: addDays(8, '10:00:00'),
      venue: 'Parvati Valley Riverside, Kasol',
      cost: 5000, vendor: 'Kasol Adventure Camps',
      confirmation_number: 'KAC-7731-R',
      contact_phone: '+919876543210', contact_name: 'Camp Manager',
      status: 'confirmed', risk_level: 'low', day_number: 5,
    },
    // Day 6: Kheerganga Trek
    {
      type: 'activity', title: 'Kheerganga Trek & Hot Springs (Full Day)',
      start_datetime: addDays(7, '05:30:00'), end_datetime: addDays(7, '19:00:00'),
      venue: 'Kheerganga Peak, Parvati Valley',
      cost: 2000, vendor: 'Parvati Valley Treks',
      status: 'confirmed', risk_level: 'low', day_number: 6,
    },
    // Day 7: Manikaran
    {
      type: 'activity', title: 'Manikaran Sahib Gurudwara & Hot Springs',
      start_datetime: addDays(8, '09:00:00'), end_datetime: addDays(8, '13:00:00'),
      venue: 'Manikaran Sahib, Parvati Valley',
      cost: 0, vendor: 'Free Visit',
      status: 'confirmed', risk_level: 'low', day_number: 7,
    },
    // Day 8: Kasol → Amritsar (long drive/bus)
    {
      type: 'bus', title: 'Volvo Bus: Chandigarh → Amritsar',
      start_datetime: addDays(9, '10:00:00'), end_datetime: addDays(9, '16:00:00'),
      origin_location: 'Chandigarh ISBT', destination_location: 'Amritsar Bus Stand',
      cost: 900, vendor: 'Punjab Roadways Volvo',
      confirmation_number: 'PEPSU-AMR-331',
      status: 'confirmed', risk_level: 'low', day_number: 8,
    },
    {
      type: 'hotel', title: "Hotel Narula's Aurrum, Amritsar",
      start_datetime: addDays(9, '17:00:00'), end_datetime: addDays(11, '11:00:00'),
      venue: 'Near Golden Temple, Amritsar',
      cost: 6400, vendor: "Hotel Narula's Aurrum",
      confirmation_number: 'HNA-5582-GT',
      contact_phone: '+911234567890', contact_name: 'Reception',
      status: 'confirmed', risk_level: 'low', day_number: 8,
    },
    // Day 9: Amritsar
    {
      type: 'activity', title: 'Golden Temple Darshan & Jallianwala Bagh',
      start_datetime: addDays(10, '05:00:00'), end_datetime: addDays(10, '11:00:00'),
      venue: 'Harmandir Sahib (Golden Temple), Amritsar',
      cost: 0, vendor: 'Self-guided',
      status: 'confirmed', risk_level: 'low', day_number: 9,
    },
    {
      type: 'activity', title: 'Wagah Border Flag Lowering Ceremony',
      start_datetime: addDays(10, '15:00:00'), end_datetime: addDays(10, '19:00:00'),
      venue: 'Wagah Border, Amritsar',
      cost: 500, vendor: 'Amritsar Tourism',
      status: 'confirmed', risk_level: 'low', day_number: 9,
    },
    // Day 10-11: Amritsar → Delhi → Mumbai
    {
      type: 'train', title: 'Shatabdi Express: Amritsar → Delhi',
      start_datetime: addDays(11, '06:00:00'), end_datetime: addDays(11, '12:30:00'),
      origin_location: 'Amritsar Junction (ASR)', destination_location: 'New Delhi (NDLS)',
      cost: 1600, vendor: 'Indian Railways',
      confirmation_number: 'IRCTC-12014-ASR',
      train_number: '12014', pnr: 'PNR7829451',
      status: 'confirmed', risk_level: 'high', day_number: 10,
    },
    {
      type: 'flight', title: 'Air India AI-865: Delhi → Mumbai',
      start_datetime: addDays(11, '16:00:00'), end_datetime: addDays(11, '18:15:00'),
      origin_location: 'Delhi (DEL)', destination_location: 'Mumbai (BOM)',
      cost: 5800, vendor: 'Air India',
      confirmation_number: 'AI-865-K3',
      flight_number: 'AI-865', pnr: 'PNR6612847',
      status: 'confirmed', risk_level: 'medium', day_number: 10,
    },
  ];

  const bookingIds = [];
  for (const b of bookings) {
    const ref = await addDoc(collection(db, 'trips', tripId, 'bookings'), {
      trip_id: tripId,
      ...b,
      contact_phone: b.contact_phone || null,
      contact_name: b.contact_name || null,
      flight_number: b.flight_number || null,
      train_number: b.train_number || null,
      pnr: b.pnr || null,
      live_status: null,
      delay_minutes: 0,
      last_checked_at: null,
      risk_reason: null,
    });
    bookingIds.push(ref.id);
    const icon = { flight: '✈️', train: '🚂', hotel: '🏨', bus: '🚌', transfer: '🚗', activity: '🎯' }[b.type] || '📌';
    console.log(`  ${icon} ${b.title} (${ref.id})`);
  }

  // 3. Create dependencies (chain bookings together for disruption cascading)
  const deps = [
    { upstream: 0, downstream: 1, buffer: 75, type: 'flight_to_transfer' },    // flight → airport transfer
    { upstream: 1, downstream: 2, buffer: 180, type: 'transfer_to_hotel' },     // transfer → hotel
    { upstream: 4, downstream: 5, buffer: 120, type: 'bus_to_hotel' },          // overnight bus → manali hotel
    { upstream: 5, downstream: 6, buffer: 60, type: 'hotel_to_activity' },      // hotel → paragliding
    { upstream: 8, downstream: 9, buffer: 60, type: 'activity_to_transfer' },   // rafting → drive to kasol
    { upstream: 9, downstream: 10, buffer: 30, type: 'transfer_to_hotel' },     // drive → kasol camp
    { upstream: 13, downstream: 14, buffer: 60, type: 'bus_to_hotel' },         // bus → amritsar hotel
    { upstream: 17, downstream: 18, buffer: 210, type: 'train_to_flight' },     // train → delhi → flight home
  ];

  for (const d of deps) {
    await addDoc(collection(db, 'trips', tripId, 'bookingDependencies'), {
      trip_id: tripId,
      upstream_booking_id: bookingIds[d.upstream],
      downstream_booking_id: bookingIds[d.downstream],
      buffer_minutes: d.buffer,
      dependency_type: d.type,
    });
  }
  console.log(`\n  🔗 ${deps.length} dependencies created`);

  // 4. Register demo hotels for AI calling
  const hotels = [
    { phone: '+918369848711', name: 'The Imperial New Delhi' },
    { phone: '+917977270870', name: 'Hotel Snow Peak Manali' },
    { phone: '+919876543210', name: 'Kasol Adventure Camps' },
    { phone: '+911234567890', name: "Hotel Narula's Aurrum Amritsar" },
  ];
  for (const h of hotels) {
    await setDoc(doc(db, 'hotels', h.phone), {
      name: h.name,
      phone: h.phone,
      registered_at: new Date(),
    });
    console.log(`  📞 Hotel registered: ${h.name} (${h.phone})`);
  }

  // 5. Add member
  await setDoc(doc(db, 'trips', tripId, 'members', USER_ID), {
    user_id: USER_ID,
    display_name: 'Demo User',
    email: 'demo@triptogether.app',
    role: 'owner',
    joined_at: new Date(),
  });

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ 12-Day North India Grand Expedition ready!`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`\n🌐 URL: http://localhost:3000/trip/${tripId}/itinerary`);
  console.log(`\n🔑 Features to test:`);
  console.log(`   ✈️  Flight tracking: "IndiGo 6E-2341" and "Air India AI-865"`);
  console.log(`   🚂  Train tracking: "Shatabdi Express 12014"`);
  console.log(`   ⚡  Disruption: Go to Disruption tab → Simulate delay on any flight/train`);
  console.log(`   📞  AI Calling: After recovery plan, click "Call via AI Agent" on hotel bookings`);
  console.log(`   🏨  Hotel side: Open /hotel/login in incognito → register with +918369848711`);
  console.log(`\n📊 Trip has 19 bookings, 4 hotels with phones, 2 flights, 1 train`);
  console.log(`   Perfect for demoing cascading disruptions!\n`);

  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
