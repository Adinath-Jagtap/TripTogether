import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { disruption = {}, allBookings = [], dependencies = [], affectedBookings = [], budget = 50000 } = body;

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ plans: getFallbackPlans(disruption, affectedBookings, budget) });
    }

    const prompt = buildPrompt(disruption, allBookings, dependencies, affectedBookings, budget);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b',
        messages: [
          { role: 'system', content: 'You are a travel disruption recovery expert. Return ONLY a valid JSON array of plans.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      const match = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const plans = Array.isArray(parsed) ? parsed : (parsed.plans || Object.values(parsed)[0]);
        if (Array.isArray(plans) && plans.length > 0) {
          // Ensure every plan has concrete changes
          const enrichedPlans = plans.map(p => ensurePlanChanges(p, disruption, affectedBookings));
          return NextResponse.json({ plans: enrichedPlans });
        }
      }
    }

    return NextResponse.json({ plans: getFallbackPlans(disruption, affectedBookings, budget) });
  } catch (error) {
    console.error('Recovery API error:', error);
    return NextResponse.json({ plans: getFallbackPlans({}, [], 50000) });
  }
}

function buildPrompt(disruption, allBookings, dependencies, affectedBookings, budget) {
  const bookingList = (allBookings || []).map(b => `- [${b.id}] ${b.title} (${b.type}): ${b.start_datetime} to ${b.end_datetime}, Cost: ${b.cost}`).join('\n');
  const affectedList = (affectedBookings || []).map(a => `- [${a.booking_id || a.booking?.id}] ${a.booking?.title}: ${a.impact_description || 'Cascading delay'}`).join('\n');

  return `A traveler's group trip has encountered a disruption.

DISRUPTION DETAILS:
- Type: ${disruption.type || 'Delay'}
- Target Booking: [${disruption.booking?.id || 'main'}] ${disruption.booking?.title} (${disruption.booking?.type})
- Delay Amount: ${disruption.delay_minutes || 120} minutes
- Description: ${disruption.description || 'Unexpected schedule disruption'}

FULL ITINERARY:
${bookingList || 'No bookings listed'}

AFFECTED DOWNSTREAM BOOKINGS:
${affectedList || 'None'}

BUDGET REMAINING: ${budget}

Generate EXACTLY 3 actionable recovery plans in JSON object format with a "plans" array:
{
  "plans": [
    {
      "plan_label": "Plan A (Cost-Saver)",
      "summary": "Clear explanation of how the plan resolves the disruption",
      "is_recommended": boolean,
      "additional_cost": number,
      "refund_amount": number,
      "time_impact_minutes": number,
      "convenience_score": number,
      "bookings_affected": number,
      "changes": [
        {
          "booking_id": "booking ID from above",
          "action": "reschedule" | "replace" | "cancel",
          "original_title": "Existing booking title",
          "new_title": "Updated booking title e.g. IndiGo (Rescheduled to 11:00 AM)",
          "original_start": "ISO original start datetime",
          "new_start": "ISO adjusted start datetime",
          "original_end": "ISO original end datetime",
          "new_end": "ISO adjusted end datetime",
          "cost_change": number,
          "change_reason": "Specific reason explaining why this segment was altered"
        }
      ]
    }
  ]
}

Plan A: Minimize additional cost (refunds or low-cost adjustments).
Plan B: Minimize schedule disruption (smart re-timings & buffer shift).
Plan C: Maximize comfort & convenience (premium fast transit / VIP alternative).

CRITICAL: Every plan MUST have the "changes" array containing concrete new_start and new_end timestamps for the disrupted and affected bookings!
Return ONLY valid JSON.`;
}

function shiftISO(isoStr, minutes) {
  if (!isoStr) return isoStr;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString().slice(0, 19);
}

function ensurePlanChanges(plan, disruption, affectedBookings) {
  if (plan.changes && plan.changes.length > 0) return plan;

  // Synthesize concrete changes if AI did not generate them
  const delay = Number(disruption?.delay_minutes) || 120;
  const targets = [];
  if (disruption?.booking) targets.push(disruption.booking);
  if (affectedBookings && affectedBookings.length > 0) {
    affectedBookings.forEach(a => {
      if (a.booking && !targets.some(t => t.id === a.booking.id)) {
        targets.push(a.booking);
      }
    });
  }

  const isCancel = (plan.plan_label || '').toLowerCase().includes('cancel') || (plan.plan_label || '').includes('A');
  const isPremium = (plan.plan_label || '').toLowerCase().includes('premium') || (plan.plan_label || '').includes('C');

  plan.changes = targets.map((b, idx) => {
    const shiftMins = isCancel ? 0 : isPremium ? Math.round(delay * 0.3) : delay;
    const action = isCancel ? (idx === 0 ? 'cancel' : 'reschedule') : isPremium ? 'replace' : 'reschedule';
    
    let newTitle = b.title;
    if (isCancel && idx === 0) newTitle = `${b.title} (Cancelled)`;
    else if (isPremium) newTitle = `${b.title} (Express Alternative)`;
    else newTitle = `${b.title} (Rescheduled +${shiftMins}m)`;

    return {
      booking_id: b.id,
      action,
      original_title: b.title,
      new_title: newTitle,
      original_start: b.start_datetime,
      new_start: isCancel && idx === 0 ? b.start_datetime : shiftISO(b.start_datetime, shiftMins),
      original_end: b.end_datetime,
      new_end: isCancel && idx === 0 ? b.end_datetime : shiftISO(b.end_datetime, shiftMins),
      cost_change: isCancel ? -(b.cost || 0) : isPremium ? 2500 : 0,
      change_reason: `${disruption.type || 'Disruption'}: Plan adjusted to preserve overall trip integrity.`
    };
  });

  return plan;
}

function getFallbackPlans(disruption, affectedBookings, budget) {
  const delay = Number(disruption?.delay_minutes) || 120;
  const rawPlans = [
    {
      plan_label: 'Plan A (Cost Saver)',
      summary: 'Cancel affected bookings to claim refunds. Minimal out-of-pocket expense while adjusting remaining itinerary.',
      is_recommended: false,
      additional_cost: 0,
      refund_amount: 3500,
      time_impact_minutes: 0,
      convenience_score: 45,
      bookings_affected: (affectedBookings?.length || 0) + 1,
      changes: []
    },
    {
      plan_label: 'Plan B (Reschedule & Retain)',
      summary: `Shift departure and downstream check-ins by ${delay} minutes. Preserves entire travel experience with minimal schedule shift.`,
      is_recommended: true,
      additional_cost: 1500,
      refund_amount: 0,
      time_impact_minutes: delay,
      convenience_score: 82,
      bookings_affected: (affectedBookings?.length || 0) + 1,
      changes: []
    },
    {
      plan_label: 'Plan C (Premium Alternative)',
      summary: 'Replace affected segments with fast express transfer and premium hotel priority check-in.',
      is_recommended: false,
      additional_cost: 4500,
      refund_amount: 0,
      time_impact_minutes: 30,
      convenience_score: 95,
      bookings_affected: (affectedBookings?.length || 0) + 1,
      changes: []
    }
  ];

  return rawPlans.map(p => ensurePlanChanges(p, disruption, affectedBookings));
}
