"use client";
import type { Rule } from "@/lib/types";

type Props = {
  rule: Rule;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
};

export default function RuleCard({ rule, onToggle, onDelete }: Props) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-gray-900 border border-gray-800">
      <button
        onClick={() => onToggle(rule.id, !rule.enabled)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
          rule.enabled ? "bg-green-500" : "bg-gray-700"
        }`}
        aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${
            rule.enabled ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <p className={`flex-1 text-sm ${rule.enabled ? "text-white" : "text-gray-500 line-through"}`}>
        {rule.description}
      </p>
      <button
        onClick={() => onDelete(rule.id)}
        className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
        aria-label="Delete rule"
      >
        ×
      </button>
    </div>
  );
}
