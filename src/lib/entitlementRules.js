/**
 * Entitlement Rules — India-Specific Traveler Rights Engine
 *
 * Deterministic rule matcher for DGCA (flights) and Indian Railways (trains).
 * No network calls, no LLM. Returns instant verdicts the moment a disruption
 * is triggered so the traveler knows their rights BEFORE choosing a recovery plan.
 *
 * Sources:
 *   - DGCA CAR Section 3, Series M, Part IV (passenger entitlements)
 *   - Indian Railways Refund Rules (TDR, automatic cancellation refunds)
 */

// ─── FLIGHT ENTITLEMENT RULES (DGCA) ───────────────────────────────────

const FLIGHT_RULES = [
  {
    id: 'dgca_delay_2h',
    trigger: (booking, disruption) =>
      disruption.type === 'delay' && (disruption.delay_minutes || 0) >= 120,
    title: 'Free Meals & Refreshments',
    icon: '🍽️',
    severity: 'info',
    summary: 'Airlines MUST provide free meals and refreshments for delays of 2+ hours.',
    legalRef: 'DGCA CAR Section 3, Series M, Part IV',
    entitlements: [
      'Free meals and refreshments at the airport',
      'Free phone calls / emails (2 calls)',
      'Regular delay status updates from airline staff',
    ],
    script: 'I\'d like to claim my DGCA-mandated refreshments. My flight has been delayed over 2 hours. Please provide meal vouchers as required under CAR Section 3.',
    mistakes: [
      'Buying food yourself without keeping receipts — you can\'t claim reimbursement without proof',
      'Leaving the terminal area — you may lose entitlement to boarding',
    ],
    deadline: null,
    escalation: 'If the airline refuses, photograph the departure board showing the delay, note the staff member\'s name, and file a complaint at AirSewa (airsewa.gov.in) immediately.',
    documents: ['Boarding pass', 'Photos of departure board showing delay', 'Receipts if you paid out of pocket'],
  },
  {
    id: 'dgca_delay_6h',
    trigger: (booking, disruption) =>
      disruption.type === 'delay' && (disruption.delay_minutes || 0) >= 360,
    title: 'Free Rebooking OR Full Refund',
    icon: '✈️',
    severity: 'success',
    summary: 'For 6+ hour delays, you are entitled to a FREE rebooking on the next available flight OR a FULL REFUND. You don\'t need to pay anything extra!',
    legalRef: 'DGCA CAR Section 3, Series M, Part IV',
    entitlements: [
      'Full refund of ticket price (if you choose not to travel)',
      'Free rebooking on the next available flight at NO extra cost',
      'Continued free meals, refreshments, and communication',
      'Free hotel accommodation if delay extends overnight',
    ],
    script: 'My flight has been delayed over 6 hours. Under DGCA regulations, I\'m entitled to either a full refund or free rebooking on the next available flight at no additional cost. I\'d like to [choose: get a refund / be rebooked].',
    mistakes: [
      'Accepting a voucher instead of cash refund — you are entitled to cash refund to your original payment method',
      'Paying for a new ticket — the rebooking must be FREE',
      'Not filing within 30 days — the refund window closes after that',
    ],
    deadline: 'File refund claim within 30 days of the disrupted flight date.',
    escalation: 'File complaint at AirSewa portal (airsewa.gov.in) or call 1800-11-4646. If unresolved in 30 days, approach DGCA directly at complaints@dgca.nic.in.',
    documents: ['Original ticket / booking confirmation', 'Boarding pass', 'Communication from airline about delay', 'Photos of departure board'],
  },
  {
    id: 'dgca_overnight_delay',
    trigger: (booking, disruption) => {
      if (disruption.type !== 'delay' || (disruption.delay_minutes || 0) < 360) return false;
      const depHour = new Date(booking.start_datetime).getHours();
      return depHour >= 20 || depHour <= 3;
    },
    title: 'Free Hotel + Transport',
    icon: '🏨',
    severity: 'success',
    summary: 'Your 6+ hour delay falls in the overnight window (8PM–3AM). The airline MUST provide free hotel accommodation and transport to/from the airport.',
    legalRef: 'DGCA CAR Section 3, Series M, Part IV',
    entitlements: [
      'Free hotel accommodation arranged and paid by the airline',
      'Free transport to and from the hotel',
      'All meals included',
    ],
    script: 'My overnight flight has been delayed over 6 hours. I need hotel accommodation as required by DGCA rules. Please arrange this immediately.',
    mistakes: [
      'Booking your own hotel without airline approval — always ask the airline to arrange it first',
      'If you book yourself, keep ALL receipts and get written confirmation of the delay',
    ],
    deadline: null,
    escalation: 'If airline refuses hotel, book one yourself, keep every receipt, and file at AirSewa within 7 days.',
    documents: ['Hotel receipts', 'Transport receipts', 'Airline communication'],
  },
  {
    id: 'dgca_cancellation',
    trigger: (booking, disruption) =>
      disruption.type === 'cancellation',
    title: 'Full Refund + Alternate Flight + Meals',
    icon: '💰',
    severity: 'success',
    summary: 'Cancelled flights entitle you to a FULL REFUND plus alternate arrangement at NO COST. You don\'t pay a single rupee for this.',
    legalRef: 'DGCA CAR Section 3, Series M, Part IV',
    entitlements: [
      'Full refund of ticket price to original payment method',
      'OR free rebooking on next available flight',
      'Free meals and refreshments while waiting',
      'Free hotel if overnight wait is required',
      'Compensation of up to ₹20,000 if cancelled within 24 hours of departure with less than 2 weeks notice',
    ],
    script: 'My flight has been cancelled. Under DGCA rules, I\'m entitled to either a full refund or rebooking at no extra cost, plus meals while waiting. I also want to claim compensation for the cancellation.',
    mistakes: [
      'Accepting airline credit/voucher instead of cash — insist on refund to your original payment method',
      'The airline saying "it\'s weather" — airlines still owe you meals and rebooking for weather cancellations; only compensation may be waived',
    ],
    deadline: 'Refund must be processed within 15 days (credit card) or 30 days (other payment).',
    escalation: 'AirSewa: airsewa.gov.in | Toll-free: 1800-11-4646 | Email: complaints@dgca.nic.in',
    documents: ['Booking confirmation', 'Cancellation notification from airline', 'Any communication/emails'],
  },
];

