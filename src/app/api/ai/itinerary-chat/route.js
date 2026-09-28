import { NextResponse } from 'next/server';

const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages = [], currentDraft = [], destination = '', startDate = '', userSpeech = '' } = body;

    const groqKey = process.env.GROQ_API_KEY;

    const conversationContext = messages
      .slice(-6)
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const prompt = `You are TripTogether's AI Master Itinerary Architect & Planner.
A traveler is dictating or describing their travel plans.

TRIP CONTEXT:
- Destination: ${destination || 'Not specified'}
- Starting Date: ${startDate || 'Not specified'}
- Current Draft Bookings (${currentDraft.length}): ${JSON.stringify(currentDraft)}
- User's Latest Speech / Input: "${userSpeech}"

RECENT CHAT HISTORY:
${conversationContext}

YOUR MISSION:
Parse the user's speech, extract clean trip metadata, and plan/update a structured itinerary graph of actual bookings.

CRITICAL INSTRUCTIONS:
1. DESTINATION & METADATA EXTRACTION:
   - Extract the target destination name cleanly (e.g. "Jaipur", "Goa", "Manali", "Tokyo", "Kerala", "Paris", "Udaipur", "Kashmir", etc.).
   - DO NOT return the user's raw prompt sentence as the title or destination!
   - Provide a clean, exciting trip title (e.g. "Jaipur Royal Heritage Expedition").
   - Extract/estimate country, start date, end date, and total estimated budget (in INR unless currency specified).

2. MULTI-DAY ITINERARY PLANNING (FOR NEW TRIPS / FULL REQUESTS):
   - When the user asks to plan a trip or describes a trip destination, generate a complete chronological sequence of booking nodes:
     a) Outbound Transit (flight / train / bus) from origin to destination.
     b) Station/Airport transfer to accommodation.
     c) Hotel / Resort stay.
     d) Daily sightseeing activities, tours, or cultural experiences spread across the days.
     e) Return Transit back to origin.
   - Each booking MUST have a concise descriptive title (e.g. "Vande Bharat Express: Mumbai to Jaipur", "Taj Rambagh Palace Stay", "Amber Fort Jeep Safari"), start_datetime, end_datetime, origin_location, destination_location or venue, cost, vendor, and confirmation_number.

3. IN-PLACE NODE MUTATIONS (FOR UPDATES TO EXISTING DRAFT):
   - If "currentDraft" has existing items and the user asks to modify a booking (e.g. "change hotel price to 4000", "make departure 10am"):
     UPDATE THE EXISTING ITEM IN-PLACE using its exact "temp_id" or "id". Do NOT duplicate nodes!

4. SINGLE ITEM ADDITIONS / REMOVALS:
   - If adding a specific single booking (e.g. "add a dinner cruise at 8pm"), append it to "currentDraft".
   - If deleting, remove that item.

Return a STRICT JSON response matching this schema:
{
  "assistant_response": "Friendly, concise confirmation of what was planned or updated in the canvas.",
  "suggested_destination": "Clean destination name e.g. Nanded or Jaipur",
  "suggested_country": "Country e.g. India",
  "suggested_title": "Memorable trip title (e.g. Nanded Sacred Gurdwara Pilgrimage & Hazoor Sahib Expedition)",
  "suggested_start_date": "YYYY-MM-DD",
  "suggested_end_date": "YYYY-MM-DD",
  "suggested_budget": number,
  "missing_elements": ["List of missing details if any e.g. Hotel stay in Nanded, Return train"],
  "is_ready_for_confirmation": true,
  "updated_bookings": [
    {
      "temp_id": "b_1",
      "type": "flight" | "hotel" | "train" | "bus" | "activity" | "transfer" | "other",
      "title": "Clean booking title e.g. Vande Bharat Express to Jaipur",
      "start_datetime": "YYYY-MM-DDTHH:MM:SS",
      "end_datetime": "YYYY-MM-DDTHH:MM:SS",
      "origin_location": "string or null",
      "destination_location": "string or null",
      "venue": "string or null",
      "cost": number,
      "cancellation_policy": "Standard cancellation policy",
      "vendor": "Operator or Hotel name",
      "confirmation_number": "Reference or pending",
      "flight_number": "IATA flight code e.g. 6E-2341 or AI-505 — for flight type, else null",
      "train_number": "Train number e.g. 12301 — for train type, else null",
      "pnr": "PNR if present e.g. PNR4829173, else null",
      "contact_phone": "Hotel or vendor phone if present, else null",
      "contact_name": "Hotel contact name if present, else null"
    }
  ],
  "dependencies": [
    {
      "upstream_temp_id": "b_1",
      "downstream_temp_id": "b_2",
      "buffer_minutes": 90,
      "dependency_type": "sequential"
    }
  ]
}
Return ONLY valid JSON.`;

    // Try Groq with active verified models
    if (groqKey) {
      for (const model of GROQ_MODELS) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: 'You are a master travel itinerary architect. You output ONLY valid JSON.' },
                { role: 'user', content: prompt },
              ],
              temperature: 0.2,
              response_format: { type: 'json_object' },
            }),
          });

          if (res.ok) {
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content || '';
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (Array.isArray(parsed.updated_bookings) && parsed.updated_bookings.length > 0) {
                parsed.updated_bookings = backfillMissingCosts(parsed.updated_bookings);
                parsed.updated_bookings = extractAndEnrichTransportDetails(parsed.updated_bookings, userSpeech);
                return NextResponse.json({ success: true, ...parsed, model_used: model });
              }
            }
          }
        } catch (err) {
          console.warn(`Groq model ${model} failed, trying fallback:`, err.message);
        }
      }
    }

    // Try Gemini AI fallback if Groq is unavailable
    const geminiParsed = await tryGeminiParsing(prompt);
    if (geminiParsed) {
      if (Array.isArray(geminiParsed.updated_bookings)) {
        geminiParsed.updated_bookings = extractAndEnrichTransportDetails(geminiParsed.updated_bookings, userSpeech);
      }
      return NextResponse.json({ success: true, ...geminiParsed, model_used: 'gemini-flash' });
    }

    // Intelligent local fallback with real destination parsing & multi-day itinerary planner
    const fallbackResponse = generateConversationalFallback(userSpeech, currentDraft, destination, startDate);
    if (Array.isArray(fallbackResponse.updated_bookings)) {
      fallbackResponse.updated_bookings = extractAndEnrichTransportDetails(fallbackResponse.updated_bookings, userSpeech);
    }
    return NextResponse.json({ success: true, ...fallbackResponse, is_fallback: true });
  } catch (error) {
    console.error('Itinerary chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process itinerary dialogue', details: error.message },
      { status: 500 }
    );
  }
}

