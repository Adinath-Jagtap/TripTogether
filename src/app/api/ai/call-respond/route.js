import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

// --- Groq models ---
const GROQ_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
];

// --- Financial keyword list ---
const FINANCIAL_KEYWORDS = [
  'pay', 'payment', 'charge', 'charges', 'fee', 'fees', 'cost', 'costs',
  'money', 'amount', 'price', 'pricing', 'expense', 'expenses', 'extra',
  'additional', 'surcharge', 'penalty', 'penalties', 'deposit', 'refund',
  'billing', 'bill', 'invoice', 'cash', 'credit', 'card', 'transfer',
];

function hasFinancialTerms(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return FINANCIAL_KEYWORDS.some(kw => lower.includes(kw));
}

// --- Timeout helper ---
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// --- Groq ---
async function tryGroqModel(model, messages) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;
  try {
    const res = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 120 }),
      },
      4000
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || '').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Free tier only -- gemini-3.8-flash is confirmed free (Google AI Studio, no card)
 * as of Sept 2026. If Google ever prices this model or deprecates it, replace with
 * the then-current free-tier Flash model -- check
 * https://ai.google.dev/gemini-api/docs/pricing before swapping, do not assume the
 * next version is free.
 */
async function tryGemini(prompt) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!geminiKey) return null;
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 120 },
        }),
      },
      6000
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim() || null;
  } catch {
    return null;
  }
}

// ==============================================================================
// ROUTE HANDLER
//
// ARCHITECTURE: ALL call-flow decisions (is_final, outcome, when to end) are
// pure JS code. The AI ONLY writes the spoken sentence. It cannot loop,
// cannot decide to keep the call going, cannot ignore financial terms.
// ==============================================================================

export async function POST(request) {
  let callId;
  try {
    const body = await request.json();
    ({ callId } = body);
    const { conversationHistory = [], hotelLatestMessage, context = {} } = body;

    if (!callId) {
      return NextResponse.json({ error: 'callId is required' }, { status: 400 });
    }

    // The frontend sends optimisticHistory which already includes the latest hotel msg.
    // So hotelTurns counts all hotel messages INCLUDING the current one.
    const hotelTurns = conversationHistory.filter(m => m.sender === 'hotel').length;
    const isOpening  = !hotelLatestMessage && hotelTurns === 0;

    console.log(`[call-respond][${callId}] hotelTurns=${hotelTurns} opening=${isOpening} msg="${(hotelLatestMessage || '').substring(0, 80)}"`);

    // ------------------------------------------------------------------
    // CASE 1: Opening -- hotel has not spoken yet
    // ------------------------------------------------------------------
    if (isOpening) {
      const text = await getAIText('opening', context, hotelLatestMessage);
      return await respond(callId, text, false, null, null, 'ai:opening');
    }

    // ------------------------------------------------------------------
    // CASE 2: Financial terms in hotel message -- end immediately
    // ------------------------------------------------------------------
    if (hasFinancialTerms(hotelLatestMessage)) {
      console.log(`[call-respond][${callId}] FINANCIAL TERMS detected.`);
      const text = `I understand. Since this involves additional charges, I will need to have ${context.guestName || 'our guest'} contact you directly to discuss the financial details. Thank you for your time, have a wonderful day, goodbye!`;
      await handleFinancialTerms(callId, context);
      return await respond(callId, text, true, 'needs_manual', 'financial_terms', 'guardrail:financial');
    }

    // ------------------------------------------------------------------
    // CASE 3: First hotel reply (hotelTurns === 1)
    // AI generates a clarifying response, call does NOT end yet
    // ------------------------------------------------------------------
    if (hotelTurns === 1) {
      const text = await getAIText('clarify', context, hotelLatestMessage);
      return await respond(callId, text, false, null, null, 'ai:clarify');
    }

    // ------------------------------------------------------------------
    // CASE 4: Second hotel reply or beyond -- ALWAYS end the call
    // ------------------------------------------------------------------
    const outcome = detectOutcome(hotelLatestMessage);
    const text    = await getAIText('closing', context, hotelLatestMessage, outcome);
    const manual  = outcome === 'needs_manual' ? 'rejected' : null;
    console.log(`[call-respond][${callId}] Ending call. hotelTurns=${hotelTurns} outcome=${outcome}`);
    return await respond(callId, text, true, outcome, manual, 'ai:closing');

  } catch (err) {
    console.error(`[call-respond][${callId ?? 'unknown'}] Unhandled error:`, err.message);
    return NextResponse.json({ error: true, message: 'Failed to generate AI response' }, { status: 500 });
  }
}

// --- Outcome detection: simple keyword scan, no regex ---------------------
function detectOutcome(text) {
  if (!text) return 'confirmed';
  const lower = text.toLowerCase();
  const agreed  = ['yes','sure','okay','ok','alright','confirmed','done','fine','of course','no problem','absolutely'];
  const refused = ['cannot','not possible','sorry','unable','refuse','denied','wont','will not'];
  if (agreed.some(w  => lower.includes(w))) return 'confirmed';
  if (refused.some(w => lower.includes(w))) return 'needs_manual';
  return 'confirmed';
}

