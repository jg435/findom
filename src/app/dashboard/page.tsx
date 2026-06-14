"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TransactionRow from "@/components/TransactionRow";
import type { Transaction } from "@/lib/types";

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/transactions?limit=50")
      .then((r) => r.json())
      .then((data) => {
        setTransactions(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  const approved = transactions.filter((t) => t.decision === "APPROVE").length;
  const declined = transactions.filter((t) => t.decision === "DECLINE").length;
  const totalSpent = transactions
    .filter((t) => t.decision === "APPROVE")
    .reduce((sum, t) => sum + t.amount_cents, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Spent</p>
          <p className="text-2xl font-bold mt-1">${(totalSpent / 100).toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Approved</p>
          <p className="text-2xl font-bold mt-1 text-green-400">{approved}</p>
        </div>
        <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Blocked</p>
          <p className="text-2xl font-bold mt-1 text-red-400">{declined}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Recent Transactions</h2>
        <Link href="/transactions" className="text-sm text-gray-400 hover:text-white">
          View all →
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : transactions.length === 0 ? (
        <div className="rounded-lg bg-gray-900 border border-gray-800 p-8 text-center">
          <p className="text-gray-400 text-sm">No transactions yet.</p>
          <p className="text-gray-600 text-xs mt-1">
            Simulate one via the Lithic sandbox to see it here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {transactions.slice(0, 5).map((t) => (
            <TransactionRow key={t.id} transaction={t} />
          ))}
        </div>
      )}
    </div>
  );
}
