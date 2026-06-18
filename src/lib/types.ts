import { Timestamp } from "firebase/firestore";

export type Role = "practitioner" | "client";

export interface PracticeSettings {
  practitionerName: string;
  currency: "NGN";
  priceNGN: number; // price per standard session, in Naira
  sessionLengthMin: number; // default 15
  bufferMin: number; // gap between sessions
  bookingWindowDays: number; // hard limit, default 14
  timezone: string; // e.g. "Africa/Lagos"
}

export const DEFAULT_SETTINGS: PracticeSettings = {
  practitionerName: "Dr. Fat",
  currency: "NGN",
  priceNGN: 15000,
  sessionLengthMin: 15,
  bufferMin: 10,
  bookingWindowDays: 14,
  timezone: "Africa/Lagos",
};

// Extra-time blocks offered mid-session, priced pro-rata (₦ per minute ≈ price/length).
export const EXTENSION_MINUTES = [15, 30] as const;

export interface AvailabilityTemplate {
  id: string;
  weekday: number; // 0 = Sunday … 6 = Saturday
  start: string; // "09:00"
  end: string; // "13:00"
  active: boolean;
}

export interface AvailabilityException {
  id: string;
  date: string; // "2026-06-20"
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
  discountCode?: string;       // code string applied at booking
  discountCodeId?: string;     // document id in discountCodes
  discountPercent?: number;    // % applied
  paystackRef?: string;
  createdAt: Timestamp;
}

export interface Offer {
  minutes: number;
  priceNGN: number;
  status: "sent" | "accepted" | "confirmed" | "declined";
  paystackRef?: string;
}

export interface SessionDoc {
  status: "idle" | "live" | "complete";
  endAt: Timestamp | null; // authoritative end time
  durationMin: number;
  offer: Offer | null;
  nextClientAt: string | null; // human label of next booking, for the queue guard
  updatedAt: Timestamp;
  attachmentsEnabled?: boolean; // practitioner can toggle client file uploads
}

export interface Message {
  id: string;
  from: Role | "system";
  text: string;
  t: number;
  // File attachment fields — stored as base64 data URL directly in Firestore
  fileData?: string;   // base64 data URL, e.g. "data:image/png;base64,..."
  fileType?: string;   // MIME type e.g. "image/png", "application/pdf"
  fileName?: string;   // original filename
  fileSize?: number;   // size in bytes
}
