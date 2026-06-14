# FinDom — MVP Architecture

## 0. The one constraint that reshapes everything

Your vision has **two goals that pull in opposite technical directions**:

1. **Control** — virtual cards that *block* purchases against rules (the part you've built the brain for).
2. **Rewards routing** — the virtual card silently bills whichever real card earns the best points (Amex Gold for dining, Venture X for the rest).

After researching the card rails, **goal #2 as literally described is not buildable** — not because it's hard, but because of how card networks work:

- **You can't fund an issued virtual card with a consumer credit card.** Loading value onto an issued card from an Amex/Visa credit line is classified as **quasi-cash (MCC 6050/6051)** → the issuer treats it as a **cash advance**: cash-advance fee, no grace period, higher APR, and **zero rewards**. This is a network rule, not a platform limitation.
- **Routing through an intermediary destroys the category bonus.** When any card sits in front of your real cards, the underlying issuer sees the **intermediary as the merchant-of-record** (e.g. Curve shows up as `CRV*`). Curve passes the original MCC through *only on the live swipe*; its signature "switch which card paid this afterward" feature **drops the MCC and loses the bonus**. The valuable version of routing is the version that breaks rewards.
- **Amex actively blocks intermediaries.** Amex terminated Curve's agreement ~36 hours after re-enabling it, with no US regulatory recourse (the US has no PSD2 mandate). Amex issues exactly the category cards you want to exploit.
- **Being in the money flow triggers licensing.** A true routing product needs **state-by-state Money Transmitter Licenses (~50)**, FinCEN MSB registration, and a BIN sponsor — ~$500K–$2M and 6–18 months *per state cluster*.

**Conclusion:** Split the two goals. Control is an *issuing* product. Rewards is a *recommendation* product (tell the user / autofill which real card to use, so the real card is swiped directly and keeps full MCC + bonus). Trying to merge them into one routed card is what sank Curve in the US.

---

## 1. Recommended MVP scope

Build the **control product** for real, keep the **rewards** piece as a recommendation layer.

| Capability | MVP? | How |
|---|---|---|
| Multiple virtual cards, each with its own rule set | ✅ Core | Stripe Issuing or Lithic, one card per "profile" |
| AI rules engine: approve/decline per transaction in real time | ✅ Core | **already built** — wire it to the issuer's real-time auth webhook |
| Natural-language + monthly/frequency rules | ✅ Core | **already built** (`classifyTransaction`) |
| Dashboard, transaction log, rule management | ✅ Core | **already built** |
| Funding | ✅ Core | Prefunded balance topped up via **ACH/bank** (not credit cards) |
| "Use Amex Gold for this — 4x dining" recommendation | ⚠️ Phase 2 | Recommendation engine, real card used directly |
| Auto-route spend to best rewards card | ❌ Not feasible | Breaks rewards + needs 50-state MTL |

---

## 2. System architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Client (Next.js web app + future React Native)              │
│  • Card management  • Rule editor  • Tx log  • Rewards hints  │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS (authed)
┌───────────────▼─────────────────────────────────────────────┐
│  FinDom API (Next.js API routes / dedicated service)         │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Rules service  │  │ Card service │  │ Rewards engine   │  │
│  │ classifyTxn()  │  │ issue/freeze │  │ best-card pick   │  │
│  └───────┬────────┘  └──────┬───────┘  └────────┬─────────┘  │
│          │                  │                   │            │
│  ┌───────▼──────────────────▼───────────────────▼─────────┐  │
│  │ Postgres (Supabase): users, cards, rules, transactions │  │
│  └────────────────────────────────────────────────────────┘  │
└───────▲───────────────────────────────────┬─────────────────┘
        │ real-time auth webhook (<2s)       │ issue/manage cards
        │  (approve / decline)               │
┌───────┴────────────────────────────────────▼─────────────────┐
│  Issuer Platform (Stripe Issuing OR Lithic)                   │
│  • BIN + sponsor bank  • card tokens  • settlement  • PCI     │
└───────────────────────────────────────────────────────────────┘
        ▲
        │ card network (Visa/MC)
┌───────┴────────┐
│ Merchant / POS │
└────────────────┘
```

**Why this shape:** the issuer platform brings the sponsor bank, BIN, scheme connectivity, and PCI-scoped PAN vaulting, so you never touch raw card numbers and never need your own banking license for the pilot. Your differentiator lives entirely in the **real-time auth webhook** → which calls the rules engine you already have.

---

## 3. Real-time authorization flow (the critical path)

```
Merchant swipe
   → Visa/MC network
      → Issuer platform (Stripe/Lithic)
         → platform's own spend controls (MCC/merchant/velocity) run first
         → POST /api/webhooks/auth  ───────────────►  FinDom
                                                       1. verify signature
                                                       2. load card + enabled rules
                                                       3. classifyTransaction()  ← existing
                                                       4. (fire-and-forget) log txn
         ◄── { approved: true|false } within budget ──┘
      ← approve/decline returned to network
```

Hard requirements:
- **Latency budget:** Stripe = **2s**, Lithic ASA = up to **6s** (3s recommended). The classifier must answer in **<1.5s**; on timeout the platform applies your default. **Fail closed (decline)** for a control product.
- **Pre-filter with platform spend controls** (MCC blocklists, per-merchant, velocity) so the webhook only fires for cases needing *custom* AI judgment — saves latency and LLM cost.
- **Idempotency:** dedupe on the auth token (you already do this with `lithic_token unique`).
- **Two-phase reality:** auth → clearing. Log the auth decision immediately; reconcile on the clearing/settlement webhook.

This is exactly the `/api/webhooks/lithic` pattern already in the repo — it generalizes directly.

---

## 4. Data model (extends what exists)

```
users         (id, email, kyc_status, created_at)
cards         (id, user_id, issuer_card_token, last4, profile_name,
               state[active|frozen], created_at)
rules         (id, card_id, description, enabled, created_at)   ← add card_id FK
transactions  (id, card_id, auth_token, merchant_descriptor, mcc,
               amount_cents, decision, ai_reason, status[auth|cleared|declined],
               created_at)
funding       (id, user_id, source[ach], balance_cents, ...)
reward_cards  (id, user_id, network, issuer, nickname, category_multipliers jsonb)
                                                   ← for the recommendation engine
```

The current single-tenant schema becomes multi-tenant by adding `user_id` / `card_id` FKs and rules scoped **per card** (each virtual card = its own rule set, which is your core UX).

---

## 5. Rewards: recommendation, not routing

Since you can't route money, deliver rewards value the way Kudos/MaxRewards do:

1. User registers their real cards (nickname + network + known category multipliers — no PAN needed for recommendations).
2. On an **approved** transaction (or at online checkout), the rewards engine computes the best card: `max(multiplier × spend)` for the merchant's category.
3. Surface it as a **recommendation** ("Use Amex Gold — 4x dining") and, online, optionally autofill that card.
4. The **real card is swiped directly** → original MCC reaches the issuer → full category bonus preserved.

Monetization mirrors the proven model: **card-affiliate/referral revenue** + optional **subscription** (MaxRewards Gold ≈ $84/yr, CardPointers ≈ $60/yr). No money movement → **no MTL** for this layer.

---

## 6. Tech stack & deployment

| Layer | Choice | Notes |
|---|---|---|
| Web app + API | **Next.js 14** on **Vercel** | already the codebase; webhook route = serverless fn |
| DB | **Supabase Postgres** | already wired; add RLS + auth |
| Auth | **Supabase Auth** or Clerk | real multi-user, replaces anon key |
| Issuer | **Stripe Issuing** (fastest) or **Lithic** (most programmable) | sandbox now → sponsor-bank pilot in 2–6 mo |
| LLM | Claude via OpenRouter | already wired; cache + fail-closed |
| Rules latency | Vercel fn + warm Supabase pool | pre-filter with issuer spend controls |
| Mobile (later) | React Native / Expo | share the API |

**Deployment hardening before real money:**
- Move secrets to Vercel env (done) + rotate; never commit `.env`.
- Webhook **signature verification** (already implemented for Lithic).
- **Fail-closed** auth default; alerting on timeout rate.
- Per-user data isolation via Supabase **RLS** (today's anon-key model is POC-only).
- Structured audit log of every auth decision (you log transactions already).

---

## 7. Compliance path (pilot, not full licensing)

- **Sponsor bank + BIN** come from Stripe/Lithic — you don't get your own.
- **KYC/KYB** via the platform; **PCI** scope minimized to ~SAQ-A by never touching PANs.
- **No MTL needed** for the pilot *as long as the platform/sponsor bank holds the funds* and you don't transmit money in your own name.
- Realistic: **sandbox in days**, **live limited pilot in 2–6 months** (gated by sponsor-bank compliance review, not licensing).

---

## 8. Phased roadmap

**Phase 0 — Brain (DONE).** AI rules engine, NL + monthly rules, simulator, dashboard. This de-risks the hardest *product* question (does the classification work?) with zero financial/regulatory exposure.

**Phase 1 — Real cards, real control (the MVP).**
- Multi-user auth + RLS; rules scoped per card.
- Integrate **Stripe Issuing** (sandbox → pilot): issue virtual cards, wire the real-time auth webhook to `classifyTransaction()`.
- ACH funding of a prefunded balance.
- Fail-closed, signature-verified, audited.

**Phase 2 — Rewards recommendation.**
- Register real cards + category multipliers.
- Best-card suggestion on approved/online purchases; optional autofill extension.
- Affiliate + subscription monetization.

**Phase 3 — Scale.** Mobile app, more issuers, richer rules, offer auto-activation.

---

## 9. Key risks

| Risk | Mitigation |
|---|---|
| Latency blows the auth window → bad declines | Pre-filter with issuer spend controls; <1.5s LLM budget; cache; fail-closed |
| LLM wrong call on a real charge | Conservative prompt (done); human-set hard blocks via issuer controls as backstop |
| Sponsor-bank compliance delays | Start KYC/AML conversations early; keep fund flows on the platform |
| Users expect "bill my Amex" magic | Set expectations: control is enforced; rewards are recommended, not routed |
| Cost of LLM per auth | Pre-filter so only ambiguous txns hit the model; cheap model tier for clear cases |

---

## TL;DR

- **Build the control product for real** (Phase 1): Stripe Issuing + your existing rules engine on the real-time auth webhook, ACH-funded, sponsor-bank pilot in months.
- **Drop literal rewards routing** — it can't preserve category bonuses, Amex blocks it, and it needs 50-state MTLs.
- **Deliver rewards as recommendations** (Phase 2) so the real card is used directly and keeps full points.
- You've already built the hardest *de-riskable* piece (the brain). The rest is integration, not invention.