async function tryGeminiParsing(prompt) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!geminiKey) return null;

  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${prompt}\n\nParse user speech into structured itinerary JSON.` }] }],
            generationConfig: { temperature: 0.2, response_format: { type: 'json_object' } },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed.updated_bookings) && parsed.updated_bookings.length > 0) {
            return parsed;
          }
        }
      }
    } catch (err) {
      console.warn(`Gemini model ${model} parse note:`, err.message);
    }
  }
  return null;
}

function sanitizeVoiceTitle(rawText, type, origin, dest) {
  if (!rawText) rawText = '';

  let cleaned = rawText
    .replace(/^(add|book|schedule|want|please|let'?s|i\s+want\s+to|we\s+need|can\s+you\s+add|plan|plan\s+a)\s+/i, '')
    .replace(/for\s+(?:₹|rs\.?|rupees?|\$)?\s*\d+\s*(?:per\s+night|per\s+person)?/gi, '')
    .replace(/(?:on|at|by|from)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
    .replace(/we\s+(?:land|arrive|reach|check\s*in)\s+(?:in|at)?/gi, '')
    .replace(/(?:3-day|4-day|5-day|\d+\s*day|trip|package)\s+(?:to|in)?/gi, '')
    .trim();

  cleaned = cleaned.replace(/^[\s,.\-—–+:]+|[\s,.\-—–+:]+$/g, '');

  if (!cleaned || cleaned.length < 3 || ['trip', 'goa', 'tokyo', 'himachal', 'jaipur', 'manali'].includes(cleaned.toLowerCase())) {
    if (type === 'flight') return origin && dest ? `Flight (${origin} → ${dest})` : dest ? `Flight to ${dest}` : 'Inbound Flight';
    if (type === 'hotel') return dest ? `Hotel Resort Stay (${dest})` : 'Hotel Check-in & Stay';
    if (type === 'train') return origin && dest ? `Train Transit (${origin} → ${dest})` : 'Train Transit';
    if (type === 'bus') return origin && dest ? `Intercity Bus (${origin} → ${dest})` : 'Volvo Bus Transfer';
    if (type === 'activity') return dest ? `Guided Excursion in ${dest}` : 'Sightseeing Tour';
    return 'Travel Event';
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// Destination metadata & sightseeing itinerary template database for intelligent fallback
const DESTINATION_DATABASE = {
  nanded: {
    destination: 'Nanded',
    country: 'India',
    title: 'Nanded Sacred Gurdwara Pilgrimage & Hazoor Sahib Expedition',
    hotelName: 'Yatri Niwas & NRI Niwas Complex Hazur Sahib',
    activities: [
      { title: 'Takht Sachkhand Sri Hazur Sahib Darshan & Morning Asa Di Var', venue: 'Takht Sri Hazur Sahib Nanded', cost: 1000 },
      { title: 'Gurdwara Shikar Ghat Sahib & Banda Ghat River Ridge Tour', venue: 'Godavari Riverbank Nanded', cost: 800 },
      { title: 'Gurdwara Nanak Puri Sahib & Nagina Ghat Darshan', venue: 'Godavari Ghats Nanded', cost: 700 },
      { title: 'Evening Rehras Sahib & Laser Light Sound Show at Hazur Sahib', venue: 'Main Takht Complex Nanded', cost: 500 },
    ],
  },
  jaipur: {
    destination: 'Jaipur',
    country: 'India',
    title: 'Jaipur Royal Heritage Expedition',
    hotelName: 'Taj Rambagh Palace & Heritage Resort',
    activities: [
      { title: 'Hawa Mahal & City Palace Guided Cultural Walk', venue: 'Old Pink City Jaipur', cost: 1200 },
      { title: 'Amber Fort Elephant Rampart & Jeep Safari', venue: 'Amer Fort Hilltop', cost: 2500 },
      { title: 'Jal Mahal View & Johari Bazaar Handicraft Shopping', venue: 'Man Sagar Lake & Johari Bazaar', cost: 1800 },
      { title: 'Chokhi Dhani Traditional Rajasthani Dinner & Folk Evening', venue: 'Chokhi Dhani Village', cost: 2200 },
    ],
  },
  udaipur: {
    destination: 'Udaipur',
    country: 'India',
    title: 'Udaipur Lakes & Palaces Getaway',
    hotelName: 'Taj Lake Palace & City Resort',
    activities: [
      { title: 'Lake Pichola Sunset Solar Boat Cruise to Jagmandir', venue: 'Lake Pichola Udaipur', cost: 1800 },
      { title: 'Udaipur City Palace & Jagdish Temple Heritage Tour', venue: 'City Palace Complex', cost: 1400 },
      { title: 'Saheliyon Ki Bari & Sajjangarh Monsoon Palace Sunset', venue: 'Monsoon Palace Hill', cost: 1600 },
      { title: 'Bagore Ki Haveli Dharohar Cultural Dance Performance', venue: 'Gangaur Ghat', cost: 900 },
    ],
  },
  goa: {
    destination: 'Goa',
    country: 'India',
    title: 'Goa Beach & Catamaran Escape',
    hotelName: 'Taj Fort Aguada Beach Resort & Spa',
    activities: [
      { title: 'Sunset Catamaran Cruise & Water Sports at Baga', venue: 'Baga Beach North Goa', cost: 3200 },
      { title: 'Old Goa UNESCO Cathedrals & Spice Plantation Tour', venue: 'Velha Goa & Ponda', cost: 2100 },
      { title: 'Dudhsagar Waterfalls Jeep Safari & Jungle Trek', venue: 'Mollem National Park', cost: 2800 },
      { title: 'Anjuna Beach Sunset Lounge & Seafood Dinner', venue: 'Anjuna Cliffside', cost: 2400 },
    ],
  },
  manali: {
    destination: 'Manali & Kasol',
    country: 'India',
    title: 'Himachal Snow & Mountain Expedition',
    hotelName: 'Grace Resort & Spa Manali',
    activities: [
      { title: 'Solang Valley Snow Sports & Paragliding Adventure', venue: 'Solang Valley', cost: 3500 },
      { title: 'Hadimba Devi Temple & Mall Road Heritage Walk', venue: 'Dhungri Van Vihar', cost: 800 },
      { title: 'Atal Tunnel & Sissu Valley Day Excursion', venue: 'Lahaul Valley Sissu', cost: 2600 },
      { title: 'Kasol Parvati River Campfire & DJ Night', venue: 'Kasol Parvati Valley', cost: 2200 },
    ],
  },
  kerala: {
    destination: 'Kerala Backwaters & Munnar',
    country: 'India',
    title: 'Kerala Tropical Spice & Backwater Odyssey',
    hotelName: 'Alleppey Luxury Houseboat & Munnar Tea Resort',
    activities: [
      { title: 'Fort Kochi Heritage Walk & Chinese Fishing Nets', venue: 'Fort Kochi', cost: 1100 },
      { title: 'Munnar Tea Gardens & Eravikulam National Park Safari', venue: 'Munnar Hills', cost: 2400 },
      { title: 'Alleppey Backwaters Private Houseboat Sunset Cruise', venue: 'Vembanad Lake', cost: 6500 },
      { title: 'Traditional Kathakali Cultural Performance & Ayurvedic Spa', venue: 'Kochi Cultural Center', cost: 2200 },
    ],
  },
  kashmir: {
    destination: 'Srinagar & Gulmarg',
    country: 'India',
    title: 'Kashmir Heaven on Earth Expedition',
    hotelName: 'Heritage Shikara Houseboat & Gulmarg Resort',
    activities: [
      { title: 'Shikara Sunset Ride on Dal Lake & Floating Market', venue: 'Dal Lake Srinagar', cost: 1500 },
      { title: 'Mughal Gardens (Shalimar & Nishat Bagh) Exploration', venue: 'Boulevard Road', cost: 1000 },
      { title: 'Gulmarg Gondola Cable Car Ride (Phase 1 & Phase 2)', venue: 'Gulmarg Snow Peaks', cost: 4200 },
      { title: 'Pahalgam Betaab Valley & Aru Valley Jeep Safari', venue: 'Pahalgam Valley', cost: 3100 },
    ],
  },
  tokyo: {
    destination: 'Tokyo & Kyoto',
    country: 'Japan',
    title: 'Tokyo & Kyoto Cherry Blossom Odyssey',
    hotelName: 'Hotel Gracery Shinjuku (Godzilla Tower)',
    activities: [
      { title: 'Shibuya Crossing & TeamLab Planets Digital Art Museum', venue: 'Toyosu & Shibuya', cost: 4500 },
      { title: 'Meiji Jingu Shrine & Harajuku Takeshita Street Tour', venue: 'Harajuku Tokyo', cost: 3200 },
      { title: 'Shinkansen Bullet Train Express to Kyoto', venue: 'Tokyo Station to Kyoto', cost: 8500 },
      { title: 'Fushimi Inari 10,000 Torii Gates & Arashiyama Bamboo Grove', venue: 'Kyoto Heritage', cost: 2900 },
    ],
  },
  paris: {
    destination: 'Paris',
    country: 'France',
    title: 'Paris Lights & Romance Escapade',
    hotelName: 'Le Grand Hotel Paris Seine',
    activities: [
      { title: 'Eiffel Tower Summit Access & Seine River Dinner Cruise', venue: 'Champ de Mars Paris', cost: 7500 },
      { title: 'Louvre Museum Mona Lisa & Masterpieces Guided Tour', venue: 'Musée du Louvre', cost: 4800 },
      { title: 'Montmartre Sacré-Cœur & Painters Square Heritage Walk', venue: 'Montmartre Hill', cost: 2600 },
      { title: 'Palace of Versailles Royal Hall of Mirrors Excursion', venue: 'Versailles France', cost: 5200 },
    ],
  },
  dubai: {
    destination: 'Dubai',
    country: 'UAE',
    title: 'Dubai Futuristic Luxury Getaway',
    hotelName: 'Atlantis The Palm & Marina Resort',
    activities: [
      { title: 'Burj Khalifa At The Top (124th Floor) & Fountain Show', venue: 'Downtown Dubai', cost: 5800 },
      { title: 'Desert Safari 4x4 Dune Bashing & BBQ Dinner Show', venue: 'Lahbab Desert Dunes', cost: 4200 },
      { title: 'Dubai Marina Luxury Yacht Cruise & Ain Dubai', venue: 'Dubai Marina', cost: 6500 },
      { title: 'Museum of the Future & Gold Souk Heritage Walk', venue: 'Sheikh Zayed Road', cost: 3900 },
    ],
  }
};

function generateConversationalFallback(speech = '', currentDraft = [], currentDestination = '', startDate = '') {
  const text = speech.trim();
  const lower = text.toLowerCase();
  const baseDate = startDate || new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10);

  // If user is editing/updating an existing draft (and not asking for a new plan)
  const isMutation = currentDraft.length > 0 && (
    lower.includes('change') ||
    lower.includes('update') ||
    lower.includes('price') ||
    lower.includes('cost') ||
    lower.includes('cancel') ||
    lower.includes('remove') ||
    lower.includes('delete') ||
    lower.includes('add')
  );

  if (isMutation) {
    let updatedBookings = [...currentDraft];
    let priceMatch = lower.match(/(?:from\s+\d+\s+(?:to|becomes)\s+(\d+))|(?:(?:price|cost|amount)\s+(?:is|changed\s+to|=|to)\s*(\d+))|(?:(?:for|at|costs?)\s+(\d+))|(\d+)\s*(?:rs|rupees|inr|per\s+person)/i);
    let newCost = priceMatch ? Number(priceMatch[1] || priceMatch[2] || priceMatch[3] || priceMatch[4]) : null;

    if (newCost !== null && updatedBookings.length > 0) {
      // Find hotel or last booking to update cost
      const hotelIdx = updatedBookings.findIndex(b => b.type === 'hotel');
      const targetIdx = hotelIdx !== -1 ? hotelIdx : updatedBookings.length - 1;
      updatedBookings[targetIdx] = { ...updatedBookings[targetIdx], cost: newCost };

      return {
        assistant_response: `Updated the price of "${updatedBookings[targetIdx].title}" to ₹${newCost}.`,
        suggested_destination: currentDestination || 'Your Destination',
        suggested_title: 'Updated Trip Itinerary',
        suggested_start_date: baseDate,
        suggested_budget: updatedBookings.reduce((sum, b) => sum + (Number(b.cost) || 0), 0),
        updated_bookings: updatedBookings,
        dependencies: generateSequentialDependencies(updatedBookings),
        is_ready_for_confirmation: true,
      };
    }
  }

  // ITINERARY PLANNING ENGINE (Parses user intent and builds multi-day plan)
  // 1. Extract Destination
  let destKey = null;
  let destMeta = null;

  for (const [k, meta] of Object.entries(DESTINATION_DATABASE)) {
    if (lower.includes(k)) {
      destKey = k;
      destMeta = meta;
      break;
    }
  }

  // Fallback destination extraction if not in preset database
  let targetDestName = destMeta ? destMeta.destination : null;
  if (!targetDestName) {
    const destMatch = text.match(/(?:trip\s+to|visit(?:ing)?|going\s+to|in|for|explore|exploring|travel\s+to)\s+([A-Z][a-zA-Z\s]{2,20})(?:\s+(?:from|with|by|on|for|in|during|starting|around|\.|,|$))/i);
    if (destMatch && destMatch[1]) {
      const raw = destMatch[1].trim();
      if (!['a', 'the', 'my', 'our', 'some', 'few', 'days', 'day', 'trip'].includes(raw.toLowerCase())) {
        targetDestName = raw.charAt(0).toUpperCase() + raw.slice(1);
      }
    }
  }

  if (!targetDestName) {
    targetDestName = currentDestination || 'Jaipur';
  }

  // Clean targetDestName of any accidental station/airport/terminal suffixes
  targetDestName = targetDestName
    .replace(/\s+(Station|Airport|Terminal|Junction|Bus Stand|Resort)\/?.*/i, '')
    .trim();

  // 2. Extract Duration
  let durationDays = 3;
  const daysMatch = lower.match(/(\d+)\s*-?\s*day/);
  if (daysMatch) {
    durationDays = Math.min(Math.max(parseInt(daysMatch[1], 10), 2), 7);
  }

  // 3. Extract Origin
  let originCity = 'Mumbai';
  const originMatch = text.match(/from\s+([A-Z][a-zA-Z\s]{2,15})(?:\s+to|\s+by|\s+for|\.|\,|$)/i);
  if (originMatch) {
    originCity = originMatch[1].trim();
  }

  // 4. Extract Transit Mode & Location Terms
  let transitType = 'flight';
  let transitVendor = 'IndiGo Airlines';
  let transitTitle = `IndiGo Flight: ${originCity} to ${targetDestName}`;
  let transitCost = 4800;
  let stationName = 'Airport';
  let originLoc = `${originCity} Airport (BOM)`;
  let destLoc = `${targetDestName} Airport`;

  if (lower.includes('train') || lower.includes('rail')) {
    transitType = 'train';
    transitVendor = 'Indian Railways';
    transitTitle = `Vande Bharat Express: ${originCity} to ${targetDestName}`;
    transitCost = 1850;
    stationName = 'Railway Station';
    originLoc = `${originCity} Central Railway Station`;
    destLoc = `${targetDestName} Junction Railway Station`;
  } else if (lower.includes('bus') || lower.includes('volvo')) {
    transitType = 'bus';
    transitVendor = 'Intercity Volvo Service';
    transitTitle = `Volvo AC Sleeper Bus: ${originCity} to ${targetDestName}`;
    transitCost = 1400;
    stationName = 'Bus Stand';
    originLoc = `${originCity} Intercity Bus Terminal`;
    destLoc = `${targetDestName} Central Bus Stand`;
  }

  // 5. Construct Multi-Day Dates
  const startDateObj = new Date(baseDate);
  const addDaysIso = (days, time = '10:00:00') => {
    const d = new Date(startDateObj.getTime() + days * 86400000);
    return `${d.toISOString().slice(0, 10)}T${time}`;
  };

  const endDateIso = addDaysIso(durationDays, '18:00:00');
  const endDateOnly = addDaysIso(durationDays).slice(0, 10);

  // 6. Generate Bookings Array
  const bookings = [];
  const timestamp = Date.now();

  // Booking 1: Outbound Transit
  bookings.push({
    temp_id: `b_${timestamp}_1`,
    type: transitType,
    title: transitTitle,
    start_datetime: addDaysIso(0, '07:30:00'),
    end_datetime: addDaysIso(0, '10:45:00'),
    origin_location: originLoc,
    destination_location: destLoc,
    cost: transitCost,
    vendor: transitVendor,
    confirmation_number: `${transitType.toUpperCase().slice(0, 3)}-${Math.floor(100000 + Math.random() * 900000)}`,
    cancellation_policy: 'Standard cancellation policy applies.',
  });

  // Booking 2: Local Transfer to Hotel
  bookings.push({
    temp_id: `b_${timestamp}_2`,
    type: 'transfer',
    title: `Local Taxi Transfer from ${stationName} to Hotel`,
    start_datetime: addDaysIso(0, '11:15:00'),
    end_datetime: addDaysIso(0, '12:00:00'),
    origin_location: destLoc,
    destination_location: `${targetDestName} Hotel Area`,
    cost: 850,
    vendor: `${targetDestName} Taxi Stand Union`,
    confirmation_number: `CAB-${Math.floor(10000 + Math.random() * 90000)}`,
    cancellation_policy: 'Free cancellation up to 2 hours before.',
  });

  // Booking 3: Hotel Stay
  const hotelName = destMeta ? destMeta.hotelName : `Grand Heritage Resort & Spa ${targetDestName}`;
  bookings.push({
    temp_id: `b_${timestamp}_3`,
    type: 'hotel',
    title: hotelName,
    start_datetime: addDaysIso(0, '12:30:00'),
    end_datetime: addDaysIso(durationDays, '11:00:00'),
    venue: `${targetDestName} City Center`,
    cost: (destMeta ? 4500 : 3800) * durationDays,
    vendor: hotelName,
    confirmation_number: `HTL-${Math.floor(100000 + Math.random() * 900000)}`,
    contact_phone: '+919876543210',
    contact_name: 'Front Desk Hospitality',
    cancellation_policy: 'Free cancellation up to 48 hours prior to check-in.',
  });

  // Booking 4+: Sightseeing Activities
  const activityList = destMeta
    ? destMeta.activities
    : [
        { title: `${targetDestName} Iconic Landmark & Cultural Guided Walk`, venue: `${targetDestName} Heritage Zone`, cost: 1500 },
        { title: `${targetDestName} Local Market Excursion & Sunset Viewpoint`, venue: `${targetDestName} Sunset Point`, cost: 1200 },
        { title: `${targetDestName} Adventure & Culinary Tasting Experience`, venue: `${targetDestName} Old Town`, cost: 2200 },
      ];

  activityList.slice(0, durationDays + 1).forEach((act, idx) => {
    const dayOffset = Math.min(idx, durationDays - 1);
    bookings.push({
      temp_id: `b_${timestamp}_act_${idx + 1}`,
      type: 'activity',
      title: act.title,
      start_datetime: addDaysIso(dayOffset, idx % 2 === 0 ? '15:00:00' : '10:00:00'),
      end_datetime: addDaysIso(dayOffset, idx % 2 === 0 ? '18:30:00' : '13:30:00'),
      venue: act.venue,
      cost: act.cost,
      vendor: `${targetDestName} Local Tour Guides`,
      confirmation_number: `ACT-${Math.floor(10000 + Math.random() * 90000)}`,
      cancellation_policy: 'Included in guided trip package.',
    });
  });

  // Final Booking: Return Transit
  bookings.push({
    temp_id: `b_${timestamp}_return`,
    type: transitType,
    title: `Return ${transitType === 'flight' ? 'Flight' : transitType === 'train' ? 'Train' : 'Bus'}: ${targetDestName} to ${originCity}`,
    start_datetime: addDaysIso(durationDays, '15:00:00'),
    end_datetime: addDaysIso(durationDays, '18:15:00'),
    origin_location: destLoc,
    destination_location: originLoc,
    cost: transitCost,
    vendor: transitVendor,
    confirmation_number: `RET-${Math.floor(100000 + Math.random() * 900000)}`,
    cancellation_policy: 'Standard cancellation policy applies.',
  });

  // Dependencies
  const dependencies = generateSequentialDependencies(bookings);
  const totalBudget = bookings.reduce((sum, b) => sum + (Number(b.cost) || 0), 0);
  const tripTitle = destMeta ? destMeta.title : `${targetDestName} ${durationDays}-Day Group Expedition`;

  return {
    assistant_response: `I've structured a complete ${durationDays}-day itinerary for ${targetDestName} starting on ${baseDate}, including ${transitType === 'flight' ? 'flights' : transitType === 'train' ? 'train transfers' : 'bus transfers'}, ${hotelName}, and guided sightseeing activities.`,
    suggested_destination: targetDestName,
    suggested_country: destMeta ? destMeta.country : 'India',
    suggested_title: tripTitle,
    suggested_start_date: baseDate,
    suggested_end_date: endDateOnly,
    suggested_budget: totalBudget,
    missing_elements: [],
    is_ready_for_confirmation: true,
    updated_bookings: bookings,
    dependencies,
  };
}

