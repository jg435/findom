# FinDom — Phase 1 Design

> **Status:** design only — no application code or live cards. Everything here is built and tested against the **Stripe Issuing test mode**. Going live (real money) requires sponsor-bank onboarding, which is months out and out of scope. See [`MVP_ARCHITECTURE.md`](./MVP_ARCHITECTURE.md) for the bigger picture.

Phase 1 turns today's single-tenant POC (no auth, one global rule set, Lithic-sandbox demo) into the real product shape:

- **Multi-user accounts** (Supabase Auth)
- **Multiple virtual cards per user**, each with **its own rule set**
- **Real-time approve/decline** wired to the existing AI rules engine (`classifyTransaction()`)
- **Row-Level Security** so users only ever see their own data
- All on **Stripe Issuing**, in **test mode**

---

## 1. Scope & non-goals

**In scope**
- Email auth (Supabase Auth) + protected app routes
- Issue / list / freeze virtual cards (Stripe Issuing test mode)
- Per-card natural-language + monthly rules (reuses the existing engine)
- Real-time authorization webhook → AI decision within the network window
- Multi-tenant Postgres with RLS

**Out of scope (deferred / infeasible)**
- Real money, live cards — needs sponsor-bank approval (months)
- Rewards **routing** — infeasible (quasi-cash, MCC loss, Amex blocks, MTLs). Rewards stay a **recommendation** layer in Phase 2.
- Mobile app

---

## 2. Stripe Issuing primer (what the design relies on)

| Concept | Meaning |
|---|---|
| **Cardholder** | The person a card is issued to (one per user). |
| **Card (virtual)** | A 16-digit virtual card tied to a cardholder. |
| **Authorization** | The real-time approve/decline event at swipe time. |
| **Transaction** | The cleared/settled charge (happens after auth). |
| **`issuing_authorization.request`** | Webhook Stripe fires mid-swipe; you approve/decline within **~2s**. Timeout → your configured default. |
| **`spending_controls`** | Declarative `allowed_categories` / `blocked_categories` / `spending_limits` on a card — evaluated **before** the webhook. |
| **Issuing balance** | Prefunded pool the card spends from. Test mode funds instantly; production = ACH from a bank. **Never credit-card funded.** |
| **Test mode** | Create test cardholders/cards and **simulate authorizations** entirely via API — full flow, zero money. |

**Design principle:** put coarse blocks (whole MCC categories, hard limits) in Stripe `spending_controls` so they're filtered *before* your webhook fires. The webhook + LLM only handle the **ambiguous, natural-language** cases ("block fast food but allow Chipotle once a month") that Stripe's static controls can't express. This saves latency and LLM cost.

---

## 3. System architecture (multi-tenant)

```
┌──────────────────────────────────────────────────────────────┐
│ Browser (Next.js client)                                      │
│  login · cards · per-card rules · tx log · rewards hints      │
└───────────────┬──────────────────────────────────────────────┘
                │ Supabase Auth JWT
┌───────────────▼──────────────────────────────────────────────┐
│ FinDom API (Next.js route handlers)                           │
│  ┌──────────────────────────┐   ┌──────────────────────────┐  │
│  │ User-scoped client       │   │ Service-role client      │  │
│  │ (RLS enforced, JWT)      │   │ (RLS bypass, webhooks)   │  │
│  └────────────┬─────────────┘   └────────────┬─────────────┘  │
│   cards/rules/tx CRUD                  Stripe auth webhook     │
│               │                                  │            │
│        classifyTransaction()  (src/lib/claude.ts — reused)    │
│               │                                  │            │
│  ┌────────────▼──────────────────────────────────▼─────────┐  │
│  │ Supabase Postgres + RLS                                  │  │
│  │ profiles · cards · rules · transactions · reward_cards   │  │
│  └──────────────────────────────────────────────────────────┘ │
└───────▲───────────────────────────────────────┬──────────────┘
        │ issuing_authorization.request (<2s)    │ create/freeze cards,
        │ approve / decline                      │ fund balance (test)
┌───────┴────────────────────────────────────────▼─────────────┐
│ Stripe Issuing (test mode)                                    │
│  cardholders · virtual cards · spending controls · balance    │
│  sponsor bank + BIN + PCI-scoped PAN vault                    │
└───────────────────────────────────────────────────────────────┘
        ▲ card network (Visa/Mastercard)
┌───────┴────────┐
│ Merchant / POS │
└────────────────┘
```

