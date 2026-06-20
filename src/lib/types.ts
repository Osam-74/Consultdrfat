import { Timestamp } from "firebase/firestore";

export type Role = "practitioner" | "client";

export interface PracticeSettings {
  practitionerName: string;
  currency: "NGN";
  priceNGN: number;
  sessionLengthMin: number;
  bufferMin: number;
  bookingWindowDays: number;
  timezone: string;
  rescheduleFeeNGN: number; // fee to reschedule a booking, default 1000
}

export const DEFAULT_SETTINGS: PracticeSettings = {
  practitionerName: "Dr. Fat",
  currency: "NGN",
  priceNGN: 15000,
  sessionLengthMin: 15,
  bufferMin: 10,
  bookingWindowDays: 14,
  timezone: "Africa/Lagos",
  rescheduleFeeNGN: 1000,
};

export const EXTENSION_MINUTES = [15, 30] as const;

export interface AvailabilityTemplate {
  id: string;
  weekday: number;
  start: string;
  end: string;
  active: boolean;
}

export interface AvailabilityException {
  id: string;
  date: string;
  type: "block" | "extra";
  start?: string;
  end?: string;
}

export type BookingStatus = "held" | "paid" | "cancelled";

export interface Booking {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  slotStart: Timestamp;
  slotEnd: Timestamp;
  status: BookingStatus;
  topic?: string;
  amountNGN: number;
  discountCode?: string;
  discountCodeId?: string;
  discountPercent?: number;
  paystackRef?: string;
  createdAt: Timestamp;
  archived?: boolean;
  inSession?: boolean;         // true while session is live (cleared on complete/exit)
  rescheduledOnce?: boolean;   // true if client has already rescheduled once
  completedAt?: Timestamp;     // set when session completes
}

export interface Offer {
  minutes: number;
  priceNGN: number;       // 0 = free extension
  status: "sent" | "accepted" | "confirmed" | "declined" | "client-requested";
  paystackRef?: string;
  isFree?: boolean;       // true when practitioner offers free extension
}

export interface SessionDoc {
  status: "idle" | "live" | "complete";
  endAt: Timestamp | null;
  durationMin: number;
  offer: Offer | null;
  nextClientAt: string | null;
  updatedAt: Timestamp;
  attachmentsEnabled?: boolean;
  // Presence: uid → last-seen epoch ms (written by each client every 15s)
  presence?: Record<string, number>;
  // Client extension request: "pending" when client asks for more time
  clientExtRequest?: "pending" | "responded";
}

export interface Message {
  id: string;
  from: Role | "system";
  text: string;
  t: number;
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
  fileSize?: number;
  replyToId?: string;
  replyToText?: string;
  replyToFrom?: string;
}