function generateSequentialDependencies(bookings = []) {
  const deps = [];
  for (let i = 0; i < bookings.length - 1; i++) {
    deps.push({
      upstream_temp_id: bookings[i].temp_id || bookings[i].id,
      downstream_temp_id: bookings[i + 1].temp_id || bookings[i + 1].id,
      buffer_minutes: 90,
      dependency_type: 'sequential',
    });
  }
  return deps;
}

function backfillMissingCosts(bookings = []) {
  return (bookings || []).map(b => {
    let cost = Number(b.cost);
    if (!cost || cost <= 0) {
      if (b.type === 'flight') cost = 4800;
      else if (b.type === 'train') cost = 1850;
      else if (b.type === 'bus') cost = 1400;
      else if (b.type === 'hotel') cost = 3500;
      else if (b.type === 'transfer') cost = 850;
      else cost = 1200;
    }
    return { ...b, cost };
  });
}

export function extractAndEnrichTransportDetails(bookings = [], rawText = '') {
  const fullText = (rawText || '').toUpperCase();

  return (bookings || []).map(b => {
    const updated = { ...b };
    const bType = (updated.type || '').toLowerCase();
    const titleAndVendor = `${updated.title || ''} ${updated.vendor || ''} ${updated.confirmation_number || ''}`.toUpperCase();
    const combinedSearchText = `${titleAndVendor} ${fullText}`;

    // 1. Flight Number extraction
    if (bType === 'flight' || (!bType && (combinedSearchText.includes('FLIGHT') || combinedSearchText.includes('AIR')))) {
      if (!updated.flight_number) {
        // Regex patterns for Indian & global flight codes (e.g., 6E-2341, AI-505, UK 834, SG8192, QP1102, IX123)
        const flightMatch =
          combinedSearchText.match(/\b(6E|AI|UK|SG|G8|IX|QP|I5|TG|SQ|EK|BA|QR|AA|DL|UA|NH|JL|ET)[-\s]?(\d{3,4})\b/i) ||
          combinedSearchText.match(/(?:FLIGHT|AIRLINE|PLANE)\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*([A-Z0-9]{2,3}[-\s]?\d{3,4})\b/i);

        if (flightMatch) {
          if (flightMatch[1] && flightMatch[2]) {
            updated.flight_number = `${flightMatch[1].toUpperCase()}-${flightMatch[2]}`;
          } else if (flightMatch[1]) {
            updated.flight_number = flightMatch[1].toUpperCase().replace(/\s+/g, '-');
          }
        }
      }
    }

    // 2. Train Number extraction
    if (bType === 'train' || (!bType && (combinedSearchText.includes('TRAIN') || combinedSearchText.includes('EXPRESS') || combinedSearchText.includes('RAJDHANI') || combinedSearchText.includes('SHATABDI') || combinedSearchText.includes('VANDE')))) {
      if (!updated.train_number) {
        // Match 5-digit Indian Railways train number (e.g. 12301, 12951, 20901, 12009, 12425)
        const trainMatch =
          titleAndVendor.match(/\b(\d{5})\b/) ||
          fullText.match(/(?:TRAIN|RAIL|EXPRESS|VANDE|RAJDHANI|SHATABDI)\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*(\d{5})\b/i) ||
          fullText.match(/\b(\d{5})\b/);

        if (trainMatch) {
          updated.train_number = trainMatch[1];
        }
      }
    }

    // 3. PNR extraction
    if (!updated.pnr) {
      const pnrMatch =
        titleAndVendor.match(/\bPNR\s*[:#-]?\s*([A-Z0-9]{6,10})\b/i) ||
        fullText.match(/(?:PNR|BOOKING\s*REF|TICKET\s*NO)\s*[:#-]?\s*([A-Z0-9]{6,10})\b/i) ||
        (bType === 'train' && fullText.match(/\b(\d{10})\b/)); // 10-digit IRCTC PNR

      if (pnrMatch) {
        updated.pnr = pnrMatch[1].toUpperCase();
      }
    }

    return updated;
  });
}
