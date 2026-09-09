import { NextResponse } from 'next/server';

const GROQ_MODELS = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages = [], currentDraft = [], destination = '', startDate = '', userSpeech = '' } = body;

    const groqKey = process.env.GROQ_API_KEY;

    const conversationContext = messages
      .slice(-6)
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const prompt = `You are TripTogether's AI Conversational Itinerary Architect.
A traveler is dictating or conversing about their trip plan.
Your goal is to maintain and refine their structured itinerary canvas in real-time.

TRIP CONTEXT:
- Destination: ${destination || 'Not specified'}
- Starting Date: ${startDate || 'Not specified'}
- Current Draft Bookings (${currentDraft.length}): ${JSON.stringify(currentDraft)}
- User's Latest Speech / Input: "${userSpeech}"

RECENT CHAT HISTORY:
${conversationContext}

CRITICAL RULES:
1. PRESERVE EXISTING DRAFT BOOKINGS:
   - You MUST keep all existing bookings in "currentDraft" in "updated_bookings", unless the user explicitly asks to replace, modify, or remove them.
2. IN-PLACE NODE MUTATIONS & CORRECTIONS:
   - If the user modifies, corrects, or replaces a specific earlier booking (e.g., "change the train to a bus", "hotel price is actually 3500", "update departure to 10am"):
     DO NOT add a duplicate node.
     UPDATE THE EXISTING BOOKING IN-PLACE using its exact "temp_id".
3. ADDITIONS (APPENDING TO EXISTING CANVAS):
   - If the user says "add", "also", "book", or specifies a new activity, stay, dinner, or transit:
     APPEND this new booking as an additional node in "updated_bookings" with a unique "temp_id" (e.g. "b_new_1").
4. REMOVALS:
   - If the user says "remove the train", "cancel the tour", or "delete X", remove that specific item from "updated_bookings".
5. DEPENDENCIES:
   - Recompute sequential transitions between all items in "updated_bookings" so the itinerary graph links smoothly.

Return a STRICT JSON response matching this schema:
{
  "assistant_response": "Concise, friendly confirmation of what was added or updated in the canvas, and 1 sharp follow-up if needed.",
  "missing_elements": ["List of missing or ambiguous items e.g., 'Hotel for Oct 16th', 'Return transit'"],
  "is_ready_for_confirmation": boolean,
  "updated_bookings": [
    {
      "temp_id": "b_1",
      "type": "flight" | "hotel" | "train" | "bus" | "activity" | "transfer" | "other",
      "title": "Booking name e.g. Bus from Mumbai to Hampi",
      "start_datetime": "YYYY-MM-DDTHH:MM:SS",
      "end_datetime": "YYYY-MM-DDTHH:MM:SS",
      "origin_location": "string or null",
      "destination_location": "string or null",
      "venue": "string or null",
      "cost": number,
      "cancellation_policy": "Free cancellation / Standard",
      "vendor": "Operator or Hotel name",
      "confirmation_number": "Reference or pending"
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
                { role: 'system', content: 'You are an itinerary architect. You output ONLY valid JSON.' },
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
              return NextResponse.json({ success: true, ...parsed, model_used: model });
            }
          }
        } catch (err) {
          console.warn(`Groq model ${model} failed, trying fallback:`, err.message);
        }
      }
    }

    // Intelligent local fallback with real mutation awareness
    const fallbackResponse = generateConversationalFallback(userSpeech, currentDraft, destination, startDate);
    return NextResponse.json({ success: true, ...fallbackResponse, is_fallback: true });
  } catch (error) {
    console.error('Itinerary chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process itinerary dialogue', details: error.message },
      { status: 500 }
    );
  }
}

function generateConversationalFallback(speech = '', currentDraft = [], destination = '', startDate = '') {
  const baseDate = startDate || new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10);
  const text = speech.toLowerCase();
  let updatedBookings = [...currentDraft];

  // 1. Extract any mentioned price/cost
  let extractedCost = null;
  // Match patterns like "from 600 to 1500", "price is 1500", "for 1500", "1500 rs", "1500 per person"
  const priceChangeMatch = text.match(/(?:from\s+\d+\s+(?:to|becomes)\s+(\d+))|(?:(?:price|cost|amount)\s+(?:is|changed\s+to|=|to)\s*(\d+))|(?:(?:for|at|costs?)\s+(\d+))|(\d+)\s*(?:rs|rupees|inr|per\s+person)/i);
  if (priceChangeMatch) {
    const matchedVal = priceChangeMatch[1] || priceChangeMatch[2] || priceChangeMatch[3] || priceChangeMatch[4];
    if (matchedVal) extractedCost = Number(matchedVal);
  }

  // 2. Extract locations
  const routeMatch = speech.match(/(?:from\s+([a-zA-Z\s]+?)\s+to\s+([a-zA-Z\s]+?)(?:by|\s|$|\.|\,))/i);
  const origin = routeMatch ? routeMatch[1].trim() : null;
  const dest = routeMatch ? routeMatch[2].trim() : destination || null;

  // 3. Detect vehicle/transport mode
  let isBus = text.includes('bus') || text.includes('volvo');
  let isTrain = text.includes('train') || text.includes('railway');
  let isFlight = text.includes('flight') || text.includes('fly') || text.includes('plane');
  let isHotel = text.includes('hotel') || text.includes('stay') || text.includes('resort') || text.includes('hostel');
  let isActivity = text.includes('tour') || text.includes('temple') || text.includes('visit') || text.includes('museum') || text.includes('cruise') || text.includes('paragliding') || text.includes('dinner') || text.includes('cafe');
  const isExplicitAdd = text.includes('add') || text.includes('book') || text.includes('new') || text.includes('also') || text.includes('plus') || text.includes('another') || isActivity;

  // 4. Check if modifying an existing booking in-place (only when NOT explicitly adding a new booking)
  let modifiedBooking = null;
  if (!isExplicitAdd && (isBus || isTrain || isFlight || extractedCost !== null)) {
    // Find matching transport booking in draft
    const existingTransportIdx = updatedBookings.findIndex(b =>
      b.type === 'train' || b.type === 'bus' || b.type === 'flight' || b.type === 'transfer'
    );

    if (existingTransportIdx >= 0) {
      const existing = updatedBookings[existingTransportIdx];
      const newType = isBus ? 'bus' : isTrain ? 'train' : isFlight ? 'flight' : existing.type;
      const newOrigin = origin || existing.origin_location || 'Mumbai';
      const newDest = dest || existing.destination_location || destination || 'Hampi';
      const newCost = extractedCost !== null ? extractedCost : existing.cost;

      modifiedBooking = {
        ...existing,
        type: newType,
        title: `${newType.charAt(0).toUpperCase() + newType.slice(1)} from ${newOrigin} to ${newDest}`,
        origin_location: newOrigin,
        destination_location: newDest,
        cost: newCost,
        vendor: isBus ? 'Intercity Bus Service' : isTrain ? 'Indian Railways' : existing.vendor,
      };
      updatedBookings[existingTransportIdx] = modifiedBooking;
    }
  }

  // If no in-place modification occurred, create a new booking
  if (!modifiedBooking) {
    let type = 'activity';
    let title = speech.replace(/^(add|book|schedule)\s+/i, '').slice(0, 48) || 'Sightseeing Tour';
    let defaultCost = 1500;

    if (isFlight) {
      type = 'flight';
      title = origin ? `Flight from ${origin} to ${dest || destination}` : 'Inbound Flight';
      defaultCost = 5500;
    } else if (isHotel) {
      type = 'hotel';
      title = speech.includes('stay') || speech.includes('resort') || speech.includes('hotel')
        ? speech.replace(/^(add|book|schedule)\s+/i, '').slice(0, 48)
        : 'Hotel Stay & Check-in';
      defaultCost = 4200;
    } else if (isTrain) {
      type = 'train';
      title = origin ? `Train from ${origin} to ${dest || destination}` : 'Train Transit';
      defaultCost = 800;
    } else if (isBus) {
      type = 'bus';
      title = origin ? `Bus from ${origin} to ${dest || destination}` : (speech.includes('volvo') ? 'Volvo Bus Transfer' : 'Bus Transfer');
      defaultCost = 1400;
    }

    const nextIndex = updatedBookings.length + 1;
    let startIso = `${baseDate}T10:00:00`;
    let endIso = `${baseDate}T13:00:00`;
    if (updatedBookings.length > 0) {
      const lastBooking = updatedBookings[updatedBookings.length - 1];
      if (lastBooking?.start_datetime) {
        try {
          const lastDate = new Date(lastBooking.end_datetime || lastBooking.start_datetime);
          lastDate.setHours(lastDate.getHours() + 3);
          startIso = lastDate.toISOString().slice(0, 19);
          const endDate = new Date(lastDate);
          endDate.setHours(endDate.getHours() + 2);
          endIso = endDate.toISOString().slice(0, 19);
        } catch (_) {}
      }
    }

    const newBooking = {
      temp_id: `b_${Date.now()}_${nextIndex}`,
      type,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      start_datetime: startIso,
      end_datetime: endIso,
      origin_location: origin || null,
      destination_location: dest || destination || null,
      venue: isHotel || type === 'activity' ? destination || 'Destination Area' : null,
      cost: extractedCost !== null ? extractedCost : defaultCost,
      cancellation_policy: 'Standard cancellation policy applies.',
      vendor: isBus ? 'Intercity Volvo Service' : isTrain ? 'Indian Railways' : isHotel ? 'Boutique Hotel' : 'Local Tour Operator',
      confirmation_number: `BK-${Math.floor(100000 + Math.random() * 900000)}`,
    };

    updatedBookings.push(newBooking);
    modifiedBooking = newBooking;
  }

  // Generate sequential dependencies
  const dependencies = [];
  for (let i = 0; i < updatedBookings.length - 1; i++) {
    dependencies.push({
      upstream_temp_id: updatedBookings[i].temp_id || updatedBookings[i].id,
      downstream_temp_id: updatedBookings[i + 1].temp_id || updatedBookings[i + 1].id,
      buffer_minutes: 90,
      dependency_type: 'sequential',
    });
  }

  const hasHotel = updatedBookings.some(b => b.type === 'hotel');
  const hasTransit = updatedBookings.some(b => b.type === 'flight' || b.type === 'train' || b.type === 'bus');
  const missing = [];
  if (!hasTransit) missing.push('Arrival transit details');
  if (!hasHotel) missing.push('Accommodations or hotel check-in');

  let assistant_response = `I've updated "${modifiedBooking.title}" with a cost of ₹${modifiedBooking.cost} on your itinerary canvas.`;
  if (missing.length > 0) {
    assistant_response += ` Notice: We still need your ${missing.join(' and ')}. What are your plans for that?`;
  } else {
    assistant_response += ` Your itinerary canvas is fully updated and ready for review!`;
  }

  return {
    assistant_response,
    missing_elements: missing,
    is_ready_for_confirmation: updatedBookings.length >= 2,
    updated_bookings: updatedBookings,
    dependencies,
  };
}
