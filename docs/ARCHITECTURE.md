<div align="center">

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     T E C H N I C A L   A R C H I T E C T U R E         ║
║                 D O C U M E N T                          ║
║                                                           ║
║          TripTogether — System Design &                  ║
║          Engineering Decisions                           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

![Type](https://img.shields.io/badge/Type-Architecture-6366f1?style=flat-square)
![Stack](https://img.shields.io/badge/Stack-Next.js%2014%20%2B%20Firebase-F5820D?style=flat-square)
![Pattern](https://img.shields.io/badge/Pattern-DAG%20%2B%20Hash%20Chain-10b981?style=flat-square)
![Deploy](https://img.shields.io/badge/Deploy-Vercel%20Edge-black?style=flat-square)

</div>

<br/>

> *Every architectural decision in TripTogether exists to answer one question: how do we make a group trip recoverable when something breaks?*

---

<br/>

## 01 &nbsp; System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                          │
│                                                                   │
│   Next.js 14 App Router  ·  React 18  ·  CSS Modules            │
│   Framer Motion  ·  Web Speech API  ·  Leaflet  ·  Recharts     │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                    SERVICE WORKER  (PWA)                          │
│                                                                   │
│   Firebase Cloud Messaging (background)                          │
│   Data-Only Push Messages  ·  Add-to-Home-Screen                │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│              NEXT.JS API ROUTES  (server-side, 15 endpoints)     │
│                                                                   │
│   /api/ai/          itinerary-chat · parse-pdf · recovery        │
│                     risk · call-initiate · call-respond          │
│                     nugen-predict                                 │
│   /api/transport/   flight-status · train-status                 │
│   /api/agent/       tdr-monitor  (Vercel Cron, daily)           │
│   /api/             social-signals · ledger/hash                 │
│                     notifications/push · places/enrich           │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│              CORE ALGORITHM LIBRARY  (pure JS, no I/O)           │
│                                                                   │
│   cascadeDetector.js   DAG BFS traversal                        │
│   debtSimplifier.js    Greedy creditor/debtor matching          │
│   hashChain.js         SHA-256 chain (Web Crypto API)            │
│   tdrAgent.js          Deterministic TDR eligibility             │
│   weatherTwin.js       Physics-based delay simulation            │
│   entitlementRules.js  DGCA + Railways rule engine              │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                       EXTERNAL SERVICES                           │
│                                                                   │
│   Firebase (Firestore · Auth · FCM · Admin SDK)                 │
│   Groq  ·  Google Gemini  ·  Nugen Intelligence                 │
│   AeroDataBox  ·  AviationStack  ·  IRCTC (RapidAPI)           │
│   Open-Meteo  ·  Geoapify  ·  Apify                            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

<br/>

---

<br/>

## 02 &nbsp; Key Architectural Decisions

<br/>

### 2.1 — Booking Dependency DAG

> *The most important architectural choice in the entire system.*

Bookings are modeled as **nodes in a Directed Acyclic Graph**, not items in a list. Edges are stored as explicit documents in `trips/{id}/booking_dependencies/{depId}`:

```javascript
{
  upstream_booking_id:   "flight-abc",
  downstream_booking_id: "hotel-xyz",
  buffer_minutes:        90,
  dependency_type:       "sequential"
}
```

**Why DAG and not just a sorted list?**

Real-world trips have branching dependencies. A single connecting flight can feed into a hotel check-in, an airport transfer, *and* a pre-booked activity simultaneously. A linear list can't represent this. The DAG captures it naturally and enables topological traversal during cascade detection.

**Cascade Detection — BFS with Delay Propagation:**

```
Input: disrupted booking, delay_minutes
  ↓
Build adjacency list from dependency edges
  ↓
BFS queue: [(disruptedBookingId, delayMinutes)]
  ↓
For each (bookingId, accDelay) in queue:
  newDelay = max(0, accDelay - child.bufferMinutes)
  if newDelay > 0 → add to affected, enqueue child with newDelay
  else            → buffer absorbs it, stop on this branch
```

| Accumulated Delay | Impact Type | Meaning |
|---|---|---|
| > 120 min | `missed` | Connection broken, must reschedule |
| > 60 min | `at_risk` | High failure probability |
| ≤ 60 min | `tight` | Strained but possible |

<br/>

### 2.2 — SHA-256 Hash-Chained Ledger

> *Tamper-evident financial records without a blockchain.*

Every ledger entry hashes into the previous one:

```
Entry N:
  payload = JSON.stringify({
    prev:  Entry(N-1).hash,   // 'GENESIS' for first entry
    type:  event_type,
    amount: amount,
    users: sorted(affected_users),
    ts:    created_at,
    desc:  description
  })
  hash = SHA-256(payload) → 64-char hex string
```

**Why hash chains instead of a simple audit log?**

Group expense disputes are common. A tamper-evident chain means modifying *any* past entry invalidates *all* subsequent hashes — detectable to the exact `sequence_number`. This builds mathematical trust between group members without needing a blockchain or external notary.

**Enforcement:** Firestore security rules mark ledger entries as **append-only** — no update or delete operations permitted at the database level.

<br/>

### 2.3 — Multi-Model AI Fallback Chain

```
Primary:     Groq — Llama 3.3 70B Versatile
               ↓ (on failure or rate limit)
Secondary:   Groq — Llama 3.1 8B Instant
               ↓
Tertiary:    Groq — Mixtral 8x7B 32768
               ↓
Quaternary:  Google Gemini 1.5 Flash
               ↓
Final:       Deterministic hardcoded response  ← always works
```

**Why five levels?** AI API reliability is unpredictable in production — rate limits, model deprecations, regional outages, cold starts. The deterministic fallback ensures the recovery feature *never* fails to return a usable response to the user, even if every AI provider is simultaneously down.

<br/>

### 2.4 — Data-Only FCM Messages

The push notification system deliberately sends **data-only** FCM messages — no `notification` field in the payload.

**Why this matters:**

| Message Type | Android Behavior |
|---|---|
| With `notification` field | OS handles it natively — service worker may be bypassed, especially when screen is off |
| Data-only (no `notification`) | **Always** wakes the service worker, even in Doze mode, even with screen off |

Data-only gives full control: custom vibration patterns, action buttons (Answer / Dismiss), lock-screen appearance, and sound — all from the service worker's `showNotification()` call.

**Priority flags used:**
- `android.priority: 'high'` — wakes device from Doze mode
- `android.ttl: '30s'` — stale call alerts are dropped, not delivered late
- `webpush.Urgency: 'high'` — browser delivers immediately

<br/>

### 2.5 — Build-Time Service Worker Generation

The Firebase service worker (`public/firebase-messaging-sw.js`) cannot use `process.env` — it's a static JS file, not a Next.js page. Hardcoding Firebase keys would expose them in git.

**Solution:**

```
npm run predev / npm run prebuild
  ↓
node scripts/generate-sw.js
  ↓
Reads env vars from .env.local (local) or Vercel dashboard (production)
  ↓
Writes public/firebase-messaging-sw.js with interpolated values
  ↓
File is listed in .gitignore — never committed
```

The generator parses `.env.local` manually with a regex (no `dotenv` dependency needed), making it lightweight and dependency-free.

<br/>

### 2.6 — Weather Digital Twin Physics

Each transport mode has a calibrated **sensitivity matrix**:

| Mode | Rain Threshold | Rain Coeff | Wind Threshold | Wind Coeff | Vis Threshold | Max Hold |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Flight** | 15 mm/h | 1.2× | 35 km/h | 1.8× | 1.5 km | 240 min |
| **Train** | 25 mm/h | 0.9× | 60 km/h | 1.2× | 0.5 km | 180 min |
| **Bus** | 12 mm/h | 1.4× | 50 km/h | 0.8× | 1.2 km | 210 min |
| **Transfer** | 10 mm/h | 1.5× | 45 km/h | 0.7× | 1.0 km | 150 min |
| **Activity** | 8 mm/h | 2.0× | 30 km/h | 1.5× | 2.0 km | 180 min |
| **Hotel** | 40 mm/h | 0.2× | 90 km/h | 0.1× | 0.2 km | 60 min |

**Delay formula:**
```
excess_rain = max(0, rainfall  − rainThreshold)
excess_wind = max(0, windSpeed − windThreshold)
vis_deficit = max(0, visThreshold − visibility)

delay = (excess_rain × rainCoeff)
      + (excess_wind × windCoeff)
      + (vis_deficit × visCoeff)

delay = min(delay, maxHold)
```

**Cascade drag:** Each critical node passes **50%** of its buffer overflow to the next downstream node's delay calculation, modeling the real-world compounding effect of consecutive transit delays.

<br/>

---

<br/>

## 03 &nbsp; Firestore Security Model

<br/>

| Collection | Read | Create | Update | Delete |
|-----------|:----:|:------:|:------:|:------:|
| `users/{userId}` | Owner only | Owner only | Owner only | — |
| `trips/{tripId}` | Owner + Members | Owner only | Owner + Members | Owner only |
| `trips/{id}/bookings/*` | Trip members | Trip members | Trip members | Trip members |
| `trips/{id}/expenses/*` | Trip members | Trip members | Trip members | Trip members |
| `trips/{id}/ledgerEntries/*` | Trip members | Trip members | ❌ Immutable | ❌ Immutable |
| `calls/{callId}` | Authenticated | Authenticated | Authenticated | — |
| `hotels/{phone}` | Authenticated | Authenticated | Authenticated | — |

> **Critical invariant:** Ledger entries are **permanently append-only**. Once written, they cannot be updated or deleted at the database level — enforcing mathematical immutability beyond application logic.

<br/>

---

<br/>

## 04 &nbsp; Key Request Flows

<br/>

### Disruption Recovery — End to End

```
User triggers disruption on booking B
  │
  └─→ POST /api/ai/recovery
        │
        ├── cascadeDetector.detectCascade(B, deps, bookings, delayMin)
        │     → BFS traversal → affected[] with accumulated delays
        │
        ├── Groq LLM generates 3 recovery plans
        │     → Each plan: changes[] with new timestamps + cost deltas
        │
        └── Response: { plans: [A, B, C] }
              │
              └─→ Client renders RecoveryVoteCard
                    │
                    ├── Members vote via Firestore onSnapshot (real-time)
                    ├── 5-min countdown auto-finalizes
                    └── Winner → updateDoc() on each affected booking
```

<br/>

### TDR Autopilot — Cron Flow

```
Vercel Cron fires GET /api/agent/tdr-monitor
  │
  └─→ Firebase Admin: collectionGroup('bookings')
        .where('type', '==', 'train')
        .where('status', 'not-in', ['departed', 'completed', 'cancelled'])
        │
        For each booking departing within 24h:
          │
          ├── fetchLiveTrainStatus(pnr, trainNumber)
          ├── evaluateTDREligibility(booking, liveStatus)
          │
          └── If eligible:
                ├── Dedup check (last alert < 10 min? same channel?)
                ├── getTDREscalationChannel(minutesRemaining)
                │     > 60 min → push
                │     15-60    → sms
                │     < 15     → call
                ├── Fire alert on chosen channel
                └── Log to hash-chained ledger (generateEntryHash)
```

<br/>

---

<br/>

## 05 &nbsp; Deployment

<br/>

| Component | Infrastructure |
|-----------|:---:|
| **Application** | Vercel (Hobby Plan) |
| **Database** | Firebase Firestore |
| **Authentication** | Firebase Auth |
| **Push Notifications** | Firebase Cloud Messaging |
| **Cron Jobs** | Vercel Cron (`vercel.json`) |
| **CDN / Edge** | Vercel Edge Network |
| **Domain** | Custom via Vercel |

### Build Pipeline

```bash
npm run prebuild
  → node scripts/generate-sw.js    # generates SW from env vars

npm run build
  → next build                     # compiles Next.js app

# Deployed automatically on git push to main
```

<br/>

---

<br/>

## 06 &nbsp; API Fallback Chains

```
Flight status:    AeroDataBox → AviationStack → Simulated on_time
Train status:     IRCTC RapidAPI              → Simulated on_time
AI inference:     Groq 70B → Groq 8B → Mixtral → Gemini → Deterministic
Place enrichment: Geoapify → Apify → Groq LLM directory
Weather:          Open-Meteo                  → Static defaults
```

> Every path ends in a safe, deterministic response. The app never crashes on a provider failure.

<br/>

---

<br/>

<div align="center">

*Part of the TripTogether documentation suite.*
[README](../README.md) · [PRD](PRD.md) · [Algorithms](ALGORITHMS.md) · [Next Chapter](NEXT_CHAPTER.md)

</div>