// --- AI text generation -- produces ONLY the spoken sentence -------------
async function getAIText(stage, context, hotelMsg, outcome) {
  const guestName  = context.guestName   || 'our guest';
  const hotelName  = context.hotelName   || 'the hotel';
  const bookingRef = context.bookingRef  || 'your booking';
  const fromTime   = context.originalTime || 'the original time';
  const toTime     = context.newTime     || 'a later time';
  const reason     = context.reason      || 'a travel disruption';

  const fallbacks = {
    opening:          `Hello, good ${timeOfDay()}! This is TripTogether's AI travel assistant calling on behalf of ${guestName}. I am reaching out about booking ${bookingRef} at ${hotelName} -- due to ${reason}, we need to shift the check-in from ${fromTime} to ${toTime}. Would you be able to accommodate that?`,
    clarify:          `Thank you for letting us know. Just to confirm -- we would like to update the check-in for booking ${bookingRef} from ${fromTime} to ${toTime}. Can you confirm that change is possible?`,
    closing_confirmed:`Wonderful, thank you so much! I will let ${guestName} know that the check-in has been updated to ${toTime}. We really appreciate your help, have a lovely day, goodbye!`,
    closing_rejected: `Understood, no worries at all. I will let ${guestName} know and they will be in touch with you directly. Thank you for your time, have a great day, goodbye!`,
  };

  const fallback = stage === 'closing'
    ? (outcome === 'confirmed' ? fallbacks.closing_confirmed : fallbacks.closing_rejected)
    : fallbacks[stage];

  let prompt = '';
  if (stage === 'opening') {
    prompt = `You are TripTogether AI calling ${hotelName} on behalf of ${guestName}. Greet them, say you are the TripTogether AI assistant, mention booking ${bookingRef}, and politely ask if they can move check-in from ${fromTime} to ${toTime} due to ${reason}. Max 2 sentences. Plain text only.`;
  } else if (stage === 'clarify') {
    prompt = `You are TripTogether AI on a call with ${hotelName}. They just said: "${(hotelMsg || '').substring(0, 200)}". Acknowledge politely and ask them to confirm: can they update booking ${bookingRef} check-in from ${fromTime} to ${toTime}? Max 2 sentences. Plain text only.`;
  } else if (outcome === 'confirmed') {
    prompt = `You are wrapping up a successful call with ${hotelName}. They confirmed the check-in change for booking ${bookingRef} to ${toTime}. Say a warm brief thank-you and goodbye. Max 2 sentences. Plain text only.`;
  } else {
    prompt = `You are wrapping up a call with ${hotelName} who could not accommodate the request. Tell them ${guestName} will contact them directly, say goodbye warmly. Max 2 sentences. Plain text only.`;
  }

  const messages = [{ role: 'user', content: prompt }];

  for (const model of GROQ_MODELS) {
    const txt = await tryGroqModel(model, messages);
    if (txt && txt.length > 10) return sanitize(txt);
  }

  const gtxt = await tryGemini(prompt);
  if (gtxt && gtxt.length > 10) return sanitize(gtxt);

  return fallback;
}

function sanitize(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\{[\s\S]*?\}/g, '')
    .replace(/^\s*["'`]|["'`]\s*$/g, '')
    .trim();
}

// --- respond() -- saves and returns JSON ---------------------------------
async function respond(callId, text, isFinal, outcome, manualReason, provider) {
  const saved = await saveMessage(callId, 'ai', text);
  return NextResponse.json({
    response: text,
    is_final: isFinal,
    outcome: outcome || null,
    provider,
    ...(manualReason ? { manual_reason: manualReason } : {}),
    ...(saved ? {} : { firestoreError: true }),
  });
}

// --- Financial terms handler ---------------------------------------------
async function handleFinancialTerms(callId, context) {
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status: 'completed',
      outcome: 'needs_manual',
      manual_reason: 'financial_terms',
      ended_at: serverTimestamp(),
    });
    if (context.userId) {
      await addDoc(collection(db, 'notifications'), {
        userId: context.userId,
        title: 'Hotel requires payment confirmation',
        body: `${context.hotelName || 'The hotel'} mentioned additional charges for booking ${context.bookingRef || ''}. Please contact them directly.`,
        action: 'call_hotel',
        hotelPhone: context.hotelPhone || null,
        tripId:     context.tripId    || null,
        read: false,
        created_at: serverTimestamp(),
      });
    }
  } catch (err) {
    console.error(`[call-respond][${callId}] handleFinancialTerms error:`, err.message);
  }
}

// --- Utilities -----------------------------------------------------------
function timeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

async function saveMessage(callId, sender, text) {
  try {
    await addDoc(collection(db, 'calls', callId, 'messages'), {
      sender,
      text,
      timestamp: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error(`[call-respond][${callId}] saveMessage error (${sender}):`, err.message);
    return false;
  }
}
