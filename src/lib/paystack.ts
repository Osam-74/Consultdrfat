import { PAYSTACK_PUBLIC_KEY } from "./firebase";

export interface PayArgs {
  email: string;
  amountNGN: number; // in Naira; converted to kobo below
  reference?: string;
  metadata?: Record<string, unknown>;
  onSuccess: (reference: string) => void;
  onCancel?: () => void;
}

/**
 * Open the Paystack checkout for a Naira charge. The `bank` channel surfaces
 * "Pay with OPay" / PalmPay / Kuda and bank transfer; `card` covers
 * Visa/Mastercard/Verve. Amount is sent in kobo (₦1 = 100 kobo).
 *
 * The SDK is imported dynamically so it never runs during server prerender.
 * Always verify the reference server-side (Worker `/verify`) before granting
 * access — never trust the client's onSuccess alone.
 */
export async function payNGN({ email, amountNGN, reference, metadata, onSuccess, onCancel }: PayArgs) {
  const { default: PaystackPop } = await import("@paystack/inline-js");
  const popup = new PaystackPop() as unknown as {
    newTransaction: (o: Record<string, unknown>) => void;
  };
  popup.newTransaction({
    key: PAYSTACK_PUBLIC_KEY,
    email,
    amount: Math.round(amountNGN * 100),
    currency: "NGN",
    reference,
    channels: ["card", "bank", "bank_transfer", "ussd", "mobile_money"],
    metadata,
    onSuccess: (txn: { reference: string }) => onSuccess(txn.reference),
    onCancel: () => onCancel?.(),
  });
}