// ─── TRAIN ENTITLEMENT RULES (Indian Railways / IRCTC) ──────────────────

const TRAIN_RULES = [
  {
    id: 'ir_delay_3h',
    trigger: (booking, disruption) =>
      disruption.type === 'delay' && (disruption.delay_minutes || 0) >= 180,
    title: 'Full Refund via TDR (Before Departure!)',
    icon: '🚂',
    severity: 'critical',
    summary: 'Train delayed 3+ hours → you are entitled to a 100% FULL REFUND of your ticket. But you MUST file TDR BEFORE the train departs from origin!',
    legalRef: 'Indian Railways Refund Rules, Rule 10',
    entitlements: [
      '100% full refund of ticket fare',
      'No cancellation charges deducted',
      'Refund processed to original payment method (counter tickets: at counter)',
    ],
    script: 'I want to file a TDR for my ticket (PNR: [your PNR]). The train is delayed by more than 3 hours. I am filing this BEFORE departure as per Indian Railways refund rules.',
    mistakes: [
      '⚠️ THE #1 MISTAKE: Cancelling your ticket yourself! If you cancel, you pay cancellation charges. Let the delay trigger the TDR for a FULL refund with ZERO deductions.',
      'Waiting until the train departs — once it leaves the station (even late), the TDR window is PERMANENTLY CLOSED',
      'Not noting the actual delay time — take a screenshot of train status showing the delay',
    ],
    deadline: '⏰ CRITICAL: File TDR BEFORE the train actually departs from the originating station. After departure, full refund is no longer possible.',
    escalation: 'IRCTC helpline: 14646 | Email: care@irctc.co.in | If at station: approach Station Master with PNR',
    documents: ['PNR number', 'Screenshot of train running status showing delay', 'Ticket/booking confirmation'],
  },
  {
    id: 'ir_cancellation_by_railways',
    trigger: (booking, disruption) =>
      disruption.type === 'cancellation',
    title: '⚠️ DO NOT Cancel Yourself — Automatic Refund!',
    icon: '🚫',
    severity: 'critical',
    summary: 'When RAILWAYS cancel a train, refund is AUTOMATIC with ZERO charges. DO NOT cancel the ticket yourself or you\'ll pay cancellation fees!',
    legalRef: 'Indian Railways Refund Rules, Rule 11',
    entitlements: [
      'Automatic 100% refund — no action needed from you',
      'Zero cancellation charges',
      'Refund to original payment method within 5-7 working days',
      'For counter tickets: claim refund within 72 hours at any PRS counter',
    ],
    script: 'My train has been cancelled by Indian Railways. I understand the refund will be processed automatically. Can you confirm the refund timeline?',
    mistakes: [
      '🔴 DO NOT cancel the ticket yourself! If you cancel before Railways officially cancels, you pay cancellation charges. Wait for the automatic cancellation.',
      'Thinking you need to file a TDR — for railway-cancelled trains, the refund is automatic',
    ],
    deadline: 'Counter ticket holders: claim refund within 72 hours at any PRS counter.',
    escalation: 'If refund not received in 7 working days: IRCTC helpline 14646 or email care@irctc.co.in',
    documents: ['PNR number', 'Original ticket (for counter bookings)', 'Screenshot showing train cancelled by railways'],
  },
  {
    id: 'ir_delay_under_3h',
    trigger: (booking, disruption) =>
      disruption.type === 'delay' && (disruption.delay_minutes || 0) >= 60 && (disruption.delay_minutes || 0) < 180,
    title: 'Delay Under 3 Hours — Limited Options',
    icon: '⏳',
    severity: 'info',
    summary: 'For delays under 3 hours, Indian Railways does not offer automatic refunds. However, you still have options.',
    legalRef: 'Indian Railways Refund Rules',
    entitlements: [
      'You can still cancel with standard cancellation charges',
      'If delay extends past 3 hours before departure, TDR becomes eligible',
      'Catering services should still be available',
    ],
    script: 'Can you confirm the expected delay? If it extends beyond 3 hours, I\'ll want to file a TDR for a full refund.',
    mistakes: [
      'Prematurely cancelling — wait to see if delay extends to 3+ hours for a free TDR refund',
    ],
    deadline: 'Monitor train status — if delay crosses 3 hours, file TDR immediately.',
    escalation: 'Track live status at enquiry.indianrail.gov.in or call 139',
    documents: ['PNR number', 'Train running status screenshots'],
  },
];

