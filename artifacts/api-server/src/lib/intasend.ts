const PRODUCTION_URL = "https://api.intasend.com";
const SANDBOX_URL = "https://sandbox.intasend.com";

export interface IntaSendStkResponse {
  invoice_id?: string;
  checkout_id?: string;
  tracking_id?: string;
  state?: string;
  status?: string;
  [key: string]: unknown;
}

export function isIntaSendConfigured(): boolean {
  return Boolean(process.env.INTASEND_SECRET_KEY);
}

export function normalizeKenyanPhone(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  if (/^07\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^01\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^\+254[17]\d{8}$/.test(digits)) return digits.slice(1);
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  return null;
}

export async function initiateMpesaStkPush(input: {
  amount: number;
  phoneNumber: string;
  apiRef: string;
}): Promise<IntaSendStkResponse> {
  const secretKey = process.env.INTASEND_SECRET_KEY;
  if (!secretKey) {
    throw new Error("INTASEND_SECRET_KEY is not configured");
  }

  const environment = process.env.INTASEND_ENVIRONMENT?.toLowerCase();
  const baseUrl = environment === "sandbox" ? SANDBOX_URL : PRODUCTION_URL;
  const publicKey = process.env.INTASEND_PUBLIC_KEY;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (publicKey) headers["X-IntaSend-Public-API-Key"] = publicKey;

  const response = await fetch(`${baseUrl}/api/v1/payment/mpesa-stk-push/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      amount: input.amount,
      phone_number: input.phoneNumber,
      api_ref: input.apiRef,
      narrative: "TrivinFX Pro account deposit",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const raw = await response.text();
  let body: IntaSendStkResponse;
  try {
    body = JSON.parse(raw) as IntaSendStkResponse;
  } catch {
    throw new Error(`IntaSend returned a non-JSON response (${response.status})`);
  }

  if (!response.ok) {
    const message = typeof body.detail === "string"
      ? body.detail
      : typeof body.message === "string"
        ? body.message
        : `IntaSend request failed (${response.status})`;
    throw new Error(message);
  }

  const state = String(body.state ?? body.status ?? "").toUpperCase();
  if (["FAILED", "ERROR", "CANCELLED", "REJECTED"].includes(state)) {
    throw new Error("IntaSend declined the STK push request");
  }

  return body;
}

export function getProviderTransactionId(body: IntaSendStkResponse): string | null {
  for (const key of ["invoice_id", "checkout_id", "tracking_id"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}