The issuer (Stripe) brings the sponsor bank, BIN, scheme connectivity, and PCI-scoped PAN vaulting — you never touch raw card numbers and need no banking license for the pilot. **Your entire differentiator is the auth webhook → `classifyTransaction()`.**

---

## 4. Auth + RLS design

Supabase Auth issues JWTs (email magic-link or password). `auth.users` is the identity source; mirror each user into `public.profiles` (1:1, `id = auth.uid()`) so app tables can FK to it.

### The dual-client pattern (the crux)

Two different Supabase clients, used in two different contexts:

```
┌─ User request (browser has a JWT) ──────────────────────────┐
│  GET /api/cards                                             │
│    → user-scoped Supabase client (built from the JWT)      │
│    → RLS ENFORCED: every query implicitly filtered to      │
│      rows where user_id = auth.uid()                       │
│    → a user physically cannot read another user's data     │
└────────────────────────────────────────────────────────────┘

┌─ Stripe webhook (NO user JWT — it's a machine call) ────────┐
│  POST /api/webhooks/stripe                                 │
│    → service-role Supabase client (server-only key)        │
│    → RLS BYPASSED (needed: the webhook isn't "a user")     │
│    → looks up card by stripe_card_id → owner → rules,      │
│      then writes the transaction                           │
│    → key never shipped to the browser; used only here      │
└────────────────────────────────────────────────────────────┘
```

This replaces today's single global anon-key client in `src/lib/supabase.ts` with: (a) a per-request user-scoped client, and (b) a guarded service-role client used **only** in the webhook handler.

### RLS policy shape (illustrative)

```sql
-- cards: a user sees only their own
create policy "own cards" on cards
  for all using (user_id = auth.uid());

-- transactions: same
create policy "own transactions" on transactions
  for all using (user_id = auth.uid());

-- rules: scoped through the card they belong to
create policy "own card rules" on rules
  for all using (
    exists (select 1 from cards
            where cards.id = rules.card_id
              and cards.user_id = auth.uid())
  );
```

**Next.js middleware** protects `/dashboard`, `/cards`, `/rules` — redirect to `/login` when there's no session.

---

## 5. Multi-tenant data model

```
auth.users  (Supabase-managed identity)
     │ 1:1
public.profiles ── id = auth.uid(), email, created_at
     │ 1:N
cards ── id, user_id, stripe_cardholder_id, stripe_card_id,
         last4, nickname, state[active|frozen|canceled], created_at
     │ 1:N
rules ── id, card_id, description, enabled, created_at        (card_id = NEW)
     │
transactions ── id, card_id, user_id, stripe_auth_id,
                merchant_descriptor, merchant_mcc, amount_cents,
                decision[APPROVE|DECLINE], ai_reason,
                status[pending|approved|declined|cleared], created_at
reward_cards ── id, user_id, network, issuer, nickname,
                category_multipliers jsonb                    (Phase 2 stub)
```

**Migration from the current schema** (`supabase/schema.sql`):
- Add `profiles`, `cards`, `reward_cards` tables.
- `rules`: add `card_id` FK (rules now belong to a card, not globally).
- `transactions`: add `card_id` + `user_id`, rename `lithic_token` → `stripe_auth_id` (generic `auth_id`), add `status`.
- **Enable RLS** on every tenant table + the policies above.

---

## 6. Real-time authorization sequence (Stripe)

```
Cardholder pays at a merchant
  → Visa / Mastercard network
    → Stripe Issuing
       → spending_controls pre-filter (MCC / hard limits)        [cheap, no LLM]
       → POST /api/webhooks/stripe   (event: issuing_authorization.request)
            1. verify Stripe signature (Stripe-Signature header)
            2. [service-role] card by stripe_card_id → user_id + enabled rules
            3. fetch this month's APPROVED transactions (for monthly caps)
            4. classifyTransaction(descriptor, mcc, amount, city, rules,
                                    { monthlyHistory })          ← reused as-is
            5. respond approve / decline within ~1.5s            (fail-CLOSED on timeout)
            6. fire-and-forget: insert transaction (status = approved | declined)
       ← approve/decline → network → merchant
  ……… later (seconds–days) …………………………………………………………………………………
  Stripe fires issuing_authorization.updated / issuing_transaction.created
       → reconcile: set transaction.status = cleared, store final amount
```

