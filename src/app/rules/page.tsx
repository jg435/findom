"use client";
import { useEffect, useState } from "react";
import RuleCard from "@/components/RuleCard";
import RuleForm from "@/components/RuleForm";
import type { Rule } from "@/lib/types";

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.json())
      .then((data) => {
        setRules(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  async function handleAdd(description: string) {
    const res = await fetch("/api/rules");
    const data = await res.json();
    setRules(Array.isArray(data) ? data : []);
    void description;
  }

  async function handleToggle(id: string, enabled: boolean) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    await fetch(`/api/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  async function handleDelete(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Spending Rules</h1>
      <p className="text-gray-400 text-sm mb-6">
        Write rules in plain English. Claude will apply all enabled rules to every transaction.
      </p>

      <RuleForm onAdd={handleAdd} />

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : rules.length === 0 ? (
        <div className="rounded-lg bg-gray-900 border border-gray-800 p-8 text-center">
          <p className="text-gray-400 text-sm">No rules yet — all transactions will be approved.</p>
          <p className="text-gray-600 text-xs mt-1">
            Try: &quot;Block Taco Bell orders&quot; or &quot;Block fast food after 10pm&quot;
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
