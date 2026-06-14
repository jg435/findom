"use client";
import { useState } from "react";
import type { ClaudeDecision } from "@/lib/types";

type Props = { onComplete?: () => void };

const PRESETS = [
  { label: "DoorDash · Taco Bell", merchant: "DoorDash — Taco Bell", amount: "18.40" },
  { label: "DoorDash · Pokéworks", merchant: "DoorDash — Pokéworks", amount: "16.25" },
  { label: "Uber Eats", merchant: "Uber Eats order", amount: "22.10" },
  { label: "Safeway", merchant: "Safeway groceries", amount: "54.30" },
];

export default function TransactionSimulator({ onComplete }: Props) {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClaudeDecision | null>(null);

  async function runTransaction(m: string, a: string) {
    if (!m.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant: m, amount: a || "0" }),
      });
      const data = await res.json();
      setResult({ decision: data.decision, reason: data.reason });
      onComplete?.();
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runTransaction(merchant, amount);
  }

  function handlePreset(p: (typeof PRESETS)[number]) {
    setMerchant(p.merchant);
    setAmount(p.amount);
    runTransaction(p.merchant, p.amount);
  }

  const approved = result?.decision === "APPROVE";

  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 p-5 mb-8">
      <h2 className="text-lg font-semibold mb-1">Simulate a Transaction</h2>
      <p className="text-xs text-gray-500 mb-4">
        Run a card charge through your rules — no real money moves.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          type="text"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="Merchant (e.g. DoorDash — Taco Bell)"
          className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
        />
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="$ Amount"
          className="w-full sm:w-32 rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
        />
        <button
          type="submit"
          disabled={loading || !merchant.trim()}
          className="px-5 py-2.5 rounded-lg bg-white text-gray-950 text-sm font-medium disabled:opacity-40 hover:bg-gray-100 transition-colors whitespace-nowrap"
        >
          {loading ? "Checking…" : "Run Charge"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mb-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => handlePreset(p)}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {result && (
        <div
          className={`mt-4 rounded-lg p-4 border ${
            approved
              ? "bg-green-950 border-green-800"
              : "bg-red-950 border-red-800"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                approved ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"
              }`}
            >
              {approved ? "APPROVED" : "DECLINED"}
            </span>
          </div>
          <p className="text-sm text-gray-200">{result.reason}</p>
        </div>
      )}
    </div>
  );
}
