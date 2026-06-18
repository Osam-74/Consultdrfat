import { PAYSTACK_PUBLIC_KEY } from "./firebase";

export interface PayArgs {
  email: string;
  amountNGN: number; // in Naira; converted to kobo below
  reference?: string;
  metadata?: Record<string, unknown>;
  onSuccess: (reference: string) => void;
  onCancel?: () => void;
  onError?: (err: unknown) => void;
}

/**
 * Open the Paystack checkout for a Naira charge.
 *
 * NGN-valid channels: card, bank, bank_transfer, ussd
 * (mobile_money is GHS/KES only — invalid for NGN)
 *
 * IMPORTANT: Paystack inline-js type-checks EVERY key present in the params object.
 * Passing `reference: undefined` causes "Invalid parameter type: reference" because
 * typeof undefined = "undefined" which is not in types:["string"].
 * Fix: only spread optional params when they are defined non-undefined values.
 *
 * Amount is sent in kobo (₦1 = 100 kobo).
 */
export async function payNGN({
  email,
  amountNGN,
  reference,
  metadata,
  onSuccess,
  onCancel,
  onError,
}: PayArgs) {
  // Guard: Paystack requires a valid email — empty string fails required check
  const safeEmail = email && email.includes("@") ? email : null;
  if (!safeEmail) {
    const err = new Error(
      "No valid email address on your account. Please sign out and sign in again with Google."
    );
    onError?.(err);
    return;
  }

  // Guard: public key must be present (baked in at build time)
  if (!PAYSTACK_PUBLIC_KEY) {
    const err = new Error("Payment is not configured. Please contact support.");
    onError?.(err);
    return;
  }

  try {
    const { default: PaystackPop } = await import("@paystack/inline-js");
    const popup = new PaystackPop() as unknown as {
      newTransaction: (o: Record<string, unknown>) => void;
    };

    // Build params object — only include optional keys when they are defined.
    // Paystack type-checks every key present; undefined values fail type validation.
    const params: Record<string, unknown> = {
      key: PAYSTACK_PUBLIC_KEY,
      email: safeEmail,
      amount: Math.round(amountNGN * 100), // kobo
      currency: "NGN",
      channels: ["card", "bank", "bank_transfer", "ussd"],
      onSuccess: (txn: { reference: string }) => onSuccess(txn.reference),
    };

    // Spread optionals only when defined
    if (reference !== undefined) params.reference = reference;
    if (metadata !== undefined) params.metadata = metadata;
    if (onCancel !== undefined) params.onCancel = onCancel;
    if (onError !== undefined) params.onError = onError;

    popup.newTransaction(params);
  } catch (err) {
    onError?.(err);
  }
}
