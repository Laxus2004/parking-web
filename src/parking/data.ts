// Seed data for the Community-Based Parking Facility Management System.
// Context: University of the Visayas area, Cebu City. Currency: Philippine peso (₱).

export type SlotStatus = "available" | "occupied" | "reserved" | "out_of_service";
export type VehicleType = "Automobile" | "Motorcycle";

export interface Slot {
  id: string; // e.g. "A-01" (UV Main), "E-01" (Sanciangko), "H-01" (Plaza)
  zone: string;
  facilityId: string;
  status: SlotStatus;
  plate?: string;
  isPwd?: boolean;
}

export interface Session {
  id: string;
  plate: string;
  vehicle: VehicleType;
  driver: string;
  slot: string;
  entry: number; // epoch ms
  exit?: number;
  paid?: boolean;
  amount?: number;
  duration?: number; // hours
  reservationId?: string;
}

export interface Reservation {
  id: string;
  plate: string;
  vehicle: VehicleType;
  driver: string;
  slot: string;
  date: string;  // YYYY-MM-DD
  time: string;  // HH:MM
  hours: number;
}

export interface Facility {
  id: string;
  name: string;
  address: string;
  distanceKm: number;
  total: number;
  available: number;
  ratePerHour: number;
  motorcycleRate: number;
  open: string;
  photo: string;
  zones: readonly string[];
}

export const RATES: Record<VehicleType, number> = {
  Automobile: 50,
  Motorcycle: 30,
};

// Per-facility zone assignments
const UV_ZONES  = ["A","B","C","D"] as const; // 4 zones × 10 = 40 slots
const SC_ZONES  = ["E","F","G"]     as const; // 3 zones × 10 = 30 slots
const PI_ZONES  = ["H","I","J","K","L"] as const; // 5 zones × 10 = 50 slots

const min = 60_000;
const hr  = 60 * min;

export const seedSessions: Session[] = [];

const UV_RESERVED = new Set<string>([]);
const SC_RESERVED = new Set<string>([]);
const PI_RESERVED = new Set<string>([]);

// PWD-designated slots
const UV_PWD = new Set(["A-10", "B-10"]);
const SC_PWD = new Set(["E-10"]);
const PI_PWD = new Set(["H-10", "I-10"]);

// Sample out-of-service slots (damaged, reported by staff)
const UV_OOS = new Set(["D-05"]);
const SC_OOS = new Set(["F-03", "G-08"]);
const PI_OOS = new Set(["J-07", "K-04"]);

function buildFacilitySlots(facilityId: string, zones: readonly string[]): Slot[] {
  const occupiedMap = new Map(seedSessions.map((s) => [s.slot, s.plate]));
  const reserved =
    facilityId === "fac-uv-main"     ? UV_RESERVED :
    facilityId === "fac-sanciangko"  ? SC_RESERVED : PI_RESERVED;
  const oos =
    facilityId === "fac-uv-main"     ? UV_OOS :
    facilityId === "fac-sanciangko"  ? SC_OOS : PI_OOS;
  const pwd =
    facilityId === "fac-uv-main"     ? UV_PWD :
    facilityId === "fac-sanciangko"  ? SC_PWD : PI_PWD;
  const slots: Slot[] = [];
  for (const zone of zones) {
    for (let i = 1; i <= 10; i++) {
      const id = `${zone}-${String(i).padStart(2, "0")}`;
      const plate = occupiedMap.get(id);
      const status: SlotStatus =
        oos.has(id)      ? "out_of_service" :
        plate            ? "occupied" :
        reserved.has(id) ? "reserved" : "available";
      slots.push({ id, zone, facilityId, status, plate, isPwd: pwd.has(id) });
    }
  }
  return slots;
}

export const seedSlots: Slot[] = [
  ...buildFacilitySlots("fac-uv-main",             UV_ZONES),
  ...buildFacilitySlots("fac-sanciangko",           SC_ZONES),
  ...buildFacilitySlots("fac-plaza-independencia",  PI_ZONES),
];

export const seedReservations: Reservation[] = [];

export const seedHistory: Session[] = [];

import { parkingImages } from '../assets/images';

export const facilities: Facility[] = [
  {
    id: "fac-uv-main",
    name: "UV Main Campus Lot",
    address: "Colon St., Cebu City",
    distanceKm: 0.3,
    total: 40,
    available: 12,
    ratePerHour: 50,
    motorcycleRate: 30,
    open: "7:00 AM – 7:00 PM · Mon–Sat",
    photo: parkingImages[0], // 1.png
    zones: UV_ZONES,
  },
  {
    id: "fac-sanciangko",
    name: "Sanciangko Parking Plaza",
    address: "Sanciangko St., Cebu City",
    distanceKm: 0.6,
    total: 30,
    available: 8,
    ratePerHour: 50,
    motorcycleRate: 30,
    open: "24/7",
    photo: parkingImages[1], // 2.png
    zones: SC_ZONES,
  },
  {
    id: "fac-plaza-independencia",
    name: "Plaza Independencia Parking",
    address: "Plaza Independencia, Cebu City",
    distanceKm: 1.1,
    total: 50,
    available: 18,
    ratePerHour: 50,
    motorcycleRate: 30,
    open: "24/7",
    photo: parkingImages[2], // 3.png
    zones: PI_ZONES,
  },
];

// --- helpers ---

export function peso(n: number): string {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 0 });
}

export function durationLabel(fromMs: number, toMs: number): string {
  const totalMin = Math.max(1, Math.round((toMs - fromMs) / min));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function billedHours(fromMs: number, toMs: number): number {
  return Math.max(1, Math.ceil((toMs - fromMs) / hr));
}

export function computeFee(vehicle: VehicleType, fromMs: number, toMs: number): number {
  return billedHours(fromMs, toMs) * RATES[vehicle];
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true });
}