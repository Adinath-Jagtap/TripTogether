<div align="center">

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     P R O D U C T   R E Q U I R E M E N T S             ║
║                 D O C U M E N T                          ║
║                                                           ║
║          TripTogether — Intelligent Travel                ║
║          Resilience & Group Settlement                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

![Version](https://img.shields.io/badge/Version-1.0-6366f1?style=flat-square)
![Status](https://img.shields.io/badge/Status-Production%20Live-10b981?style=flat-square)
![Updated](https://img.shields.io/badge/Updated-September%202026-f59e0b?style=flat-square)
![Team](https://img.shields.io/badge/Team-TripTogether-3b82f6?style=flat-square)

</div>

<br/>

> *This document defines what TripTogether is built to solve, who it's built for, and the precise requirements that govern every feature decision. It is the source of truth.*

---

<br/>

## 01 &nbsp; Executive Summary

TripTogether addresses two compounding pain points that make group travel miserable:

| Pain Point | What Actually Happens | What TripTogether Does |
|---|---|---|
| **Cascading Disruptions** | One flight delay cascades into a missed transfer, invalid hotel check-in, and cancelled activities — with no coordinated recovery | Detects the cascade automatically, generates 3 AI recovery plans, and applies the winner with one tap |
| **Group Expense Chaos** | Shared costs, unequal participants, cancellation refunds, and split changes create financial confusion someone always loses | Hash-verified ledger with minimum-transaction settlement and tamper-evident audit trail |

The platform unifies these two solutions into a **single coherent system** — one that understands the connections between bookings and treats a group trip as an interconnected graph, not a list.

<br/>

---

<br/>

## 02 &nbsp; The Problem, In Detail

<br/>

### Cascading Travel Disruptions

> *A group of 6 friends. A week-long Goa trip. One 3-hour flight delay. Six bookings broken.*

```
IndiGo 6E-504 delayed 3h
  ├── Airport cab left without them          → ₹800 lost, no transfer
  ├── Hotel check-in window (9PM) missed     → Room released to waitlist
  ├── Sunset cruise (non-refundable)         → Gone
  └── Next morning's dive booking            → Dependent on hotel — now uncertain
```

**The gap:** No existing app models the connections between bookings. Every travel app shows a list of items. None of them know that the hotel depends on the transfer which depends on the flight.

**Impact:** 3–5 hours of frantic WhatsApp messages, manual phone calls, wasted money, and a ruined first evening.

<br/>

### Group Expense Settlement

> *7 days, 6 people, 40+ transactions. Who owes whom, exactly?*

The standard approach is a group WhatsApp thread with screenshots of payments, a running Google Sheet someone stops updating by Day 3, and a final argument about who paid for the last dinner.

**Impact:** Financial disputes that outlast the trip. Someone always feels they over-contributed. Trust is eroded.

<br/>

---

<br/>

## 03 &nbsp; Who We're Building For

<br/>

| Persona | Description | Primary Need |
|---------|-------------|-------------|
| 🧭 **The Organizer** | Books everything for the group, manages all logistics | Tools that handle complexity — cascade recovery, group coordination |
| 👥 **The Group Member** | Shows up, participates, splits costs | Transparency on expenses, easy voting on decisions |
| ✈️ **The Solo Traveler** | Travels alone, wants disruption protection | Fast AI recovery, traveler rights awareness |
| 🏨 **The Hotel Vendor** | Receives AI-initiated booking modification calls | Simple PWA receive interface, clear call outcome logging |

<br/>

---

<br/>

## 04 &nbsp; Functional Requirements

<br/>

### 4.1 — Itinerary Management

| ID | Requirement | Priority |
|----|------------|:--------:|
| FR-1.1 | Create trips with destination, dates, budget, currency | **P0** |
| FR-1.2 | Upload PDF booking confirmations for AI extraction | **P0** |
| FR-1.3 | Dictate itineraries via voice (Web Speech API) | **P0** |
| FR-1.4 | AI generates complete multi-day itineraries from natural language | **P0** |
| FR-1.5 | Booking nodes: flight, hotel, train, bus, transfer, activity | **P0** |
| FR-1.6 | Automatic dependency detection between sequential bookings | **P0** |
| FR-1.7 | Buffer time calculation between connected bookings | **P0** |
| FR-1.8 | Visual itinerary canvas with day grouping + dependency arrows | **P0** |
| FR-1.9 | In-place node mutations via voice commands (update price, time) | **P1** |
| FR-1.10 | Invite code generation for group member joining | **P0** |

<br/>

### 4.2 — Live Transport Tracking

| ID | Requirement | Priority |
|----|------------|:--------:|
| FR-2.1 | Real-time flight status via AeroDataBox API | **P0** |
| FR-2.2 | Fallback flight tracking via AviationStack | **P1** |
| FR-2.3 | Real-time train status via IRCTC RapidAPI | **P0** |
| FR-2.4 | Auto-check on trip load with 3-hour rate limiting | **P1** |
| FR-2.5 | Status badges: on-time / delayed / cancelled | **P0** |
| FR-2.6 | Auto-flag cascade when delay exceeds downstream buffer | **P0** |

<br/>

### 4.3 — Disruption Recovery

| ID | Requirement | Priority |
|----|------------|:--------:|
| FR-3.1 | Cascade detection via DAG BFS traversal | **P0** |
| FR-3.2 | AI generates exactly 3 recovery plans (cost / reschedule / premium) | **P0** |
| FR-3.3 | Each plan includes concrete booking changes with new ISO timestamps | **P0** |
| FR-3.4 | One-click plan application to Firestore | **P0** |
| FR-3.5 | Democratic group voting on recovery plans | **P0** |
| FR-3.6 | Real-time vote progress via Firestore onSnapshot | **P0** |
| FR-3.7 | 5-minute auto-finalization with owner override | **P1** |
| FR-3.8 | Resilience score (0–100) per itinerary | **P1** |

<br/>

### 4.4 — AI Hotel Calling

| ID | Requirement | Priority |
|----|------------|:--------:|
| FR-4.1 | Browser-native VoIP call initiation to hotels | **P0** |
| FR-4.2 | FCM data-only push notification to hotel devices | **P0** |
| FR-4.3 | Call state management: ringing → connected → ended | **P0** |
| FR-4.4 | Hotel-side PWA with answer / dismiss UI | **P0** |
| FR-4.5 | Outcome logging: approved / denied / needs_manual_call | **P0** |

<br/>

### 4.5 — Traveler Rights Engine

| ID | Requirement | Priority |
|----|------------|:--------:|
| FR-5.1 | DGCA flight delay/cancellation rule matching | **P0** |
| FR-5.2 | Indian Railways TDR refund eligibility detection | **P0** |
| FR-5.3 | Bus cancellation consumer rights matching | **P1** |
| FR-5.4 | Negotiation scripts, mistake warnings, escalation contacts | **P0** |
| FR-5.5 | TDR autopilot cron with push → SMS → call escalation | **P0** |

<br/>

### 4.6 — Expense Ledger

| ID | Requirement | Priority |
|----|------------|:--------:|
| FR-6.1 | Expense creation with 4 split modes | **P0** |
| FR-6.2 | Net balance calculation per member | **P0** |
| FR-6.3 | Minimum-transaction debt simplification | **P0** |
| FR-6.4 | SHA-256 hash-chained ledger entries | **P0** |
| FR-6.5 | Chain integrity verification endpoint | **P1** |
| FR-6.6 | Budget tracking with spend percentage indicators | **P1** |

<br/>

### 4.7 — Digital Twin Simulator

| ID | Requirement | Priority |
|----|------------|:--------:|
| FR-7.1 | Physics-based weather delay engine per transport mode | **P0** |
| FR-7.2 | What-If sliders: rainfall, wind, visibility, time offset | **P0** |
| FR-7.3 | One-click weather presets (monsoon, cyclone, fog) | **P1** |
| FR-7.4 | Interactive Leaflet map with booking node markers | **P0** |
| FR-7.5 | Nugen domain-aligned vs base model comparison | **P0** |
| FR-7.6 | Social signal feed with live RSS + crowd intelligence | **P1** |

<br/>

---

<br/>

## 05 &nbsp; Non-Functional Requirements

<br/>

| Category | Requirement |
|----------|-------------|
| ⚡ **Performance** | Trip dashboard loads in < 2s · Recovery plan generation < 5s |
| 🔒 **Security** | Firebase Auth on all routes · Firestore rules enforce owner/member access · Zero secrets in git |
| 📱 **PWA** | Installable on Android & iOS · Background push works with screen off |
| 🔄 **Resilience** | Multi-model AI fallback chain · Dual transport API coverage · Deterministic final fallback |
| 📡 **Availability** | Vercel auto-scaling · Firebase SLA |
| 🌐 **Offline** | Service worker registered · Basic UI available offline |

<br/>

---

<br/>

## 06 &nbsp; External Dependencies

<br/>

| Service | Purpose | Plan |
|---------|---------|------|
| **Firebase** | Auth · Firestore · FCM · Admin SDK | Free (Spark) |
| **Groq** | LLM inference — Llama 3.3 70B primary | Free tier |
| **Google Gemini** | LLM fallback | Free tier |
| **Nugen Intelligence** | Domain-aligned disruption model | Free tier |
| **AeroDataBox** (RapidAPI) | Flight tracking primary | Freemium |
| **IRCTC** (RapidAPI) | Train tracking | Freemium |
| **AviationStack** | Flight tracking fallback | Free tier |
| **Open-Meteo** | Weather data | Free · No API key |
| **Geoapify** | Geocoding + place data | Free tier |
| **Apify** | Google Places scraping | Free tier |
| **Vercel** | Hosting + Cron jobs | Hobby (free) |

<br/>

---

<br/>

## 07 &nbsp; Success Metrics

<br/>

| Metric | Target |
|--------|:------:|
| Itinerary creation success rate (voice + PDF) | > 90% |
| Recovery plan generation latency | < 5s |
| Cascade detection accuracy | 100% *(deterministic)* |
| Debt simplification correctness | 100% *(deterministic)* |
| Hash chain integrity | 100% tamper-evident |
| Push notification delivery (screen off, Android) | > 95% |

<br/>

---

<br/>

## 08 &nbsp; Future Roadmap

> For the full v2 vision — including Plivo/Twilio telephony, multi-language support, Jarvis AI control, and an honest audit of v1 limitations — see **[NEXT_CHAPTER.md](NEXT_CHAPTER.md)**.

<br/>

| Feature | Description | Priority |
|---------|-------------|:--------:|
| Real SMS for TDR | Wire MSG91 or Twilio for TDR escalation alerts | P1 |
| Plivo/Twilio calling | Production-grade hotel telephony replacing browser VoIP | P1 |
| Multi-currency | USD, EUR, GBP with live exchange rates | P2 |
| Multi-language | Hindi, Tamil, Telugu + i18n framework | P2 |
| Jarvis Mode | Full AI control layer with tool-calling and voice | P2 |
| Travel insurance | Partner API for instant disruption insurance quotes | P3 |
| Itinerary export | PDF export + Google Calendar sync | P3 |

<br/>

---

<br/>

<div align="center">

*Part of the TripTogether documentation suite.*
[README](../README.md) · [Architecture](ARCHITECTURE.md) · [Algorithms](ALGORITHMS.md) · [Next Chapter](NEXT_CHAPTER.md)

</div>
