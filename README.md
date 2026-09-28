<p align="center">
  <img src="public/favicon.png" alt="TripTogether" width="88" />
</p>

<h1 align="center">TripTogether</h1>

<p align="center">
  <em>When one booking breaks, everything breaks.</em><br/>
  <strong>We built the platform that fixes the entire chain — automatically.</strong>
</p>

<p align="center">
  <a href="https://triptoghether.syntaxsyndicate.co.in/">🌐 Live Demo</a>&nbsp;&nbsp;•&nbsp;&nbsp;
  <a href="docs/PRD.md">📋 PRD</a>&nbsp;&nbsp;•&nbsp;&nbsp;
  <a href="docs/ARCHITECTURE.md">🏗️ Architecture</a>&nbsp;&nbsp;•&nbsp;&nbsp;
  <a href="docs/ALGORITHMS.md">⚙️ Algorithms</a>&nbsp;&nbsp;•&nbsp;&nbsp;
  <a href="docs/NEXT_CHAPTER.md">🔭 Next Chapter</a>
</p>

<br/>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Firebase-Firestore%20%2B%20FCM-F5820D?style=for-the-badge&logo=firebase&logoColor=white" alt="Firebase" />
  <img src="https://img.shields.io/badge/Groq-Llama%203.3%2070B-8b5cf6?style=for-the-badge" alt="Groq" />
  <img src="https://img.shields.io/badge/Vercel-Deployed-black?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/PWA-Installable-3b82f6?style=for-the-badge" alt="PWA" />
  <img src="https://img.shields.io/badge/License-Open%20Source-10b981?style=for-the-badge" alt="Open Source" />
  <img src="https://img.shields.io/badge/v2-NEXT__CHAPTER%20%E2%86%92-f59e0b?style=for-the-badge" alt="Next Chapter" />
</p>

<br/>

---

<br/>

## 💡 The Insight

Picture this: a group of friends books a **flight → airport transfer → hotel → activities** chain for a week-long trip. The flight gets delayed by 3 hours.

Now what?

- ❌ The pre-booked airport transfer is **invalid** — the driver left 2 hours ago
- ❌ The hotel check-in window is **missed** — late arrivals get waitlisted
- ❌ The morning temple tour is **gone** — non-refundable, non-transferable
- ❌ Nobody knows who already paid for what, who's owed a refund, or how to split the replacement costs

**One delay. Four broken bookings. Hours of panic. Zero tools to help.**

> TripTogether doesn't just track your trip — it **understands the connections between every booking** and **automatically recovers the entire chain** when something breaks.

<br/>

---

<br/>

## 🧬 How It Actually Works

Most travel apps treat bookings as **independent items in a list**. TripTogether treats them as **nodes in a connected graph**.

```
Flight (DEL→GOA)  ──→  Airport Cab  ──→  Beach Resort  ──→  Scuba Diving
       │                                       │
       │            buffer: 90 min             │         buffer: 45 min
       │                                       │
       └── Train (GOA→MUM) ◄──────────────────┘
```

Every booking has **upstream dependencies** (what it relies on) and **downstream dependents** (what relies on it). The connections carry **buffer times** — the safety margin between two bookings.

When a disruption hits one node, our **Cascade Impact Detector** runs a topological BFS traversal across the entire graph, propagating delays through buffers. If the delay exceeds a buffer, the downstream booking is flagged as **at risk** or **missed** — and recovery kicks in automatically.

> This isn't a feature list duct-taped together. It's a **single coherent system** where every piece feeds into the next.

<br/>

---

<br/>

## ✨ Features — In Depth

<br/>

### 🎙️ AI Itinerary Builder — Voice & PDF

> *"Plan me a 5-day trip to Manali with trains from Mumbai, a river rafting stop in Kullu, camping in Kasol, and the Golden Temple in Amritsar on the way back."*

That one sentence becomes a **complete, connected itinerary** — 12 booking nodes, dependency chains, buffer calculations, and cost estimates — in under 4 seconds.

