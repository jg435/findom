import OpenAI from "openai";
import type { ClaudeDecision, Rule } from "./types";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export type ClassifyHistoryItem = {
  descriptor: string;
  created_at: string;
};

export type ClassifyOptions = {
  platform?: string;
  // This calendar month's already-placed orders, used for frequency rules
  // like "allow Taco Bell once a month".
  monthlyHistory?: ClassifyHistoryItem[];
};

export async function classifyTransaction(
  merchantDescriptor: string,
  merchantMcc: string,
  amountCents: number,
  merchantCity: string,
  rules: Rule[],
  options: ClassifyOptions = {}
): Promise<ClaudeDecision> {
  const enabledRules = rules.filter((r) => r.enabled);
  const { platform, monthlyHistory = [] } = options;

  const now = new Date();
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  const systemPrompt = `You are a strict spending control AI for a virtual credit card. The user set up these rules to protect themselves from impulsive spending, so your default posture is PROTECTIVE — when in doubt, block.
When a user makes a purchase, decide whether to APPROVE or DECLINE it based on their rules.
Merchant descriptors often embed the actual vendor after a service name (e.g. "DOORDASH*TACOBEL" = Taco Bell via DoorDash, "DOORDASH*POKEWORK" = Pokéworks via DoorDash).
Parse merchant descriptors carefully to identify the real merchant.

JUDGMENT RULES — read every rule STRICTLY and CONSERVATIVELY:
- For category rules (e.g. "block non-healthy restaurants", "no junk food"), only APPROVE a merchant that UNAMBIGUOUSLY falls outside the blocked category. A restaurant qualifies as "healthy" ONLY if its core concept is health-focused (e.g. salad bars, poke bowls, grain/grain-bowl spots, juice/smoothie bars, dedicated vegan/health eateries).
- Do NOT approve a general-cuisine restaurant (Thai, Italian, American, diner, deli, pizza, BBQ, burgers, sushi-with-fried-items, etc.) on the assumption that "you could order something healthy there." If unhealthy or fried items are commonly ordered there, treat it as failing a "healthy only" rule and DECLINE.
- If it is a genuine judgment call or you are uncertain whether a merchant violates a rule, DECLINE. A false block is acceptable; a false approval defeats the purpose.

FREQUENCY / MONTHLY RULES: Some rules cap how often something is allowed (e.g. "allow Taco Bell once a month", "max 2 fast food orders per month"). You are given this calendar month's ALREADY-PLACED orders. Count how many prior placed orders match the rule's subject. If allowing this new order would EXCEED the cap, return DECLINE. If it stays within the cap, APPROVE.

Real card descriptors truncate and jam the restaurant name against the city, e.g. "DD *DOORDASH TACOBELSAN FRANCISCO CA" = Taco Bell, "DD *DOORDASH AREAFOUSAN FRANCISCO CA" = Area Four. Strip the "DD *DOORDASH" prefix and the trailing city/state, then infer the restaurant from the remaining truncated token.

IMPORTANT: If the merchant/restaurant genuinely cannot be identified, return DECLINE — it is safer to block an unidentified transaction than to allow it.
Only APPROVE when the merchant is clearly identified, matches no blocking rule, and is within any monthly frequency caps.

OUTPUT FORMAT — CRITICAL: Your ENTIRE response must be a single JSON object and NOTHING else — no prose or preamble. The "reason" must be ONE short sentence (max 25 words). Respond EXACTLY as:
{"decision": "APPROVE", "reason": "..."} or {"decision": "DECLINE", "reason": "..."}`;

  const historyText =
    monthlyHistory.length === 0
      ? "(no orders placed yet this month)"
      : monthlyHistory
          .map((h) => `- ${h.descriptor} (placed ${new Date(h.created_at).toLocaleDateString("en-US")})`)
          .join("\n");

  const userMessage = `Transaction:
- Merchant descriptor: "${merchantDescriptor}"${platform ? `\n- Platform: ${platform}` : ""}
- MCC: ${merchantMcc}
- Amount: $${(amountCents / 100).toFixed(2)}
- City: ${merchantCity}

Rules:
${enabledRules.length === 0 ? "None — APPROVE all transactions." : enabledRules.map((r, i) => `${i + 1}. ${r.description}`).join("\n")}

Orders already placed this month (${monthLabel}) — use these to enforce monthly/frequency caps:
${historyText}

Respond with JSON only.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await client.chat.completions.create(
      {
        model: "anthropic/claude-sonnet-4.6",
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const text = response.choices[0]?.message?.content ?? "";
    // Extract the JSON object even if the model wraps it in prose or code fences
    const clean = text.replace(/```json?\n?/gi, "").replace(/```/g, "").trim();
    const jsonStr = clean.match(/\{[\s\S]*\}/)?.[0] ?? clean;
    const parsed = JSON.parse(jsonStr) as ClaudeDecision;

    if (parsed.decision !== "APPROVE" && parsed.decision !== "DECLINE") {
      throw new Error(`Invalid decision value: ${JSON.stringify(parsed)}`);
    }
    return parsed;
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Claude classification failed:", msg);
    // Fail-closed: for a spending blocker, when we can't get a clear decision
    // it is safer to DECLINE than to let an unverified charge through.
    return {
      decision: "DECLINE",
      reason: "Could not verify this transaction against your rules — blocked to be safe.",
    };
  }
}
