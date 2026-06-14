import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { classifyTransaction } from "@/lib/claude";
import { supabase } from "@/lib/supabase";
import type { Transaction } from "@/lib/types";

function startOfMonthISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// Simulates a single card transaction: classify it against the user's rules
// (including monthly/frequency caps), log it, and return the decision.
export async function POST(req: NextRequest) {
  let merchant: string;
  let amountCents: number;

  try {
    const body = await req.json();
    merchant = body.merchant?.trim();
    const dollars = Number(body.amount);
    amountCents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!merchant) {
    return NextResponse.json({ error: "merchant is required" }, { status: 400 });
  }

  const { data: rules } = await supabase
    .from("rules")
    .select("*")
    .eq("enabled", true);

  // This calendar month's approved transactions — drives monthly/frequency caps
  const { data: monthlyHistory } = await supabase
    .from("transactions")
    .select("merchant_descriptor, created_at")
    .eq("decision", "APPROVE")
    .gte("created_at", startOfMonthISO())
    .order("created_at", { ascending: true });

  const result = await classifyTransaction(merchant, "5812", amountCents, "", rules ?? [], {
    monthlyHistory: (monthlyHistory ?? []).map((h) => ({
      descriptor: h.merchant_descriptor ?? "",
      created_at: h.created_at,
    })),
  });

  // Log the simulated transaction so it shows on the dashboard and counts
  // toward future monthly caps.
  const { data: inserted } = await supabase
    .from("transactions")
    .insert({
      lithic_token: `sim_${randomUUID()}`,
      merchant_descriptor: merchant,
      merchant_mcc: "5812",
      amount_cents: amountCents,
      decision: result.decision,
      ai_reason: result.reason,
    })
    .select()
    .single();

  return NextResponse.json({
    decision: result.decision,
    reason: result.reason,
    transaction: inserted as Transaction | null,
  });
}
