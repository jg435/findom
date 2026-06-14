import Lithic from "lithic";
import { createHmac, timingSafeEqual } from "crypto";

export const lithic = new Lithic({
  apiKey: process.env.LITHIC_API_KEY!,
  environment: "sandbox",
});

// Lithic follows Standard Webhooks: signs over "{webhook-id}.{webhook-timestamp}.{body}"
// Secret is base64-encoded with a "whsec_" prefix
export function verifyLithicWebhook(payload: string, headers: Headers): boolean {
  const msgId = headers.get("webhook-id");
  const msgTimestamp = headers.get("webhook-timestamp");
  const msgSignature = headers.get("webhook-signature");

  if (!msgId || !msgTimestamp || !msgSignature) return false;

  const secret = process.env.LITHIC_WEBHOOK_SECRET!;
  const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");

  const toSign = `${msgId}.${msgTimestamp}.${payload}`;
  const computed = createHmac("sha256", secretBytes).update(toSign).digest("base64");

  // Header may contain multiple space-separated "v1,<sig>" entries
  const signatures = msgSignature.split(" ").map((s) => s.split(",")[1]).filter(Boolean);

  return signatures.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(computed));
    } catch {
      return false;
    }
  });
}
