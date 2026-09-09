import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { bookings = [], dependencies = [] } = body;

    if (!bookings.length) {
      return NextResponse.json({
        resilience_score: 100,
        bookingRisks: [],
        summary: 'No bookings to analyze.',
      });
    }

    // 1. First run deterministic buffer and dependency risk calculation
    const deterministicRisks = analyzeDeterministicRisks(bookings, dependencies);

    // 2. Try Gemini / Groq for enriched contextual insights if available
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (geminiKey) {
      try {
        const aiRisks = await callGeminiRisk(bookings, dependencies, deterministicRisks, geminiKey);
        if (aiRisks) return NextResponse.json(aiRisks);
      } catch (err) {
        console.warn('Gemini risk analysis failed, falling back:', err.message);
      }
    }

    if (groqKey) {
      try {
        const aiRisks = await callGroqRisk(bookings, dependencies, deterministicRisks, groqKey);
        if (aiRisks) return NextResponse.json(aiRisks);
      } catch (err) {
        console.warn('Groq risk analysis failed, falling back:', err.message);
      }
    }

    // Fallback: return deterministic analysis
    return NextResponse.json(deterministicRisks);
  } catch (error) {
    console.error('Risk API error:', error);
    return NextResponse.json(
      {
        resilience_score: 75,
        bookingRisks: [],
        summary: 'Standard itinerary analysis applied.',
        error: error.message,
      },
      { status: 200 }
    );
  }
}

function analyzeDeterministicRisks(bookings, dependencies) {
  const sorted = [...bookings].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
  const bookingRisks = [];
  let totalPenalty = 0;

  // Build dependency map
  const depMap = new Map();
  dependencies.forEach(d => {
    if (!depMap.has(d.upstream_booking_id)) depMap.set(d.upstream_booking_id, []);
    depMap.get(d.upstream_booking_id).push(d);
  });

  sorted.forEach((booking, idx) => {
    let riskLevel = 'low';
    let reasons = [];
    let recommendation = 'Standard schedule buffer looks good.';

    const downstream = depMap.get(booking.id) || [];
    const nextBooking = sorted[idx + 1];

    // Check buffer to next chronological booking
    if (nextBooking) {
      const endCurrent = new Date(booking.end_datetime).getTime();
      const startNext = new Date(nextBooking.start_datetime).getTime();
      const bufferMinutes = Math.round((startNext - endCurrent) / 60000);

      if (bufferMinutes < 45 && bufferMinutes >= 0) {
        riskLevel = 'high';
        reasons.push(`Critically tight connection (${bufferMinutes} mins) before ${nextBooking.title}`);
        recommendation = `Increase buffer time between ${booking.title} and ${nextBooking.title} to at least 90 minutes.`;
        totalPenalty += 20;
      } else if (bufferMinutes < 90 && bufferMinutes >= 45) {
        riskLevel = riskLevel === 'high' ? 'high' : 'medium';
        reasons.push(`Tight buffer (${bufferMinutes} mins) before ${nextBooking.title}`);
        recommendation = `Consider extra buffer for potential delays or baggage retrieval.`;
        totalPenalty += 10;
      }
    }

    // Flight specific vulnerability
    if (booking.type === 'flight') {
      if (downstream.length > 0) {
        riskLevel = 'high';
        reasons.push(`${downstream.length} downstream bookings depend directly on this flight.`);
        recommendation = 'Ensure travel insurance or flexible cancellation policies on downstream items.';
        totalPenalty += 15;
      }
    }

    // Strict cancellation policy vulnerability
    if (booking.cancellation_policy && booking.cancellation_policy.toLowerCase().includes('non-refundable')) {
      if (riskLevel === 'medium' || riskLevel === 'high') {
        reasons.push('Non-refundable policy increases financial exposure.');
        totalPenalty += 5;
      }
    }

    bookingRisks.push({
      booking_id: booking.id,
      title: booking.title,
      risk_level: riskLevel,
      risk_reason: reasons.length ? reasons.join('; ') : 'Safe schedule margin.',
      recommendation,
    });
  });

  const resilienceScore = Math.max(20, Math.min(100, 100 - totalPenalty));

  return {
    resilience_score: resilienceScore,
    bookingRisks,
    summary:
      resilienceScore > 80
        ? 'High resilience itinerary with adequate buffers and low cascade danger.'
        : resilienceScore > 50
        ? 'Moderate resilience: some tight connections may trigger downstream delays.'
        : 'High vulnerability detected. Several critical bottlenecks could cause cascade disruptions.',
  };
}

async function callGroqRisk(bookings, dependencies, deterministic, apiKey) {
  const prompt = `Analyze this itinerary for travel disruption risk.
Bookings: ${JSON.stringify(bookings.map(b => ({ id: b.id, title: b.title, type: b.type, start: b.start_datetime, end: b.end_datetime, policy: b.cancellation_policy })))}
Dependencies: ${JSON.stringify(dependencies)}
Deterministic baseline: resilience_score = ${deterministic.resilience_score}

Return JSON with format:
{
  "resilience_score": number (0-100),
  "summary": "1-2 sentence overall risk assessment",
  "bookingRisks": [
    {
      "booking_id": "string",
      "title": "string",
      "risk_level": "low" | "medium" | "high",
      "risk_reason": "string",
      "recommendation": "string"
    }
  ]
}
Return ONLY valid JSON.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages: [
        { role: 'system', content: 'You are a travel risk analyst. Return ONLY valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  const match = content.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  return null;
}

async function callGeminiRisk(bookings, dependencies, deterministic, apiKey) {
  const prompt = `Analyze travel itinerary resilience:
Bookings: ${JSON.stringify(bookings.map(b => ({ id: b.id, title: b.title, type: b.type, start: b.start_datetime, end: b.end_datetime })))}
Dependencies: ${JSON.stringify(dependencies)}

Return JSON ONLY:
{
  "resilience_score": number (0-100),
  "summary": "assessment",
  "bookingRisks": [
    {
      "booking_id": "id",
      "title": "title",
      "risk_level": "low"|"medium"|"high",
      "risk_reason": "reason",
      "recommendation": "advice"
    }
  ]
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  return null;
}