**Voice:** The Web Speech API captures speech in real-time. The transcript goes to Groq's Llama 3.3 70B with a travel-semantic prompt that understands that a flight *into* a city implies a transfer *to* the hotel, that activities happen *during* stays, and that return journeys must be scheduled *after* the last activity. You can update the itinerary mid-conversation: *"change the hotel budget to ₹4,000"* mutates the existing node in-place rather than duplicating it.

**PDF:** Upload any booking confirmation. The system extracts text via `pdf-parse`, detects scanned-image PDFs by analyzing embedded metadata (iLovePDF signatures, image pixel dimensions), and sends digital text to the LLM for structured extraction — pulling out **flight numbers** (6E-2341, AI-505), **PNR codes**, **hotel phone numbers**, **cancellation policies**, and **vendor contact names** automatically.

**The Canvas:** Bookings render as color-coded cards organized by day (✈️ amber flights, 🏨 green hotels, 🚂 brown trains, 🧭 blue activities), with dependency arrows, buffer indicators, and a live cost total. Delete any card — the chain repairs itself.

<br/>

### ✈️🚂 Live Transport Tracking

Every flight and train is **auto-tracked** — not by refreshing a status page, but when you open your trip.

**Flights** run through a dual-provider chain:
1. **AeroDataBox** (RapidAPI) — departure delay, arrival delay, scheduled vs actual times, airline, airport codes
2. **AviationStack** — kicks in if AeroDataBox returns no data

**Trains** use the **IRCTC RapidAPI** — delay minutes, cancellation status, train name, current station.

**Rate Limiting:** Each booking stores `last_checked_at`. A **3-hour cooldown** prevents redundant API calls. Status badges (🟢 On Time · 🟡 Delayed +45min · 🔴 Cancelled) animate directly onto booking cards. When a delay exceeds a downstream buffer, the cascade is flagged automatically — no human needs to notice.

<br/>

### 🛡️ Cascading Disruption Recovery

**Step 1 — Cascade Detection**

`cascadeDetector.js` runs BFS from the disrupted booking through the dependency DAG. At each edge it subtracts buffer time from the accumulated delay:

```
Flight delayed 180 min
  → Transfer    (buffer 90 min)  → remaining 90 min → AT RISK 🟠
    → Hotel     (buffer 60 min)  → remaining 30 min → TIGHT   🟡
      → Activity (buffer 120 min) → delay absorbed  → SAFE    ✅
```

**Step 2 — AI Recovery Plans**

Groq generates exactly **3 actionable plans** from the full itinerary context:

| | Plan A — Cost Saver | Plan B — Reschedule *(recommended)* | Plan C — Premium |
|--|---|---|---|
| **Strategy** | Cancel affected bookings, claim refunds | Shift downstream bookings by delay, keep everything | Fast express alternatives |
| **Example** | Cancel the cab, keep the hotel | Push check-in by 90 min, shift morning activity to afternoon | Book express transfer, request priority check-in |
| **Output** | `cancel_and_refund` actions with refund estimates | `auto_reschedule` with new ISO timestamps | `auto_reschedule` with premium cost delta |

Every change has concrete `new_start`, `new_end`, `cost_change`, and `change_reason`. Nothing vague.

**Step 3 — Apply**

Select a plan → all bookings update in Firestore instantly → canvas reflects new schedule in real-time.

<br/>

### 🗳️ Democratic Group Recovery Voting

When a disruption hits a group trip, the recovery decision isn't one person's call. TripTogether opens a **real-time voting session**:

- All members see all 3 plans with cost / time / convenience breakdowns
- Each member votes once — progress bars update live via Firestore `onSnapshot`
- **5-minute auto-finalize** if not all members respond in time
- Trip owner can override and finalize early
- Winning plan applied automatically, all bookings updated

No more "one person decides and everyone else complains later."

<br/>

### 📞 AI-Initiated Hotel Calling

Some recovery actions need a hotel negotiation — late check-in, schedule renegotiation, cancellation confirmation. TripTogether's AI agent handles the call.

**How it works** (built without Twilio, using browser APIs):

```
Recovery triggers "call_vendor" action
  → Call document created in Firestore
  → FCM data-only push sent to hotel's registered device tokens
    (wakes service worker even with screen off)
  → Hotel-side PWA /call/receive shows incoming call UI
  → Hotel answers → AI presents change request via Web Speech synthesis
  → Hotel responds → outcome logged: approved / denied / needs_manual_call
```

