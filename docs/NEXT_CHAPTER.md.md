<div align="center">

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║         T R I P T O G E T H E R   H O R I Z O N        ║
║                                                          ║
║            The Next Chapter of Intelligent Travel        ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

![Status](https://img.shields.io/badge/Status-Planning%20Phase-6366f1?style=for-the-badge)
![Version](https://img.shields.io/badge/Target-v2.0-f59e0b?style=for-the-badge)
![Type](https://img.shields.io/badge/Type-Internal%20Roadmap-10b981?style=for-the-badge)

</div>

<br/>

> _"The first version proved the concept. The second version makes it indispensable."_

This document is the honest, unfiltered roadmap for what TripTogether becomes next — not a polished pitch deck, but a real engineering and product blueprint. It includes where we genuinely fell short in v1, what the community deserves in v2, and the architectural upgrades that make it production-grade.

<br/>

---

<br/>

## 📍 Where We Are — An Honest v1 Retrospective

Before talking about the future, we owe ourselves an honest look at the gaps in what we built.

<br/>

### 🐛 Real Bugs & Limitations Found in v1

> These are not hypothetical — they were identified directly from the codebase.

<br/>

**① TDR Autopilot Uses Fake Train Data**

The `tdr-monitor` cron job's `fetchLiveTrainStatus()` function is explicitly documented as a **pseudo-random mock**. It uses a seed derived from the PNR to generate a fake delay that looks realistic (~30% chance of a 185-305 minute delay). This means TDR alerts in production are firing based on _random numbers_, not real train delays.

```javascript
// What it currently does (tdr-monitor/route.js):
const pseudoRandom = ((seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
// ↑ This is not a train API. This is a random number generator.
```

**Impact:** In a real deployment, travelers could receive TDR alerts for trains that are running perfectly on time — causing confusion and eroding trust.

**Fix in v2:** Wire to real Indian Railways live tracking (RailwayAPI.in or NTrack) before the cron goes live.

<br/>

**② Social Signal "What-If" Mode Has a ReferenceError**

In `social-signals/route.js`, the `whatif` mode references `cleanDest` on lines 48 and 61, but `cleanDest` is defined inside the `else` block on line 74 — _after_ the `whatif` branch. This throws a `ReferenceError: cleanDest is not defined` whenever `sourceMode === 'whatif'`.

**Impact:** The What-If social signal corroboration feature is silently broken in production.

<br/>

**③ No Conflict Resolution on Concurrent Edits**

When two group members simultaneously modify the itinerary (e.g., one adds an expense while another updates a booking), Firestore applies a **last-write-wins** strategy. There is no optimistic locking, versioning, or merge strategy. In a 6-person trip where everyone is active simultaneously, data loss is possible.

<br/>

**④ Tesseract.js (OCR) Is Installed but Never Used**

`tesseract.js` appears in `package.json` dependencies and adds ~15MB to the bundle. The PDF parser uses `pdf-parse` for digital text extraction — but when a scanned image PDF is uploaded (no embedded text), the system returns a 422 error instead of attempting OCR. The OCR capability was never wired up.

**Impact:** A large portion of real-world booking PDFs are scanned images (IRCTC tickets, hotel printouts, tour operator vouchers). These all fail silently.

<br/>

**⑤ Resilience Score Is Naive Linear Penalty**

```javascript
score -= disrupted.length * 15; // All disruptions weighted equally
score -= atRisk.length * 8;
```

A disrupted **return flight** (which affects 0 other bookings) gets the same `-15` penalty as a disrupted **connecting flight** (which cascades through 8 downstream bookings). The score doesn't account for topological importance — how many bookings depend on a node.

<br/>

**⑥ Invite Code Has No Rate Limiting**

The 6-character alphanumeric invite code offers ~2.2 billion combinations — which seems secure. But there is no rate limiting on the join endpoint. An attacker can enumerate codes algorithmically with no friction. For a privacy-sensitive travel app with financial data, this is a real attack surface.

<br/>

**⑦ In-App VoIP Is Not Production-Grade**

The browser VoIP system using Web Speech API (synthesis + recognition) was built because **we didn't have access to Twilio or Plivo credits during development**. It works in controlled demos but fails in the real world:

- Web Speech API is unreliable on mobile Safari and Firefox
- Requires both parties to be on the same PWA simultaneously
- No fallback if the hotel's browser tab is closed
- No call recording for dispute resolution
- No IVR or voicemail
- No real telephony — not a real phone call

> This was a **resource constraint**, not a design choice. v2 fixes this properly.

<br/>

---

<br/>

## 🔭 The v2 Vision — What We're Building Next

<br/>

### 1. Redesigned User Flow

The v1 flow was built for functionality. The v2 flow is built for **delight**.

<br/>

**v1 Flow (Functional but Friction-Heavy)**

```
Register → Create Trip → Add Bookings (manual) → Deal With Disruptions
```

**v2 Flow (Conversational & Guided)**

```
Register
  └─→ Onboarding Interview (3 questions: travel style, group size, primary concern)
        └─→ Personalized Dashboard (pre-configured for your travel style)
              └─→ "Tell me about your next trip" (AI voice prompt)
                    └─→ Live canvas builds as you speak
                          └─→ Smart suggestions appear inline
                                └─→ One tap to confirm & share with group
```

**Key UX Changes:**

| v1                                        | v2                                                              |
| ----------------------------------------- | --------------------------------------------------------------- |
| Empty state with "Create Trip" button     | Conversational AI prompt on first load                          |
| Manual booking form with 12 fields        | "Speak or paste a booking confirmation"                         |
| Disruption detected after manual trigger  | Proactive alerts before you even notice                         |
| Recovery plans shown after disruption     | Pre-trip risk warnings with mitigation suggestions              |
| Expense: select split mode, enter amounts | "We split dinner equally between Adinath, Rohan, and Priya"     |
| Static member list                        | Real-time presence indicators (who's viewing the itinerary now) |

<br/>

**New Screens in v2:**

- **Trip Health Dashboard** — A single-glance view showing resilience score, open disruptions, unsettled balances, and upcoming bookings requiring attention
- **Group Activity Feed** — Chronological stream of everything happening in the trip (member joined, expense added, booking rescheduled, vote cast)
- **Traveler Rights Quick Card** — Surfaced proactively when checking in at the airport, showing relevant DGCA entitlements based on current flight status
- **Settlement Ceremony Screen** — A satisfying end-of-trip settlement UI that shows each transaction as a card with a "Mark as Paid" button and confetti on full settlement

<br/>

---

<br/>

### 2. Deeply Personalized Experience

v1 treats all travelers the same. v2 learns who you are.

<br/>

**Travel Style Profiles**

During onboarding, a 3-question interview determines your profile:

```
"When a flight gets delayed, I usually..."
  → Check flight boards and wait        → Profile: PATIENT PLANNER
  → Immediately rebook the fastest alt  → Profile: EFFICIENCY SEEKER
  → Call the hotel to warn them         → Profile: RELATIONSHIP BUILDER
  → Ask the group what they want        → Profile: GROUP CONSENSUS
```

Profiles affect:

- Which recovery plan is pre-selected (Plan A / B / C)
- Notification verbosity (silent updates vs. full explanations)
- Itinerary density preferences (packed schedules vs. buffer-heavy)
- Default expense split mode

<br/>

**Contextual Awareness**

| Signal                     | v2 Behavior                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Departure in 3 hours       | Switch to "Pre-Departure Mode": surface check-in reminders, terminal info, weather at destination |
| Flight just landed         | Send welcome notification with hotel address, local weather, and next booking details             |
| Trip ended yesterday       | Trigger "Settlement Mode": remind group to pay outstanding balances                               |
| Same destination last year | "You visited Goa in December 2024 — want to start from that itinerary?"                           |

<br/>

**Preference Memory**

- Preferred seat class (Economy / Business)
- Preferred hotel chain or property type
- Dietary restrictions (surfaced when AI suggests restaurants or activities)
- Always-add travel insurance flag
- Home city for outbound transport suggestions

<br/>

---

<br/>

### 3. Production-Grade Hotel Calling — Plivo & Twilio

> _"The in-app browser calling was built under resource constraints. v2 uses real telephony."_

<br/>

**Why the Current System Falls Short**

The v1 system uses Web Speech API synthesis and Firestore signaling — it's a creative workaround, not real telephony. The hotel must have the TripTogether PWA installed and open. Real hotels don't do this.

<br/>

**v2 Architecture: Plivo-First, Twilio Fallback**

```
Recovery Plan requires "call_vendor" action
  │
  └─→ POST /api/calls/initiate
        │
        ├─→ Plivo REST API (Primary)
        │     • Real outbound phone call to hotel number
        │     • AI-generated voice script via Plivo TTS
        │     • DTMF detection for IVR navigation ("Press 1 for reservations")
        │     • Call recording for dispute resolution
        │     • Webhook on call completion → outcome logged
        │
        └─→ Twilio (Fallback if Plivo fails)
              • Same capabilities via Twilio Voice SDK
              • TwiML for dynamic script generation
```

<br/>

**Call Flow**

```
1. AI generates personalized call script based on booking context
   "Hello, I'm calling on behalf of [Guest Name] with booking reference [REF].
    Their flight has been delayed by 90 minutes. We'd like to request
    a late check-in at 11:30 PM instead of 9:30 PM. Is that possible?"

2. Plivo places real phone call to hotel's number
3. TTS reads the script with natural pacing
4. Hotel staff responds verbally
5. Speech-to-text captures response
6. AI classifies outcome: approved / denied / needs_manual_call / voicemail
7. Outcome logged to Firestore + hash-chained ledger
8. Traveler notified with result + next steps
```

<br/>

**Fallback Chain**

```
Plivo → Twilio → MSG91 (India SMS) → In-App Manual Dial Prompt
```

<br/>

---

<br/>

### 4. Production-Grade Data APIs

v1 relies on free-tier APIs with significant limitations. v2 upgrades the data layer.

<br/>

**Flight Tracking**

| v1                                | v2                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| AeroDataBox (RapidAPI, free tier) | **FlightAware AeroAPI** — airline-grade data, 10-year history, gate info, actual wheels-off times |
| AviationStack (fallback)          | **OAG Flight Status** — IATA-certified, used by airlines themselves                               |
| 3-hour rate limit                 | Real-time WebSocket stream — push updates, not polling                                            |
| IATA codes only                   | Full airport data: terminal, gate, baggage carousel, ground stop alerts                           |

<br/>

**Train Tracking (India)**

| v1                                      | v2                                                              |
| --------------------------------------- | --------------------------------------------------------------- |
| IRCTC RapidAPI (unofficial, unreliable) | **RailwayAPI.in** (official partner API) + **NTrack**           |
| Delay minutes only                      | Station-by-station position, platform number, coach composition |
| TDR monitor uses mock data              | Real delay detection wired to TDR eligibility evaluator         |

<br/>

**Weather**

| v1                                       | v2                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| Open-Meteo (free, no key, good accuracy) | Open-Meteo (keep — it's genuinely excellent) + **Tomorrow.io** for hyperlocal airport weather |
| City-level resolution                    | **Airport-specific** microclimate data (runway wind shear, ceiling visibility for approach)   |

<br/>

**Places & Vendor Enrichment**

| v1                          | v2                                                     |
| --------------------------- | ------------------------------------------------------ |
| Geoapify (free tier)        | **Google Places API (New)** — authoritative, real-time |
| Apify scraping (fragile)    | **Foursquare Places API** — structured, stable         |
| Groq LLM directory fallback | Maintained as tertiary fallback                        |

<br/>

**Full API Fallback Chain (v2)**

```
Flight:   FlightAware → OAG → AeroDataBox → AviationStack → Simulated
Train:    RailwayAPI.in → NTrack → IRCTC RapidAPI → Simulated
Weather:  Tomorrow.io (airport) → Open-Meteo (city) → Static forecast
Places:   Google Places → Foursquare → Geoapify → Groq LLM
Calling:  Plivo → Twilio → MSG91 SMS → Manual prompt
```

<br/>

---

<br/>

### 5. Multi-Language Support

India alone has 22 scheduled languages. A travel app built only for English speakers leaves the majority behind.

<br/>

**Implementation: `next-intl`**

```
/[locale]/
  /dashboard
  /trip/[id]
  /trip/create

Supported locales (Phase 1):
  en    English (default)
  hi    हिन्दी (Hindi)
  mr    मराठी (Marathi)
  ta    தமிழ் (Tamil)
  te    తెలుగు (Telugu)
  kn    ಕನ್ನಡ (Kannada)
  gu    ગુજરાતી (Gujarati)

Phase 2 (International):
  ja    日本語 (Japanese)
  ar    العربية (Arabic, RTL)
  fr    Français
  de    Deutsch
```

<br/>

**What Gets Translated**

- All UI strings via `next-intl` message files
- AI itinerary generation responses (prompt in user's language)
- Traveler rights entitlement cards (DGCA rules in Hindi and regional languages)
- Push notification content
- TDR alert messages
- Recovery plan summaries

<br/>

**Locale-Aware Features**

| Feature             | Locale Behavior                                                  |
| ------------------- | ---------------------------------------------------------------- |
| Currency            | INR for India, JPY for Japan, EUR for Europe                     |
| Date format         | DD/MM/YYYY (India) vs MM/DD/YYYY (US) vs YYYY年MM月DD日 (Japan)  |
| Phone number format | +91 (India), +81 (Japan), auto-detected                          |
| Right-to-Left       | Full RTL layout for Arabic and Urdu                              |
| Entitlement rules   | Jurisdiction-aware (DGCA for India, ECAC for Europe, DOT for US) |

<br/>

---

<br/>

### 6. Accessibility & Voice Control for All Travelers

> _Travel should be accessible to everyone. The disruption of a flight doesn't care about your disability._

<br/>

**WCAG 2.1 AA Compliance (Baseline)**

- Full keyboard navigation across all pages
- Screen reader optimization (ARIA labels, live regions for dynamic content)
- 4.5:1 minimum contrast ratio throughout
- Focus visible indicators on all interactive elements
- No animations without `prefers-reduced-motion` media query respect
- Alt text on all meaningful images
- Error messages that are descriptive and actionable

<br/>

**Voice Navigation Mode**

A dedicated accessibility mode activated by `Settings → Accessibility → Voice Navigation ON`:

```
"Open my Manali trip"        → navigates to trip detail
"Show me the disruptions"    → scrolls to disruption section
"Apply Plan B"               → triggers recovery plan apply
"How much do I owe Rohan?"   → speaks balance summary
"Add expense: dinner, ₹2400, split equally" → creates expense
"What are my flight rights?" → opens entitlement card for current booking
```

The full voice control layer uses Web Speech API for recognition + synthesis, with fallback to text input on unsupported browsers.

<br/>

**Disability-Specific Adaptations**

| Need                   | Feature                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **Visual impairment**  | Full screen reader support, high-contrast mode, font scaling                                           |
| **Motor impairment**   | Keyboard-first navigation, single-switch access mode, dwell-click support                              |
| **Cognitive**          | Simplified mode: fewer options per screen, confirmation dialogs for all actions, plain language toggle |
| **Hearing impairment** | All audio notifications have visual + haptic equivalents                                               |
| **Dyslexia**           | OpenDyslexic font option, wider line spacing, reduced animation                                        |

<br/>

---

<br/>

### 7. Jarvis Mode — AI That Controls the Entire App

v1's AI builds itineraries. v2's AI **runs the app**.

<br/>

**What Jarvis Mode Is**

A persistent AI assistant that has **full read and write access** to your trip. Not a chatbot sidebar — a genuine co-pilot that understands context, remembers history, and can take real actions.

```
"Jarvis" (wake word or floating button)
```

<br/>

**What It Can Do**

```
Queries (Read):
  "What's the tightest connection in my itinerary?"
  "Who has the highest outstanding balance?"
  "If our Delhi flight is delayed 2 hours, what breaks?"
  "What's the weather forecast for Kasol on Day 4?"
  "What are my rights if the hotel is overbooked?"

Actions (Write):
  "Add Priya to the Goa trip"
  "Move the river rafting to the afternoon on Day 3"
  "Mark the hotel expense as paid by Rohan"
  "Cancel the airport cab and find alternatives"
  "Apply Plan B to the current disruption"
  "Settle up — who pays whom?"

Proactive:
  "Your Vande Bharat departs in 4 hours. Traffic to Dadar is heavy.
   Leave now to arrive with 45 minutes buffer."
  "The monsoon intensified near Kasol. Your camping on Day 5 has
   a 78% failure probability. Want me to find a guesthouse instead?"
  "Rohan just added a ₹3,200 dinner expense. Your share is ₹800.
   You now owe him ₹2,150 total."
```

<br/>

**Architecture**

```
User speaks / types
  └─→ Intent Classification (Groq Llama 3.3 70B)
        ├─→ Query intent → Firestore read → AI summary → spoken response
        ├─→ Action intent → Confirmation prompt → Firestore write → confirmation
        └─→ Proactive trigger → Scheduled evaluation → push if threshold met
```

**Tool Calling:** The AI has access to a defined set of tools:

- `get_itinerary(tripId)` — Read full trip state
- `update_booking(bookingId, changes)` — Modify booking
- `add_expense(tripId, expense)` — Create expense
- `apply_recovery_plan(tripId, disruptionId, planIndex)` — Apply a plan
- `simulate_disruption(bookingId, delayMinutes)` — What-if analysis
- `check_entitlements(bookingType, disruptionType)` — Rights lookup
- `get_balances(tripId)` — Settlement state

<br/>

**Voice Personality**

Jarvis mode uses a configurable voice personality:

- **Professional** — Concise, formal, no filler words
- **Friendly** — Conversational, uses names, adds context
- **Brief** — Single-sentence responses only
- **Detailed** — Full explanations with reasoning

<br/>

---

<br/>

## ⚠️ Additional v2 Flags — Our Own Honest Audit

Beyond the bugs listed above, here are the architectural and product decisions that need rethinking in v2:

<br/>

**🔴 High Priority**

| Issue                       | Problem                                                     | v2 Fix                                                      |
| --------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| No real-time collaboration  | Concurrent edits cause silent data loss                     | Firestore transactions + optimistic UI locking              |
| No offline capability       | App is 100% network-dependent, even for already-loaded data | Service worker caching + offline-first Firestore listeners  |
| No itinerary export         | Can't share a read-only link or export to PDF/Calendar      | Read-only shareable URL + PDF export + Google Calendar sync |
| OCR is installed but dead   | Tesseract.js in package.json, never called                  | Wire OCR for scanned PDF fallback                           |
| Invite code brute-forceable | No rate limit on join endpoint                              | Rate limiting + exponential backoff on failed attempts      |

<br/>

**🟡 Medium Priority**

| Issue                              | Problem                                           | v2 Fix                                                     |
| ---------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| No refund tracking                 | Cancelled bookings have no refund status tracker  | Refund ledger entry type with expected date + confirmation |
| Resilience score is topology-blind | All disruptions penalize equally                  | Weight penalty by downstream node count                    |
| No duplicate booking detection     | Same flight can be added twice silently           | Dedup by (type, start_datetime, vendor) at save time       |
| Budget alerts are static           | No proactive "80% budget used" alerts during trip | Real-time budget watchers with configurable thresholds     |
| No pagination                      | Large trips can hit Firestore read limits         | Cursor-based pagination on all list queries                |

<br/>

**🟢 Nice to Have**

| Issue                                  | Suggestion                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| Weather twin ignores time of day       | 10PM rain matters less for activities than 10AM rain                                    |
| Social signals are partially synthetic | Crowd wire "whatif" signals are simulated — should be disclosed as simulation in the UI |
| No travel insurance integration        | Post-disruption: surface insurance claim filing as a recovery option                    |
| No packing list                        | Weather-aware packing suggestions per destination and season                            |
| Hotel review integration               | Surface TripAdvisor/Google ratings on booking cards for context                         |

<br/>

---

<br/>

## 🗓️ Proposed Build Sequence

```
Phase 1 — Foundation Repairs
  ├── Wire real train tracking to TDR agent
  ├── Fix social signals ReferenceError
  ├── Add rate limiting to invite endpoint
  ├── Wire Tesseract OCR for scanned PDFs
  └── Offline caching for loaded trip data

Phase 2 — Telephony Upgrade
  ├── Plivo integration for hotel calling
  ├── Twilio fallback
  ├── Call recording + outcome webhook
  └── SMS alerts for TDR escalation

Phase 3 — Personalization & Language
  ├── Travel style onboarding interview
  ├── next-intl setup with Hindi + top 5 Indian languages
  ├── Locale-aware date/currency/phone formatting
  └── Jurisdiction-aware entitlement rules

Phase 4 — Accessibility
  ├── WCAG 2.1 AA audit and fixes
  ├── Voice navigation mode
  ├── High-contrast + reduced-motion modes
  └── Screen reader optimization pass

Phase 5 — Jarvis
  ├── Tool-calling AI architecture
  ├── Wake word detection
  ├── Intent classification + action router
  ├── Proactive alert system
  └── Voice personality configuration

Phase 6 — Data Upgrade
  ├── FlightAware AeroAPI integration
  ├── RailwayAPI.in for real train data
  ├── Google Places API (New)
  └── Tomorrow.io airport microclimate
```

<br/>

---

<br/>

<div align="center">

_This document is a living spec — it will be updated as priorities shift and resources become available._

**Built by the TripTogether team.**

</div>
