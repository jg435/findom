import Lithic from "lithic";
import { createHmac, timingSafeEqual } from "crypto";

export const lithic = new Lithic({
  apiKey: process.env.LITHIC_API_KEY!,
  environment: "sandbox",
});

export function verifyLithicWebhook(payload: string, headers: Headers): boolean {
  const signature = headers.get("X-Lithic-Signature");
  if (!signature) return false;

  const secret = process.env.LITHIC_WEBHOOK_SECRET!;
  // Lithic signs with HMAC-SHA256 over the raw body using the webhook secret
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