Mirrors the existing Lithic handler in `src/app/api/webhooks/lithic/route.ts`:
- **<1.5s LLM budget** inside Stripe's ~2s window; coarse cases already filtered by `spending_controls`.
- **Dedupe** on `stripe_auth_id` (today: `lithic_token unique`).
- **Fail-closed (DECLINE)** on timeout/error — this is a blocker, so an unverifiable charge is blocked, not allowed.

---

## 7. API surface (endpoints — design only)

| Method · Route | Purpose | Client |
|---|---|---|
| Supabase Auth + `/login` page + middleware | Sign-in, session, route protection | — |
| `GET /api/cards` | List the user's virtual cards | user-scoped |
| `POST /api/cards` | Issue a virtual card (Stripe cardholder+card, store ids) | user-scoped |
| `PATCH /api/cards/[id]` | Freeze / unfreeze / rename (maps to Stripe status) | user-scoped |
| `DELETE /api/cards/[id]` | Cancel a card | user-scoped |
| `GET/POST /api/cards/[id]/rules` | Per-card rules (today's `/api/rules`, scoped) | user-scoped |
| `PATCH/DELETE /api/cards/[id]/rules/[ruleId]` | Toggle / edit / delete a rule | user-scoped |
| `GET /api/transactions?card_id=` | User's transactions, optional card filter | user-scoped |
| `POST /api/webhooks/stripe` | Real-time auth decision | **service-role** |
| `POST /api/simulate` | Keep for demos; scope to a card + user | user-scoped |

---

## 8. Card lifecycle & funding

- **Issue** — create a Stripe **cardholder** (once per user) → create a **virtual card** with baseline `spending_controls` → store `stripe_card_id`, `last4`, `nickname`, `state=active`.
- **Freeze / cancel** — `PATCH` maps to Stripe card `status` (`active` / `inactive` / `canceled`); reflect in `cards.state`.
- **Funding (test mode)** — top up the Issuing **balance** via Stripe test helpers (instant, fake money). Production funding = **ACH from a bank**, gated by sponsor-bank onboarding. **Never** credit-card funded (quasi-cash → cash advance → no rewards; see MVP doc).

---

## 9. Environment / config

Add (server-only — never `NEXT_PUBLIC_`):
- `STRIPE_SECRET_KEY` (test)
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

Keep:
- `OPENROUTER_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 10. Build sequence (for when code starts)

1. **Schema migration + RLS** policies in Supabase.
2. **Supabase Auth** — login page, middleware, dual-client refactor of `src/lib/supabase.ts`.
3. **Card management** — Stripe cardholder/card create, list, freeze.
4. **Per-card rules** — scope the existing rules UI/API to a card.
5. **Stripe real-time auth webhook** → `classifyTransaction()`.
6. **Multi-card UI** — dashboard / tx log / simulator scoped to the selected card.

---

## 11. Verification plan (Stripe test mode — no money)

1. **Auth/RLS** — create two test users; assert user B cannot read user A's cards, rules, or transactions.
2. **Issue** — user A issues a virtual card; add a rule "block fast food."
3. **Decline path** — use Stripe's **simulate authorization** API to fire a Taco Bell auth → webhook declines within budget, logs `status=declined`.
4. **Approve + clear** — simulate an allowed merchant → approve + `status=approved`; then fire the clearing event → `status=cleared`.
5. **Monthly cap** — with a "Chipotle once a month" rule, simulate two Chipotle auths in the same month → 2nd declines.
6. **Latency** — confirm the LLM round-trip stays inside the ~2s window with headroom.

---

## 12. Risks & open questions

| Item | Note |
|---|---|
| Stripe real-time auth enablement | Confirm test-vs-live setup specifics and the exact 2s budget headroom for the LLM call. |
| Service-role key handling | Server-only, audited, used solely in the webhook; never bundled to the client. |
| Live funding | Start sponsor-bank / compliance conversations early — it's the long pole to real money. |
| Rewards | Stays **recommendation-only** (Phase 2) per `MVP_ARCHITECTURE.md` — no routing. |
| LLM cost per auth | Pre-filter with `spending_controls` so only ambiguous transactions reach the model. |

---

## Appendix — auth request flow (two lanes)

```
                       ┌─────────────────────────────┐
 user (JWT) ──────────▶│ user-scoped Supabase client │──▶ RLS: user_id = auth.uid()
   /api/cards          └─────────────────────────────┘     (own rows only)

 Stripe (no JWT) ─────▶┌─────────────────────────────┐
   /api/webhooks/stripe│ service-role Supabase client│──▶ RLS bypassed
                       └─────────────────────────────┘     (card → owner lookup,
                                                             write transaction)
```
