import type { Transaction } from "@/lib/types";

type Props = { transaction: Transaction };

export default function TransactionRow({ transaction: t }: Props) {
  const approved = t.decision === "APPROVE";
  const amount = `$${(t.amount_cents / 100).toFixed(2)}`;
  const date = new Date(t.created_at).toLocaleString();

  return (
    <div className="p-4 rounded-lg bg-gray-900 border border-gray-800">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {t.merchant_descriptor || "Unknown merchant"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{date}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-gray-300">{amount}</span>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              approved
                ? "bg-green-900 text-green-300"
                : "bg-red-900 text-red-300"
            }`}
          >
            {approved ? "APPROVED" : "DECLINED"}
          </span>
        </div>
      </div>
      {t.ai_reason && (
        <p className="mt-2 text-xs text-gray-500 italic">{t.ai_reason}</p>
      )}
    </div>
  );
}
