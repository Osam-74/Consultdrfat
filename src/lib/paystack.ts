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
 * NGN-valid channels: card, bank, bank_transfer, ussd, qr
 * (mobile_money is GHS/KES only — NOT valid for NGN and causes
 *  "Invalid transaction parameters" from the inline SDK)
 *
 * Amount is sent in kobo (₦1 = 100 kobo).
 * Always verify server-side via Worker /verify before granting access.
 */
export async function payNGN({ email, amountNGN, reference, metadata, onSuccess, onCancel, onError }: PayArgs) {
  // Guard: Paystack requires a valid email — empty string fails validation
  const safeEmail = email && email.includes("@") ? email : null;
  if (!safeEmail) {
    onError?.(new Error("No valid email address on your account. Please sign out and sign in again with Google."));
    return;
  }

  // Guard: key must be present (baked in at build time from NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY)
  if (!PAYSTACK_PUBLIC_KEY) {
    onError?.(new Error("Payment is not configured yet. Please contact support."));
    return;
  }

  try {
    const { default: PaystackPop } = await import("@paystack/inline-js");
    const popup = new PaystackPop() as unknown as {
      newTransaction: (o: Record<string, unknown>) => void;
    };
    popup.newTransaction({
      key: PAYSTACK_PUBLIC_KEY,
      email: safeEmail,
      amount: Math.round(amountNGN * 100), // kobo
      currency: "NGN",
      reference,
      // NGN-valid channels only (mobile_money is GHS/KES — causes validation error for NGN)
      channels: ["card", "bank", "bank_transfer", "ussd"],
      metadata,
      onSuccess: (txn: { reference: string }) => onSuccess(txn.reference),
      onCancel: () => onCancel?.(),
      onError: (err: unknown) => onError?.(err),
    });
  } catch (err) {
    onError?.(err);
  }
}
