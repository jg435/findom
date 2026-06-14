# FinDom — Where We Are & Where We're Going

A presentation companion: **what's built today** vs **what we build next**.

---

## TL;DR

| | **Today (POC)** | **Next (Phase 1)** |
|---|---|---|
| The "brain" (AI rules engine) | ✅ Built & working | ♻️ Reused unchanged |
| Users | Single, no login | Multi-user (Supabase Auth) |
| Cards | None — simulated charges | Real virtual cards (Stripe, sandbox) |
| Rules | One global list | Per-card rule sets |
| Blocking | Simulated / Lithic sandbox | Real-time auth: approve/decline a live swipe |
| Data isolation | None (open) | Row-Level Security per user |
| Money | None | None yet (sandbox; live needs sponsor bank) |

**The bet:** the hardest, riskiest piece — *does AI judgment on transactions actually work?* — is already proven. Everything next is integration, not invention.

---

## 1. What's built today (POC)

A working web app where you write spending rules in plain English, and an AI approves or declines transactions against them. Tested via a built-in **simulator** (no real money).

```
┌───────────────────────────────────────────────────────────┐
│  WEB APP  (Next.js · localhost:3000)                       │
│                                                            │
│   Dashboard          Rules              Transactions       │
│   ┌──────────┐      ┌──────────┐       ┌──────────┐        │
│   │ Simulate │      │ add /    │       │  history │        │
│   │ a charge │      │ toggle   │       │  + AI    │        │
│   │ + stats  │      │ rules    │       │  reasons │        │
│   └────┬─────┘      └────┬─────┘       └────┬─────┘        │
└────────┼─────────────────┼──────────────────┼─────────────┘
         │                 │                  │
         ▼                 ▼                  ▼
┌───────────────────────────────────────────────────────────┐
│  API  (Next.js routes)                                     │
│   /api/simulate   /api/rules   /api/transactions           │
│   /api/webhooks/lithic   (sandbox card events)             │
│                      │                                     │
│                      ▼                                     │
│            classifyTransaction()   ◀── the "brain"         │
│        strict judgment · monthly caps · fail-closed        │
└──────────┬───────────────────────────────┬────────────────┘
           │                               │
           ▼                               ▼
   ┌───────────────┐               ┌────────────────┐
   │  Claude       │               │  Supabase      │
   │ (via          │               │  Postgres      │
   │  OpenRouter)  │               │  rules · txns  │
   └───────────────┘               └────────────────┘
                                    single-tenant, no auth
```

### How a decision flows today

```
  "GRUBHUB*LEMONTHAICUI…"  +  $24
            │
            ▼
   POST /api/simulate
            │
            ├─ fetch enabled rules            ("block non-healthy restaurants")
            ├─ fetch this month's approved txns   (for monthly caps)
            ▼
   classifyTransaction()  →  Claude
            │
            ▼
   { decision: "DECLINE", reason: "general Thai restaurant, not health-focused" }
            │
            ├─ log to Supabase
            ▼
   shows on dashboard  ✗ DECLINED
```

**Proven so far:** natural-language rules, monthly/frequency caps ("once a month"), strict & consistent judgment, reliable JSON output, fail-closed safety, real card-statement descriptor parsing (`DD *DOORDASH TACOBEL…` → Taco Bell).

---

## 2. What we build next (Phase 1)

Same brain — now wrapped in **real accounts, real virtual cards, and real-time blocking.**

```
┌───────────────────────────────────────────────────────────┐
│  WEB APP  (Next.js)                                        │
│   Login → My Cards → Per-card Rules → Transactions         │
│                                                            │
│   💳 Amex-style card     💳 "Groceries" card               │
│   rules: no fast food    rules: $400/mo cap                │
└───────────────┬───────────────────────────────────────────┘
                │  Supabase Auth (JWT)
                ▼
┌───────────────────────────────────────────────────────────┐
│  API  (Next.js routes)                                     │
│   ┌── user-scoped client ──┐   ┌── service-role client ─┐  │
│   │ cards · rules · txns   │   │ Stripe auth webhook    │  │
│   │ (RLS: your rows only)  │   │ (looks up card→owner)  │  │
│   └───────────┬────────────┘   └───────────┬────────────┘  │
│               │       classifyTransaction()│   ◀── reused  │
└───────────────┼────────────────────────────┼──────────────┘
       ▲        │                            │
       │        ▼                            ▼
       │   ┌──────────┐              ┌────────────────┐
       │   │  Claude  │              │  Supabase +    │
       │   └──────────┘              │  Row-Level Sec │
       │                             │ users·cards·   │
       │  approve / decline (<2s)    │ rules·txns     │
       │                             └────────────────┘
┌──────┴──────────────────────────────────────────────────┐
│  Stripe Issuing (sandbox)                                │
│   virtual cards · spending controls · sponsor bank · PCI │
└──────────────────────────────────────────────────────────┘
        ▲ card network
┌───────┴────────┐
│ Merchant / POS │   ← a REAL swipe, blocked in real time
└────────────────┘
```

### How a decision flows next (real-time)

```
  Swipe at Taco Bell on your FinDom card
            │
            ▼
   Stripe Issuing  ──(cheap pre-filter: blocked MCC categories)
            │
            ▼
   POST /api/webhooks/stripe   "authorization.request"   ⏱ ~2s window
            │
            ├─ identify card → owner → that card's rules
            ├─ fetch this month's approved txns
            ▼
   classifyTransaction()  →  Claude   (<1.5s)
            │
            ▼
   DECLINE  ──► returned to Stripe ──► card is declined at the register
            │
            └─ log txn (status: declined)  → shows on your dashboard
```

---

## 3. The evolution at a glance

```
        TODAY (POC)                         NEXT (Phase 1)
   ┌────────────────────┐             ┌────────────────────────┐
   │ one user           │   ───────►  │ many users (login)     │
   │ one global ruleset │   ───────►  │ rules per card         │
   │ simulated charges  │   ───────►  │ real virtual cards     │
   │ logs a decision    │   ───────►  │ blocks a live swipe    │
   │ open database      │   ───────►  │ locked down (RLS)      │
   │ the BRAIN  ✅      │   ═══════►  │ the SAME brain, reused │
   └────────────────────┘             └────────────────────────┘
         de-risks the idea                 makes it a product
```

---

## 4. What stays out (and why)

- **"Bill my Amex Gold for the points" auto-routing** — not feasible: card networks treat it as a cash advance (no rewards), routing through us strips the category bonus, and Amex blocks intermediaries. Rewards become a **recommendation** ("use Amex Gold here — 4x dining") in a later phase, where the real card is swiped directly and keeps full points.
- **Real money** — Phase 1 runs on Stripe's **sandbox**. Live cards need sponsor-bank onboarding (months), tracked separately.

_Full detail in [`MVP_ARCHITECTURE.md`](./MVP_ARCHITECTURE.md) and [`PHASE1_DESIGN.md`](./PHASE1_DESIGN.md)._
