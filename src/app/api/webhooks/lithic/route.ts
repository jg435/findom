import { NextRequest, NextResponse } from "next/server";
import { verifyLithicWebhook } from "@/lib/lithic";
import { classifyTransaction } from "@/lib/claude";
import { supabase } from "@/lib/supabase";
import type { LithicAuthPayload } from "@/lib/types";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyLithicWebhook(rawBody, req.headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload: LithicAuthPayload = JSON.parse(rawBody);
  const { token, amount, merchant } = payload;

  // Return cached result on duplicate webhook delivery
  const { data: existing } = await supabase
    .from("transactions")
    .select("decision")
    .eq("lithic_token", token)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      token,
      result: existing.decision === "APPROVE" ? "APPROVED" : "DECLINED",
    });
  }

  const { data: rules } = await supabase
    .from("rules")
    .select("*")
    .eq("enabled", true);

  const classification = await classifyTransaction(
    merchant.descriptor ?? "",
    merchant.mcc ?? "",
    amount,
    merchant.city ?? "",
    rules ?? []
  );

  // Fire-and-forget: don't block the response on the DB write
  supabase
    .from("transactions")
    .insert({
      lithic_token: token,
      merchant_descriptor: merchant.descriptor,
      merchant_mcc: merchant.mcc,
      amount_cents: amount,
      decision: classification.decision,
      ai_reason: classification.reason,
    })
    .then(({ error }) => {
      if (error) console.error("DB insert error:", error);
    });

  return NextResponse.json({
    token,
    result: classification.decision === "APPROVE" ? "APPROVED" : "DECLINED",
  });
}
