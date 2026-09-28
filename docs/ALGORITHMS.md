<div align="center">

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║       A L G O R I T H M   D E S I G N                   ║
║              D O C U M E N T                             ║
║                                                           ║
║        TripTogether — Core Algorithms &                  ║
║        Data Structures                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

![Algorithms](https://img.shields.io/badge/Algorithms-6%20Core%20Engines-6366f1?style=flat-square)
![Complexity](https://img.shields.io/badge/Graph-DAG%20BFS-10b981?style=flat-square)
![Crypto](https://img.shields.io/badge/Crypto-SHA--256%20Chain-f59e0b?style=flat-square)
![Rules](https://img.shields.io/badge/Rules-Deterministic-3b82f6?style=flat-square)

</div>

<br/>

> *Six algorithms. No external dependencies. Every one deterministic, tested, and purpose-built for the problem of travel disruption.*

---

<br/>

## 01 &nbsp; Cascade Impact Detector

**File:** `src/lib/algorithms/cascadeDetector.js`
**Complexity:** `O(V + E)` — V = bookings, E = dependencies
**Type:** Graph BFS with accumulated delay propagation

<br/>

### The Problem

When a flight is delayed by 120 minutes, which downstream bookings does that break? The naive answer is *"all of them."* The correct answer depends on **buffer times** — the safety margins between connected bookings. A 120-minute delay absorbed by a 150-minute buffer causes zero downstream impact. The same delay with a 60-minute buffer cascades further.

<br/>

### Algorithm

```
INPUTS:
  disruptedBookingId  — the node where disruption originated
  delayMinutes        — initial delay in minutes
  dependencies[]      — all dependency edges for this trip
  bookings[]          — all booking documents

BUILD adjacency list:
  adjList = Map<upstreamId → [{ bookingId, bufferMinutes }]>

INITIALIZE:
  queue = [(disruptedBookingId, delayMinutes)]
  visited = Set()
  affected = []

BFS:
  while queue is not empty:
    (currentId, accumulatedDelay) = dequeue()
    if currentId in visited → skip
    visited.add(currentId)

    if currentId ≠ disruptedBookingId:
      classify impact, push to affected[]

    for each child in adjList[currentId]:
      newDelay = max(0, accumulatedDelay − child.bufferMinutes)
      if newDelay > 0:
        enqueue(child.bookingId, newDelay)
      // else: buffer absorbs the delay — propagation stops on this branch

RETURN affected[]
```

<br/>

### Impact Classification

| Accumulated Delay | Label | Meaning |
|---|:---:|---|
| > 120 min | `missed` | Connection is broken — booking must be rescheduled |
| > 60 min | `at_risk` | High failure probability — intervention needed |
| ≤ 60 min | `tight` | Strained but possible |

<br/>

### Resilience Score

```javascript
score = 100
  − (disrupted_count  × 15)
  − (atRisk_count     ×  8)
  − (tight_count      ×  4)
  − (tightConnections ×  5)   // buffer < 45 min between consecutive bookings

score = clamp(score, 0, 100)
```

<br/>

### Example

```
Flight DEL→GOA  delayed 180 min
  │
  ├── Airport Cab (buffer: 90 min)
  │     remaining delay = 180 − 90 = 90 min  →  AT RISK  🟠
  │       │
  │       └── Beach Hotel check-in (buffer: 60 min)
  │             remaining delay = 90 − 60 = 30 min  →  TIGHT  🟡
  │               │
  │               └── Scuba Diving (buffer: 120 min)
  │                     remaining delay = 30 − 120 = 0  →  SAFE  ✅
  │
  └── Evening Sunset Cruise (buffer: 45 min)
        remaining delay = 180 − 45 = 135 min  →  MISSED  🔴
```

<br/>

---

<br/>

## 02 &nbsp; Debt Simplification

**File:** `src/lib/algorithms/debtSimplifier.js`
**Complexity:** `O(N log N)` — N = group members
**Type:** Greedy two-pointer matching on sorted lists

<br/>

### The Problem

Given net balances for all group members (some positive = owed money, some negative = owe money), find the **minimum number of transactions** needed to settle all debts.

<br/>

### Balance Calculation

```
For each member M:
  totalPaid  = Σ expenses where M is payer
  totalShare = Σ expense_shares assigned to M

  netBalance = totalPaid − totalShare
    > 0  →  others owe M this much
    < 0  →  M owes others this much
    = 0  →  M is settled
```

<br/>

### Settlement Algorithm

```
INPUTS: members[] with netBalance per member

SEPARATE:
  creditors = members where netBalance > 0, sorted descending
  debtors   = members where netBalance < 0, sorted ascending (most negative first)

TWO-POINTER SWEEP:
  i = 0 (largest creditor)
  j = 0 (largest debtor)

  while i < creditors.length AND j < debtors.length:
    amount = min(creditors[i].remaining, |debtors[j].remaining|)

    record transaction: debtors[j] pays creditors[i] amount

    creditors[i].remaining − = amount
    debtors[j].remaining   + = amount

    if creditors[i].remaining == 0 → i++
    if debtors[j].remaining   == 0 → j++

RETURN transactions[]
```

<br/>

### Split Modes

| Mode | Logic |
|------|-------|
| `equal` | `amount ÷ participants.length` — last person absorbs rounding remainder |
| `percentage` | `amount × (userPercentage ÷ 100)` |
| `custom` | Exact amount per user, specified individually |
| `full` | Only the payer bears the entire cost |

<br/>

### Example

```
5 members after a trip:
  Priya    +₹1,800   (is owed)
  Rohan    +₹1,200   (is owed)
  Aditya   −₹1,500   (owes)
  Sneha    −₹900     (owes)
  Vikram   −₹600     (owes)

Naive approach: 5 transactions (everyone pays Priya and Rohan separately)

Simplified (greedy):
  Aditya  → Priya    ₹1,500   (Priya settled: ₹300 still owed by others)
  Sneha   → Priya    ₹300     (Priya fully settled)
  Sneha   → Rohan    ₹600     (Sneha settled)
  Vikram  → Rohan    ₹600     (Rohan fully settled)

Result: 4 transactions instead of up to 10
```

<br/>

---

<br/>

## 03 &nbsp; Hash Chain (Immutable Ledger)

**File:** `src/lib/algorithms/hashChain.js`
**Complexity:** `O(1)` per entry · `O(N)` for chain verification
**Type:** SHA-256 cryptographic hash chain via Web Crypto API

<br/>

### The Problem

Group expense disputes are common. Any legitimate audit trail must be **tamper-evident** — if someone modifies a past expense, the modification must be detectable. The hash chain achieves this without a blockchain.

<br/>

### Hash Generation

```javascript
payload = JSON.stringify({
  prev:   previousHash || 'GENESIS',
  type:   entry.event_type,
  amount: entry.amount || 0,
  users:  entry.affected_users.sort(),    // sorted for determinism
  ts:     entry.created_at,
  desc:   entry.description
})

hash = SHA-256(UTF-8(payload))  →  64-character hex string
```

Uses `crypto.subtle.digest('SHA-256', ...)` — the **Web Crypto API**, available natively in Node.js 18+ and all modern browsers. No external dependencies.

<br/>

### Chain Verification

```
previousHash = 'GENESIS'

for each entry (sorted by sequence_number asc):
  expectedHash = generateEntryHash(entry, previousHash)

  if entry.entry_hash ≠ expectedHash:
    RETURN {
      valid: false,
      firstBrokenAt: entry.sequence_number,
      message: "Chain broken at entry N — tampering detected"
    }

  previousHash = entry.entry_hash

RETURN { valid: true, totalEntries: N }
```

<br/>

### Properties

| Property | How It's Achieved |
|----------|---|
| **Tamper-evident** | Modifying entry N invalidates entries N+1 through end |
| **Append-only** | Firestore security rules block update/delete on ledger collection |
| **Portable** | Uses Web Crypto API — runs in Node.js and browser |
| **Deterministic** | Affected users are sorted before hashing — same input always produces same hash |

<br/>

---

<br/>

## 04 &nbsp; TDR Eligibility Agent

**File:** `src/lib/algorithms/tdrAgent.js`
**Complexity:** `O(1)` per booking evaluation
**Type:** Deterministic rule evaluation — zero LLM, zero network calls

<br/>

### The Problem

Indian Railways TDR refunds are time-sensitive. The window closes the moment the train departs — even if it's running 6 hours late. Travelers need to know *instantly* if they're eligible, and *how much time they have left*.

<br/>

### Eligibility Guards

All 5 must pass simultaneously:

```
Guard 1:  booking.type === 'train'
Guard 2:  liveStatus.hasDeparted === false
Guard 3:  liveStatus.delayMinutes >= 180       (3-hour minimum)
Guard 4:  booking.start_datetime is a valid date
Guard 5:  minutesRemaining > 0                 (window not yet closed)
```

Where `minutesRemaining = (scheduledDeparture − now) in minutes`.

<br/>

### Escalation Ladder

```
minutesRemaining > 60   →  PUSH notification      ⚠️  ACT NOW
minutesRemaining 15–60  →  SMS alert              🟠  URGENT
minutesRemaining < 15   →  VoIP call              🔴  CRITICAL — LAST CHANCE
```

<br/>

### Deduplication Logic

```
Last alert for this booking < 10 minutes ago?
  AND same escalation channel as before?
    → SKIP (prevent alert spam)

Last alert > 10 min ago?
  OR escalation channel has increased (push → sms → call)?
    → FIRE new alert
```

<br/>

---

<br/>

## 05 &nbsp; Weather Digital Twin

**File:** `src/lib/digitaltwin/weatherTwin.js`
**Complexity:** `O(N)` — N = bookings in itinerary
**Type:** Physics-based simulation with mode-specific sensitivity matrices

<br/>

### The Problem

Given hypothetical weather conditions, quantify the impact on every booking in the itinerary — accounting for the fact that wind affects flights far more than trains, and rain affects outdoor activities far more than hotel stays.

<br/>

### Sensitivity Matrix

```
SENSITIVITY_MATRIX = {
  flight:   { rainThreshold: 15, rainCoeff: 1.2, windThreshold: 35, windCoeff: 1.8,
              visThreshold: 1.5, visCoeff: 25, maxHold: 240 },
  train:    { rainThreshold: 25, rainCoeff: 0.9, windThreshold: 60, windCoeff: 1.2,
              visThreshold: 0.5, visCoeff: 10, maxHold: 180 },
  activity: { rainThreshold:  8, rainCoeff: 2.0, windThreshold: 30, windCoeff: 1.5,
              visThreshold: 2.0, visCoeff: 15, maxHold: 180 },
  hotel:    { rainThreshold: 40, rainCoeff: 0.2, windThreshold: 90, windCoeff: 0.1,
              visThreshold: 0.2, visCoeff:  5, maxHold:  60 },
  // ... bus, transfer
}
```

<br/>

### Node Delay Calculation

```
params = SENSITIVITY_MATRIX[booking.type]

excess_rain = max(0, rainfall  − params.rainThreshold)
excess_wind = max(0, windSpeed − params.windThreshold)
vis_deficit = max(0, params.visThreshold − visibility)

rawDelay = (excess_rain × params.rainCoeff)
         + (excess_wind × params.windCoeff)
         + (vis_deficit × params.visCoeff)

delay = min(rawDelay, params.maxHold)   // capped at maxHold
```

<br/>

### Cascade Drag Propagation

```
For each booking node (in chronological order):
  totalDelay = rawDelay + (accumulatedCascadeDelay × 0.5)
  bufferRemaining = connectionBuffer − totalDelay

  if bufferRemaining < 0:
    status = 'critical'
    failureProbability = clamp(0.65 + |bufferRemaining| / 100, 0, 0.98)
    accumulatedCascadeDelay = |bufferRemaining|   // passes overflow forward

  elif bufferRemaining < 20 OR totalDelay > 30:
    status = 'warning'
    failureProbability = clamp(0.25 + totalDelay / 150, 0, 0.60)
    accumulatedCascadeDelay = 5

  else:
    status = 'normal'
    accumulatedCascadeDelay = 0                   // chain breaks here
```

<br/>

### Resilience Score

```
rawScore = 100 − (criticalCount × 22) − (warningCount × 9)
resilienceScore = clamp(rawScore, 15, 100)
```

<br/>

---

<br/>

## 06 &nbsp; Entitlement Rules Engine

**File:** `src/lib/entitlementRules.js`
**Complexity:** `O(R)` — R = rules per transport type
**Type:** Trigger-function pattern matching — deterministic, no LLM

<br/>

### Design Pattern

Each rule is a self-contained object with a `trigger` predicate:

```javascript
{
  id:       'dgca_delay_6h',
  trigger:  (booking, disruption) =>
              disruption.type === 'delay' &&
              disruption.delay_minutes >= 360,
  title:    'Free Rebooking OR Full Refund',
  severity: 'success',
  entitlements: [...],
  script:   '...',    // word-for-word what to say to airline staff
  mistakes: [...],    // common errors that forfeit your rights
  deadline: '...',    // filing window
  escalation: '...',  // complaint authority + contacts
  documents:  [...],  // what to collect as evidence
}
```

<br/>

### Full Rule Coverage

| Transport | Rule ID | Trigger Condition | Severity |
|-----------|---------|---|:---:|
| **Flight** | `dgca_delay_2h` | delay ≥ 120 min | ℹ️ info |
| **Flight** | `dgca_delay_6h` | delay ≥ 360 min | ✅ success |
| **Flight** | `dgca_overnight_delay` | delay ≥ 360 min + departure 8PM–3AM | ✅ success |
| **Flight** | `dgca_cancellation` | type = cancellation | ✅ success |
| **Train** | `ir_delay_3h` | delay ≥ 180 min, before departure | 🚨 critical |
| **Train** | `ir_cancellation_by_railways` | type = cancellation | 🚨 critical |
| **Train** | `ir_delay_under_3h` | delay 60–180 min | ℹ️ info |
| **Bus** | `bus_cancellation` | type = cancellation | ℹ️ info |

Rules are sorted `critical → success → info` before returning, so the most urgent entitlement always appears first.

<br/>

---

<br/>

<div align="center">

*Part of the TripTogether documentation suite.*
[README](../README.md) · [PRD](PRD.md) · [Architecture](ARCHITECTURE.md) · [Next Chapter](NEXT_CHAPTER.md)

</div>