If `needs_manual_call`, a **tap-to-dial** button opens the phone dialer with the hotel's number pre-filled.

> **Note:** This was built under resource constraints — no Twilio/Plivo budget. [NEXT_CHAPTER](docs/NEXT_CHAPTER.md) covers the Plivo/Twilio upgrade.

<br/>

### 📋 India-Specific Traveler Rights Engine

> Most Indian travelers don't know their rights. After a 6-hour delay they accept a meal voucher — not knowing they're legally entitled to a **full refund or free rebooking at zero cost**.

A **deterministic rule engine** — no LLM, no network call, instant — matches your disruption to legal entitlements:

**DGCA Flight Rules**
| Delay | Entitlement |
|-------|-------------|
| ≥ 2 hours | Free meals, refreshments, 2 phone calls |
| ≥ 6 hours | Full refund **OR** free rebooking on next available flight |
| ≥ 6 hours + overnight departure (8PM–3AM) | Free hotel + transport to/from airport |
| Cancellation | Full refund + alternate flight + up to ₹20,000 compensation |

**Indian Railways TDR Rules**
| Condition | Entitlement |
|-----------|-------------|
| Delay ≥ 3 hours (before departure) | 100% refund via TDR — zero cancellation charges |
| Railway cancels train | Automatic full refund — **do NOT cancel yourself** |

Every matched rule includes: legal reference · exact entitlements · word-for-word negotiation script · common mistakes to avoid · required documents · escalation contacts · filing deadlines.

<br/>

### 🚂 TDR Autopilot Agent

The TDR window is brutally narrow — file before the train departs, or it's gone forever. TripTogether's cron agent watches it so you don't have to.

**Escalation Ladder:**
```
> 60 min remaining  →  Push notification     ⚠️ ACT NOW
  15–60 min         →  SMS alert             🟠 URGENT
  < 15 min          →  Urgent VoIP call      🔴 CRITICAL
```

**Dedup guard** prevents re-alerting within 10 minutes unless urgency escalates. Every alert is written to the **hash-chained ledger** for a tamper-evident audit trail.

<br/>

### 🌦️ Digital Twin & What-If Simulator

> *"What happens to my Manali itinerary if a cyclone brings 50mm/h rain and 80km/h winds?"*

A **physics-based simulation engine** answers this in real-time.

Each transport mode has a sensitivity matrix — flights are wind-sensitive (coefficient 1.8), activities are rain-sensitive (2.0), hotels are nearly immune (0.2). The engine calculates delay drag per node, propagates cascade drag downstream (critical nodes pass 50% of overflow forward), and outputs:

- **Per-booking status**: normal / warning / critical with failure probabilities
- **Resilience Score**: 0–100, recalculated on every slider change
- **Proactive advice**: "Pre-emptively trigger Plan B: switch transfer to high-frequency subway"

**What-If Sliders:** rainfall (mm/h) · wind speed (km/h) · visibility (km) · time offset  
**Presets:** Monsoon · Dense Fog · Cyclone Alert · Clear Skies  
**Map:** Leaflet map with geo-positioned booking markers, route polylines, and weather overlay tiles

<br/>

### 🧠 Nugen Domain-Aligned AI

Side-by-side comparison of a generic base model vs. Nugen's domain-aligned disruption model:

| | Base Model | Nugen `travel-disruption-cascade-v1` |
|--|--|--|
| **Risk rating** | "Moderate" | "CRITICAL CASCADE" |
| **Analysis** | "Bring an umbrella and check your airline website" | "Severe 80 km/h crosswinds exceed aviation tolerances. Arrival delayed +65 min, exceeding 60 min buffer. Connection broken." |
| **Buffer math** | Not supported | "Topological buffer deficit: downstream nodes lack recovery window" |
| **Confidence** | `null` | `95.4` |

The aligned model understands DAG buffer calculus. The base model doesn't know what a buffer is.

<br/>

### 💰 Smart Expense Ledger

