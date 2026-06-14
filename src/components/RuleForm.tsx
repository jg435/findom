"use client";
import { useState } from "react";

type Props = { onAdd: (description: string) => void };

export default function RuleForm({ onAdd }: Props) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: value }),
      });
      if (res.ok) {
        onAdd(value);
        setValue("");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='e.g. "Block Taco Bell orders" or "Block fast food after 10pm"'
        className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="px-4 py-2.5 rounded-lg bg-white text-gray-950 text-sm font-medium disabled:opacity-40 hover:bg-gray-100 transition-colors"
      >
        Add Rule
      </button>
    </form>
  );
}