// ─── BUS RULES (generic) ───────────────────────────────────────────────

const BUS_RULES = [
  {
    id: 'bus_cancellation',
    trigger: (booking, disruption) =>
      disruption.type === 'cancellation',
    title: 'Bus Cancelled — Refund Rights',
    icon: '🚌',
    severity: 'info',
    summary: 'If the bus operator cancels, you are entitled to a full refund or rebooking on the next available service.',
    legalRef: 'Consumer Protection Act, 2019',
    entitlements: [
      'Full refund of ticket fare from operator',
      'Alternative bus on the next available service',
    ],
    script: 'My bus has been cancelled by the operator. I\'d like a full refund or rebooking on the next available service.',
    mistakes: ['Accepting partial refund — you\'re entitled to a full refund for operator-side cancellations'],
    deadline: 'Contact operator within 24 hours.',
    escalation: 'File complaint on National Consumer Helpline: 1800-11-4000 or consumerhelpline.gov.in',
    documents: ['Booking confirmation', 'Cancellation communication'],
  },
];

// ─── PUBLIC API ─────────────────────────────────────────────────────────

/**
 * Match all applicable entitlement rules for a given booking + disruption.
 * Returns an array of matched rules, sorted by severity (critical first).
 *
 * @param {Object} booking     - { type: 'flight'|'train'|'bus', start_datetime, cost, pnr, ... }
 * @param {Object} disruption  - { type: 'delay'|'cancellation'|..., delay_minutes, description, ... }
 * @returns {Array<Object>}    - matched entitlement rule objects
 */
export function checkEntitlements(booking, disruption) {
  if (!booking || !disruption) return [];

  let rules = [];
  switch (booking.type) {
    case 'flight':
      rules = FLIGHT_RULES;
      break;
    case 'train':
      rules = TRAIN_RULES;
      break;
    case 'bus':
      rules = BUS_RULES;
      break;
    default:
      return [];
  }

  const matched = rules.filter(rule => {
    try {
      return rule.trigger(booking, disruption);
    } catch (_) {
      return false;
    }
  });

  // Sort: critical > success > info
  const severityOrder = { critical: 0, success: 1, info: 2 };
  matched.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3));

  return matched;
}

/**
 * Get a human-readable summary line for quick display.
 *
 * @param {Array} entitlements - result of checkEntitlements()
 * @returns {string|null}
 */
export function getEntitlementHeadline(entitlements) {
  if (!entitlements || entitlements.length === 0) return null;
  const top = entitlements[0];
  if (top.severity === 'critical') return `🚨 ${top.title}`;
  if (top.severity === 'success') return `✅ ${top.title}`;
  return `ℹ️ ${top.title}`;
}
