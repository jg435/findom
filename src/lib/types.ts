export type Rule = {
  id: string;
  description: string;
  enabled: boolean;
  created_at: string;
};

export type Transaction = {
  id: string;
  lithic_token: string;
  merchant_descriptor: string;
  merchant_mcc: string;
  amount_cents: number;
  decision: "APPROVE" | "DECLINE";
  ai_reason: string;
  created_at: string;
};

export type ClaudeDecision = {
  decision: "APPROVE" | "DECLINE";
  reason: string;
};

export type LithicAuthPayload = {
  token: string;
  amount: number;
  merchant: {
    descriptor: string;
    mcc: string;
    city: string;
    country: string;
  };
  status: string;
};
