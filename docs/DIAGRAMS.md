# FinDom — Presentation Diagrams

These are **Mermaid** diagrams — they render as real graphics, not ASCII.

**How to show them:**
- **GitHub** renders them automatically when you view this file.
- **Export for slides:** paste any block into [mermaid.live](https://mermaid.live) → Actions → download **PNG** or **SVG**.
- **VS Code:** install the "Markdown Preview Mermaid Support" extension.

---

## 1. What's built today (POC)

```mermaid
flowchart TD
    subgraph CLIENT["🖥️  Web App — Next.js"]
        DASH["Dashboard<br/>simulate a charge + stats"]
        RUL["Rules<br/>add / toggle (plain English)"]
        TXN["Transactions<br/>history + AI reasons"]
    end

    subgraph SERVER["⚙️  API — Next.js routes"]
        SIM["/api/simulate"]
        BRAIN["🧠 classifyTransaction()<br/>strict judgment · monthly caps · fail-closed"]
    end

    CLAUDE["🤖 Claude<br/>via OpenRouter"]
    DB[("🗄️ Supabase Postgres<br/>rules · transactions<br/>single-tenant · no auth")]

    DASH --> SIM
    RUL --> SERVER
    TXN --> SERVER
    SIM --> BRAIN
    BRAIN --> CLAUDE
    SIM --> DB

    classDef brain fill:#16a34a,stroke:#14532d,color:#fff;
    classDef ext fill:#1e293b,stroke:#0f172a,color:#fff;
    class BRAIN brain;
    class CLAUDE,DB ext;
```

**One-liner for the slide:** *A working app where you write spending rules in plain English and an AI approves or declines transactions — proven today via a built-in simulator (no real money).*

---

## 2. How a decision works today

```mermaid
sequenceDiagram
    autonumber
    actor You
    participant API as /api/simulate
    participant DB as Supabase
    participant AI as 🤖 Claude

    You->>API: merchant + amount<br/>("GRUBHUB*LEMONTHAI…", $24)
    API->>DB: fetch enabled rules + this month's approved orders
    API->>AI: classify(merchant, rules, history)
    AI-->>API: DECLINE — "general Thai spot, not health-focused"
    API->>DB: log the transaction
    API-->>You: ✗ DECLINED (with reason)
```

---

## 3. What we build next (Phase 1)

```mermaid
flowchart TD
    subgraph CLIENT["🖥️  Web App — Next.js"]
        LOGIN["🔐 Login"]
        CARDS["My Cards<br/>💳 'Dining' — no fast food<br/>💳 'Groceries' — $400/mo cap"]
        PRULES["Per-card Rules"]
    end

    subgraph SERVER["⚙️  API"]
        US["User-scoped client<br/>RLS — your rows only"]
        SR["Service-role client<br/>Stripe webhook only"]
        BRAIN["🧠 classifyTransaction()<br/>REUSED unchanged"]
    end

    CLAUDE["🤖 Claude"]
    DB[("🗄️ Supabase + Row-Level Security<br/>users · cards · rules · transactions")]
    STRIPE["💳 Stripe Issuing — sandbox<br/>virtual cards · spend controls · sponsor bank"]
    POS["🏪 Merchant / POS"]

    LOGIN -->|JWT| US
    CARDS --> US
    PRULES --> US
    US --> BRAIN
    SR --> BRAIN
    BRAIN --> CLAUDE
    US --> DB
    SR --> DB
    POS -->|real swipe| STRIPE
    STRIPE -->|"auth request (~2s)"| SR
    SR -->|approve / decline| STRIPE
    US -->|issue / freeze cards| STRIPE

    classDef brain fill:#16a34a,stroke:#14532d,color:#fff;
    classDef ext fill:#1e293b,stroke:#0f172a,color:#fff;
    classDef stripe fill:#635bff,stroke:#3c34c9,color:#fff;
    class BRAIN brain;
    class CLAUDE,DB ext;
    class STRIPE stripe;
```

**One-liner for the slide:** *Same brain — now wrapped in real accounts, real virtual cards, and real-time blocking of an actual swipe.*

---

## 4. How a decision works next (real-time, blocks the swipe)

```mermaid
sequenceDiagram
    autonumber
    actor You
    participant POS as 🏪 Merchant
    participant S as 💳 Stripe Issuing
    participant W as /api/webhooks/stripe
    participant AI as 🤖 Claude
    participant DB as Supabase

    You->>POS: tap FinDom card at Taco Bell
    POS->>S: authorization request
    S->>S: pre-filter (blocked MCC categories)
    S->>W: authorization.request  ⏱ ~2s window
    W->>DB: card → owner → that card's rules + monthly history
    W->>AI: classifyTransaction(...)
    AI-->>W: DECLINE  (under 1.5s)
    W-->>S: decline
    S-->>POS: ✗ card declined at the register
    W->>DB: log transaction (status: declined)
```

---

## 5. The evolution (one-slide story)

```mermaid
flowchart LR
    subgraph NOW["TODAY — POC"]
        direction TB
        A1["one user"]
        A2["one global rule list"]
        A3["simulated charges"]
        A4["logs a decision"]
        A5["open database"]
        A6["🧠 the BRAIN ✅"]
    end

    subgraph NEXT["NEXT — Phase 1"]
        direction TB
        B1["many users · login"]
        B2["rules per card"]
        B3["real virtual cards"]
        B4["blocks a live swipe"]
        B5["locked down · RLS"]
        B6["🧠 the SAME brain, reused"]
    end

    A1 --> B1
    A2 --> B2
    A3 --> B3
    A4 --> B4
    A5 --> B5
    A6 ==> B6

    classDef now fill:#334155,stroke:#1e293b,color:#fff;
    classDef next fill:#16a34a,stroke:#14532d,color:#fff;
    class A1,A2,A3,A4,A5,A6 now;
    class B1,B2,B3,B4,B5,B6 next;
```

**The pitch:** *We've already de-risked the hard part — does AI judgment on real transactions actually work? It does. Everything next is integration, not invention.*

---

## 6. Why not "auto-bill my best rewards card"? (the honest slide)

```mermaid
flowchart TD
    IDEA["💡 Idea: virtual card auto-bills<br/>my best rewards card (Amex Gold 4x dining)"]
    IDEA --> P1{"Fund a card with<br/>a credit card?"}
    P1 -->|"❌ counts as cash advance<br/>(no rewards, fees)"| BLOCK1["blocked by card networks"]
    IDEA --> P2{"Route through us to<br/>keep the 4x bonus?"}
    P2 -->|"❌ issuer sees US, not the merchant<br/>→ category bonus lost"| BLOCK2["MCC pass-through problem"]
    IDEA --> P3{"Just do it anyway?"}
    P3 -->|"❌ Amex blocks intermediaries<br/>+ 50-state money-transmitter licenses"| BLOCK3["legal / network wall"]

    BLOCK1 --> ANS
    BLOCK2 --> ANS
    BLOCK3 --> ANS
    ANS["✅ Phase 2 instead:<br/>RECOMMEND the best card to swipe<br/>→ real card used directly → full points"]

    classDef bad fill:#7f1d1d,stroke:#450a0a,color:#fff;
    classDef good fill:#16a34a,stroke:#14532d,color:#fff;
    class BLOCK1,BLOCK2,BLOCK3 bad;
    class ANS good;
```

---

_Companion docs: [`CURRENT_VS_NEXT.md`](./CURRENT_VS_NEXT.md) · [`PHASE1_DESIGN.md`](./PHASE1_DESIGN.md) · [`MVP_ARCHITECTURE.md`](./MVP_ARCHITECTURE.md)_