- **Flexible splits** — Equal, percentage, custom amount, or payer-only
- **Per-expense participants** — Not everyone joins every meal
- **Minimum-transaction settlement** — Greedy algorithm matches largest creditor ↔ debtor pairs, minimizing total transfers across the group
- **Hash-chained audit** — Every entry SHA-256-chained to the previous one. Tamper with any past record and the chain breaks — detectable to the exact sequence number

<br/>

### 📡 Social Signal Feed

- **Live RSS** — Google News filtered by destination + weather/transit keywords
- **Crowd wire** — Signals corroborated against live telemetry: *"Flight delays at IGI — Corroborated by 80 km/h wind live data"*
- **Vendor enrichment** — Geoapify (geocoding) → Apify (Google Places) → Groq LLM (directory fallback)

<br/>

---

<br/>

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       CLIENT (Browser)                        │
│   Next.js 14  ·  React 18  ·  CSS Modules  ·  Framer Motion │
│   Web Speech API  ·  Leaflet Maps  ·  Recharts               │
├──────────────────────────────────────────────────────────────┤
│                    SERVICE WORKER (PWA)                        │
│   FCM Background Push  ·  Data-Only Messages  ·  Installable │
├──────────────────────────────────────────────────────────────┤
│               NEXT.JS API ROUTES  (15 endpoints)             │
│   /api/ai/      itinerary-chat · parse-pdf · recovery        │
│                 risk · call-initiate · nugen-predict          │
│   /api/transport/   flight-status · train-status             │
│   /api/agent/       tdr-monitor (Vercel Cron)                │
│   /api/             social-signals · ledger/hash · push      │
│                     places/enrich · trip/reset               │
├──────────────────────────────────────────────────────────────┤
│                     CORE ALGORITHMS                           │
│   Cascade Detector (DAG BFS)  ·  Debt Simplifier (Greedy)   │
│   Hash Chain (SHA-256)  ·  TDR Agent (Deterministic)         │
│   Weather Twin (Physics)  ·  Entitlement Rules Engine        │
├──────────────────────────────────────────────────────────────┤
│                    EXTERNAL SERVICES                          │
│   Firebase · Groq · Gemini · Nugen · Open-Meteo             │
│   AeroDataBox · IRCTC · AviationStack · Geoapify · Apify    │
└──────────────────────────────────────────────────────────────┘
```

### AI Fallback Chain

The app never fails due to a provider outage:

```
Groq Llama 3.3 70B  →  Groq Llama 3.1 8B  →  Groq Mixtral 8x7B
  →  Google Gemini 1.5 Flash  →  Deterministic fallback  (always returns)
```

<br/>

---

<br/>

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14 (App Router) |
| **Frontend** | React 18, CSS Modules, Framer Motion |
| **Database** | Firebase Firestore |
| **Auth** | Firebase Authentication |
| **Push Notifications** | Firebase Cloud Messaging (FCM) |
| **AI — Primary** | Groq (Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B) |
| **AI — Fallback** | Google Gemini 1.5 Flash |
| **AI — Domain** | Nugen Intelligence (`travel-disruption-cascade-v1`) |
| **Flight Tracking** | AeroDataBox (RapidAPI) + AviationStack |
| **Train Tracking** | IRCTC (RapidAPI) |
| **Weather** | Open-Meteo (free, no API key required) |
| **Maps** | Leaflet + OpenStreetMap |
| **Charts** | Recharts |
| **PDF Parsing** | pdf-parse + Tesseract.js |
| **Icons** | Lucide React |
| **Hosting** | Vercel |

<br/>

---

<br/>

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Firebase project with Firestore, Auth, and Cloud Messaging enabled
- API keys for: Groq, Gemini, RapidAPI, Geoapify, Apify, Nugen

### Setup

```bash
# Clone & install
git clone https://github.com/Adinath-Jagtap/TripTogether.git
cd TripTogether
npm install

# Configure environment
cp .env.vercel.example .env.local
# Fill in your API keys

# Start dev server (auto-generates Firebase service worker from env vars)
npm run dev
```

<details>
<summary><strong>📋 Full .env.local template</strong></summary>

```env
# ── Firebase Client ──────────────────────────────
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Firebase Admin (Server-Side) ─────────────────
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# ── AI Services ──────────────────────────────────
GROQ_API_KEY=
GEMINI_API_KEY=
NUGEN_API_KEY=

