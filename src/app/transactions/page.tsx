"use client";
import { useEffect, useState } from "react";
import TransactionRow from "@/components/TransactionRow";
import type { Transaction } from "@/lib/types";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/transactions?limit=100")
      .then((r) => r.json())
      .then((data) => {
        setTransactions(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">All Transactions</h1>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : transactions.length === 0 ? (
        <div className="rounded-lg bg-gray-900 border border-gray-800 p-8 text-center">
          <p className="text-gray-400 text-sm">No transactions yet.</p>
          <p className="text-gray-600 text-xs mt-1">
            Use the Lithic simulate API to test your rules.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {transactions.map((t) => (
            <TransactionRow key={t.id} transaction={t} />
          ))}
        </div>
      )}
    </div>
  );
}
