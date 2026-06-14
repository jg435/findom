import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeDecision, Rule } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function classifyTransaction(
  merchantDescriptor: string,
  merchantMcc: string,
  amountCents: number,
  merchantCity: string,
  rules: Rule[]
): Promise<ClaudeDecision> {
  const enabledRules = rules.filter((r) => r.enabled);

  const systemPrompt = `You are a spending control AI for a virtual credit card.
When a user makes a purchase, decide whether to APPROVE or DECLINE it based on their rules.
Merchant descriptors often embed the actual vendor after a service name (e.g. "DOORDASH*TACOBEL" = Taco Bell via DoorDash, "DOORDASH*POKEWORK" = Pokéworks via DoorDash).
Parse merchant descriptors carefully to identify the real merchant.
Respond ONLY with valid JSON: {"decision": "APPROVE", "reason": "..."} or {"decision": "DECLINE", "reason": "..."}`;

  const userMessage = `Transaction:
- Merchant descriptor: "${merchantDescriptor}"
- MCC: ${merchantMcc}
- Amount: $${(amountCents / 100).toFixed(2)}
- City: ${merchantCity}

Rules:
${enabledRules.length === 0 ? "None — APPROVE all transactions." : enabledRules.map((r, i) => `${i + 1}. ${r.description}`).join("\n")}

Respond with JSON only.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1400);

  try {
    const response = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 150,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const clean = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean) as ClaudeDecision;

    if (parsed.decision !== "APPROVE" && parsed.decision !== "DECLINE") {
      throw new Error("Invalid decision");
    }
    return parsed;
  } catch (err) {
    clearTimeout(timeout);
    console.error("Claude classification failed:", err);
    // Fail-open: false approve is better than a false decline on a legitimate purchase
    return { decision: "APPROVE", reason: "AI unavailable — approved by default" };
  }
}