# ── Transport APIs ───────────────────────────────
AVIATIONSTACK_API_KEY=
RAPIDAPI_KEY=

# ── Place Enrichment ─────────────────────────────
APIFY_API_TOKEN=
GEOAPIFY_API_KEY=
```

</details>

<br/>

---

<br/>

## 📁 Project Structure

```
TripTogether/
├── src/
│   ├── app/
│   │   ├── api/                     # 15 server-side API route handlers
│   │   │   ├── ai/                  # itinerary-chat, parse-pdf, recovery,
│   │   │   │                        # risk, call-initiate, call-respond, nugen-predict
│   │   │   ├── transport/           # flight-status, train-status
│   │   │   ├── agent/               # tdr-monitor (Vercel Cron job)
│   │   │   ├── digitaltwin/         # social-signals
│   │   │   ├── ledger/              # hash (SHA-256 generation + verification)
│   │   │   ├── notifications/       # push (FCM data-only sender)
│   │   │   └── places/              # enrich (Geoapify → Apify → Groq)
│   │   ├── trip/[id]/               # Trip detail pages (bookings, disruptions, ledger, twin)
│   │   ├── call/receive/            # Hotel-side incoming call UI
│   │   └── dashboard/               # User dashboard
│   ├── components/
│   │   ├── digitaltwin/             # WeatherMap, WhatIfSimulator,
│   │   │                            # NugenComparison, SocialSignalFeed
│   │   ├── itinerary/               # ItineraryCanvas, EntitlementChecker,
│   │   │   └── onboarding/          # PDFUploader, VoiceAssistant
│   │   └── voting/                  # RecoveryVoteCard
│   └── lib/
│       ├── algorithms/              # cascadeDetector, debtSimplifier,
│       │                            # hashChain, tdrAgent
│       ├── digitaltwin/             # weatherTwin (physics engine)
│       ├── ai/                      # nugen.js (Nugen Intelligence client)
│       ├── firebase/                # config + Firestore helpers
│       ├── weather/                 # openMeteo.js (city geocoding + forecast)
│       └── entitlementRules.js      # DGCA + Indian Railways rights engine
├── docs/
│   ├── PRD.md                       # Product Requirements Document
│   ├── ARCHITECTURE.md              # System design & key decisions
│   ├── ALGORITHMS.md                # Algorithm pseudocode & complexity
│   └── NEXT_CHAPTER.md              # v2 roadmap with honest v1 audit
├── scripts/
│   └── generate-sw.js               # Build-time Firebase SW generator
└── vercel.json                      # Cron job configuration
```

<br/>

---

<br/>

## 📊 API Reference

| Endpoint | Method | What It Does |
|----------|--------|-------------|
| `/api/ai/itinerary-chat` | POST | Voice/text → structured itinerary with DAG |
| `/api/ai/parse-pdf` | POST | PDF → booking extraction (flight/PNR/hotel) |
| `/api/ai/recovery` | POST | Disruption → 3 concrete recovery plans |
| `/api/ai/risk` | POST | Itinerary → resilience score + per-booking risk |
| `/api/ai/call-initiate` | POST | Browser VoIP call to hotel with FCM push |
| `/api/ai/call-respond` | POST | Hotel-side call response handler |
| `/api/ai/nugen-predict` | POST | Domain-aligned vs base model comparison |
| `/api/transport/flight-status` | POST | Live flight (AeroDataBox → AviationStack) |
| `/api/transport/train-status` | POST | Live train status (IRCTC RapidAPI) |
| `/api/agent/tdr-monitor` | GET | Cron: TDR eligibility scan + escalation |
| `/api/digitaltwin/social-signals` | POST | News RSS + crowd signal feed |
| `/api/ledger/hash` | POST | SHA-256 generation + chain verification |
| `/api/notifications/push` | POST | FCM data-only push to device tokens |
| `/api/places/enrich` | POST | Vendor enrichment pipeline |

<br/>

---

<br/>

<p align="center">
  <strong>Developed by the TripTogether team</strong><br/>
  <a href="docs/NEXT_CHAPTER.md">See what we're building next →</a>
</p>