import { useEffect, useMemo, useRef, useState } from "react";
import {
  RATES,
  computeFee,
  facilities,
  peso,
  type Facility,
  type Reservation,
  type Session,
  type Slot,
  type SlotStatus,
  type VehicleType,
} from "./data";
import { Label, Panel, StatusDot } from "./ui";
import type { AppNotification } from "../App";

const VEHICLES: VehicleType[] = ["Automobile", "Motorcycle"];

interface Props {
  slots: Slot[];
  setSlots: React.Dispatch<React.SetStateAction<Slot[]>>;
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  history: Session[];
  setHistory: React.Dispatch<React.SetStateAction<Session[]>>;
  reservations: Reservation[];
  setReservations: React.Dispatch<React.SetStateAction<Reservation[]>>;
  addNotification: (
    n: Omit<AppNotification, "id" | "timestamp" | "read">,
  ) => void;
  username: string;
  displayName: string;
  contact?: string;
  email?: string;
  onLogout: () => void;
  navOpen: boolean;
  onNavClose: () => void;
  onNavOpen: () => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onDismissNotification: (id: string) => void;
}

type SortKey = "distance" | "available";
type ReserveStep = "map" | "form" | "payment";

type ConfirmResult =
  | { kind: "reservation"; data: Reservation }
  | { kind: "session"; data: Session };

export default function DriverView({
  slots,
  setSlots,
  sessions,
  setSessions,
  history,
  setHistory,
  reservations,
  setReservations,
  addNotification,
  username,
  displayName,
  contact,
  email,
  onLogout,
  navOpen: navRailOpen,
  onNavClose,
  onNavOpen,
  notifications,
  onMarkAllRead,
  onDismissNotification,
}: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("distance");
  const [selected, setSelected] = useState<Facility | null>(null);
  const [rightNav, setRightNav] = useState<
    "ticket" | "profile" | "parking" | "notif" | null
  >(null);

  // Reserve modal state
  const [reserveStep, setReserveStep] = useState<ReserveStep | null>(null);
  const [pickedSlot, setPickedSlot] = useState<Slot | null>(null);

  // Reservation form fields
  const [rPlate, setRPlate] = useState("");
  const [rDriver, setRDriver] = useState(displayName);
  const [rVehicle, setRVehicle] = useState<VehicleType>("Automobile");
  const [rDate, setRDate] = useState("");
  const [rTime, setRTime] = useState("");
  const [rHours, setRHours] = useState(2); // minimum 2 hours

  // Post-confirmation result shown in sidebar
  const [confirmed, setConfirmed] = useState<ConfirmResult | null>(null);

  // Extension modal state
  const [extendSession, setExtendSession] = useState<Session | null>(null);
  const [extendHours, setExtendHours] = useState(1);
  const [extendStep, setExtendStep] = useState<"pick" | "payment" | null>(null);

  // Profile editor state
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [nickname] = useState(displayName);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const extendGcashRef = extendSession
    ? "GCX-EXT-" + extendSession.id.slice(-5) + extendHours
    : "";

  // firedSessionExpiry: Map<sessionId, Set<minuteBreakpoint>>
  const firedSessionExpiry = useRef<Map<string, Set<number>>>(new Map());

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return facilities
      .filter(
        (f) =>
          !q ||
          f.name.toLowerCase().includes(q) ||
          f.address.toLowerCase().includes(q),
      )
      .sort((a, b) =>
        sort === "distance"
          ? a.distanceKm - b.distanceKm
          : b.available - a.available,
      );
  }, [query, sort]);

  const myReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) => reservation.accountUsername === username,
      ),
    [reservations, username],
  );

  // Total = vehicle-type rate × selected hours
  const reservationTotal = RATES[rVehicle] * rHours;

  // End time = entry time + selected hours
  const reservationEndTime = (() => {
    if (!rTime) return null;
    const [h, m] = rTime.split(":").map(Number);
    const end = new Date();
    end.setHours(h, m + rHours * 60, 0, 0);
    return end.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  })();

  // GCash reference number generated once per payment step
  const [gcashRef] = useState(
    () => "GCX-" + Math.random().toString(36).slice(2, 10).toUpperCase(),
  );

  // Tracks fired alerts per reservation to prevent duplicates.
  // firedArrival: reservation IDs that got the 20-min arrival reminder
  // firedOverdue: reservation IDs that got the overdue alert
  // firedExpiry:  Map<reservationId, Set<minuteBreakpoint>> for countdown warnings
  const firedArrival = useRef<Set<string>>(new Set());
  const firedOverdue = useRef<Set<string>>(new Set());
  const firedExpiry = useRef<Map<string, Set<number>>>(new Map());

  const HR_MS = 3_600_000;

  // Countdown breakpoints (minutes before expiry) — fires first at 30, then every 5 min
  const EXPIRY_BREAKPOINTS = [30, 25, 20, 15, 10, 5];

  useEffect(() => {
    function fmt(ms: number) {
      return new Date(ms).toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }

    function check() {
      const now = Date.now();
      const toCancel: string[] = []; // reservation IDs to remove
      const toExpire: string[] = []; // session IDs to auto-end

      // ── Reservation alerts ───────────────────────────────────────────────
      myReservations.forEach((r) => {
        const arrivalMs = new Date(r.date + "T" + r.time).getTime();
        const endMs = arrivalMs + r.hours * HR_MS;
        const minsToArrival = (arrivalMs - now) / 60_000;
        const minsToExpiry = (endMs - now) / 60_000;

        if (
          minsToArrival <= 20 &&
          minsToArrival > 0 &&
          !firedArrival.current.has(r.id)
        ) {
          firedArrival.current.add(r.id);
          addNotification({
            type: "reminder",
            title: "Parking Reminder — 20 Minutes",
            body: `Your reserved slot ${r.slot} (${r.id}) is due at ${fmt(arrivalMs)}. Please head to UV Main Campus Lot now.`,
            reservationId: r.id,
          });
        }

        if (
          minsToArrival <= 0 &&
          minsToExpiry > 0 &&
          !firedOverdue.current.has(r.id)
        ) {
          firedOverdue.current.add(r.id);
          addNotification({
            type: "overdue",
            title: "Reservation Overdue — Missed Arrival",
            body: `You missed your arrival time for slot ${r.slot} (${r.id}). Your ${r.hours}-hour reservation window is still active and expires at ${fmt(endMs)}.`,
            reservationId: r.id,
          });
        }

        if (!firedExpiry.current.has(r.id))
          firedExpiry.current.set(r.id, new Set());
        const firedR = firedExpiry.current.get(r.id)!;
        for (const bp of EXPIRY_BREAKPOINTS) {
          if (minsToExpiry <= bp && minsToExpiry > 0 && !firedR.has(bp)) {
            firedR.add(bp);
            const remaining = Math.ceil(minsToExpiry);
            addNotification({
              type: "expiry",
              title: `Reservation Expires in ${bp} min`,
              body: `Slot ${r.slot} (${r.id}) expires at ${fmt(endMs)} — ${remaining} minute${remaining !== 1 ? "s" : ""} remaining. Renew your stay or vacate to avoid automatic cancellation.`,
              reservationId: r.id,
            });
          }
        }

        if (minsToExpiry <= 0 && !firedR.has(0)) {
          firedR.add(0);
          toCancel.push(r.id);
          addNotification({
            type: "overdue",
            title: "Reservation Cancelled — Time Expired",
            body: `Your ${r.hours}-hour reservation ${r.id} for slot ${r.slot} expired at ${fmt(endMs)} and has been automatically cancelled. The slot is now available.`,
            reservationId: r.id,
          });
        }
      });

      // ── Walk-in / active session expiry alerts ────────────────────────────
      // Only check sessions that belong to this driver.
      const driverSessions = sessions.filter(
        (s) => s.accountUsername === username,
      );

      driverSessions.forEach((s) => {
        if (!s.duration) return; // open-ended — no expiry timer
        const endMs = s.entry + s.duration * 3_600_000;
        const minsToExpiry = (endMs - now) / 60_000;

        if (!firedSessionExpiry.current.has(s.id))
          firedSessionExpiry.current.set(s.id, new Set());
        const firedS = firedSessionExpiry.current.get(s.id)!;

        for (const bp of EXPIRY_BREAKPOINTS) {
          if (minsToExpiry <= bp && minsToExpiry > 0 && !firedS.has(bp)) {
            firedS.add(bp);
            const remaining = Math.ceil(minsToExpiry);
            addNotification({
              type: "expiry",
              title: `Parking Expires in ${bp} min`,
              body: `Slot ${s.slot} (${s.id}) expires at ${fmt(endMs)} — ${remaining} minute${remaining !== 1 ? "s" : ""} remaining. Extend your stay or prepare to vacate the slot.`,
            });
          }
        }

        if (minsToExpiry <= 0 && !firedS.has(0)) {
          firedS.add(0);
          toExpire.push(s.id);
          addNotification({
            type: "overdue",
            title: "Parking Session Expired",
            body: `Your session ${s.id} for slot ${s.slot} expired at ${fmt(endMs)} and has been automatically ended. Please vacate the slot.`,
          });
        }
      });

      // Free cancelled reservations
      if (toCancel.length > 0) {
        const cancelledSlotIds = myReservations
          .filter((r) => toCancel.includes(r.id))
          .map((r) => r.slot);
        setReservations((prev) => prev.filter((r) => !toCancel.includes(r.id)));
        setSlots((prev) =>
          prev.map((s) =>
            cancelledSlotIds.includes(s.id)
              ? { ...s, status: "available", plate: undefined }
              : s,
          ),
        );
      }

      // Auto-end expired sessions → move to history
      if (toExpire.length > 0) {
        const exitTime = Date.now();
        const expired = sessions.filter((s) => toExpire.includes(s.id));
        const closed = expired.map((s) => ({
          ...s,
          exit: exitTime,
          paid: true,
          amount: computeFee(s.vehicle, s.entry, exitTime),
        }));
        setSessions((prev) => prev.filter((s) => !toExpire.includes(s.id)));
        setHistory((prev) => [...closed, ...prev]);
        setSlots((prev) =>
          prev.map((s) =>
            expired.some((ex) => ex.slot === s.id)
              ? { ...s, status: "available", plate: undefined }
              : s,
          ),
        );
      }
    }

    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [myReservations, sessions, addNotification, username]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeReserve();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Auto-open Parking panel when staff approves and a session appears
  const prevSessionCount = useRef(0);
  useEffect(() => {
    const myCount = sessions.filter(
      (s) => s.accountUsername === username,
    ).length;
    if (myCount > prevSessionCount.current && myCount > 0) {
      setRightNav("parking");
    }
    prevSessionCount.current = myCount;
  }, [sessions, username]);

  function openReserve() {
    setPickedSlot(null);
    setReserveStep("map");
  }

  function closeReserve() {
    setReserveStep(null);
    setPickedSlot(null);
    setRPlate("");
    setRDriver(displayName);
    setRDate("");
    setRTime("");
    setRVehicle("Automobile");
    setRHours(2);
  }

  function pickSlot(slot: Slot) {
    if (slot.status !== "available") return;
    setPickedSlot(slot);
    setReserveStep("form");
  }

  function goToPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!pickedSlot || !rPlate.trim()) return;
    setReserveStep("payment");
  }

  function confirmPayment() {
    if (!pickedSlot) return;
    const plate = rPlate.trim().toUpperCase();
    const driver = rDriver.trim() || "Walk-in";
    const now = new Date();
    const id = "RSV-" + String(reservations.length + 5).padStart(3, "0");
    const res: Reservation = {
      id,
      accountUsername: username,
      plate,
      vehicle: rVehicle,
      driver,
      slot: pickedSlot.id,
      date: rDate || now.toISOString().slice(0, 10),
      time:
        rTime ||
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      hours: rHours,
    };
    setReservations((prev) => [res, ...prev]);
    setSlots((prev) =>
      prev.map((s) =>
        s.id === pickedSlot.id ? { ...s, status: "reserved", plate } : s,
      ),
    );
    setConfirmed({ kind: "reservation", data: res });
    closeReserve();
  }

  function openExtend(session: Session) {
    setExtendSession(session);
    setExtendHours(1);
    setExtendStep("pick");
  }

  function closeExtend() {
    setExtendStep(null);
    setExtendSession(null);
    setExtendHours(1);
  }

  function confirmExtend() {
    if (!extendSession) return;
    const newDuration = (extendSession.duration ?? 0) + extendHours;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === extendSession.id ? { ...s, duration: newDuration } : s,
      ),
    );
    // Reset expiry tracking for this session so new breakpoints can fire
    firedSessionExpiry.current.delete(extendSession.id);
    addNotification({
      type: "approval",
      title: "Parking Extended",
      body: `Slot ${extendSession.slot} (${extendSession.id}) extended by ${extendHours}h. New expiry: ${new Date(extendSession.entry + newDuration * 3_600_000).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true })}.`,
    });
    closeExtend();
  }

  const mySessions = sessions.filter((s) => s.accountUsername === username);

  // ticket data for right nav
  const ticketRes = confirmed
    ? (myReservations.find(
        (r) => r.id === (confirmed.data as Reservation).id,
      ) ?? (confirmed.data as Reservation))
    : null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const driverNavItems = [
    {
      id: "profile" as const,
      label: "My Profile",
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      ),
    },
    {
      id: "notif" as const,
      label: "Notifications",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1.5A4.5 4.5 0 0 0 3.5 6v2.5L2 10h12l-1.5-1.5V6A4.5 4.5 0 0 0 8 1.5Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M6.5 10.5a1.5 1.5 0 0 0 3 0"
            stroke="currentColor"
            strokeWidth="1.25"
          />
        </svg>
      ),
      badge:
        unreadCount > 0
          ? String(unreadCount > 9 ? "9+" : unreadCount)
          : undefined,
    },
    {
      id: "parking" as const,
      label: "My Parking",
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <path d="M9 17V9h4a3 3 0 0 1 0 6H9" />
        </svg>
      ),
      badge: mySessions.length > 0 ? String(mySessions.length) : undefined,
    },
    {
      id: "ticket" as const,
      label: "My Ticket",
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="5" width="20" height="14" rx="1" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
      badge: confirmed ? "1" : undefined,
    },
  ];

  return (
    <div className="flex flex-1 overflow-hidden flex-row-reverse">
      {/* ── Right navigation sidebar — same pattern as admin ── */}
      <nav
        className={`flex shrink-0 flex-col border-l border-line bg-white transition-all duration-300 h-full ${navRailOpen ? "w-56" : "w-12"}`}
      >
        {/* Hamburger toggle at top */}
        <button
          onClick={navRailOpen ? onNavClose : onNavOpen}
          className={`flex items-center gap-3 border-b border-line px-3 py-4 transition-colors hover:bg-paper ${navRailOpen ? "w-full" : "justify-center"}`}
          title={navRailOpen ? "Close menu" : "Open menu"}
        >
          <div className="flex shrink-0 flex-col gap-1.5">
            {navRailOpen ? (
              <>
                <span className="block h-px w-4 rotate-45 translate-y-[7px] bg-ink transition-transform" />
                <span className="block h-px w-4 opacity-0" />
                <span className="block h-px w-4 -rotate-45 -translate-y-[7px] bg-ink transition-transform" />
              </>
            ) : (
              <>
                <span className="block h-px w-4 bg-ink" />
                <span className="block h-px w-4 bg-ink" />
                <span className="block h-px w-4 bg-ink" />
              </>
            )}
          </div>
          {navRailOpen && (
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-ink-soft">
              Driver
            </span>
          )}
        </button>

        {navRailOpen ? (
          <>
            <ul className="py-2">
              {driverNavItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      if (item.id === "notif") onMarkAllRead();
                      setRightNav(rightNav === item.id ? null : item.id);
                    }}
                    className={`flex w-full items-center justify-between px-5 py-2.5 text-left transition-colors ${
                      rightNav === item.id
                        ? "border-r-2 border-ink bg-paper font-bold text-ink"
                        : "border-r-2 border-transparent text-ink-soft hover:bg-paper/60 hover:text-ink"
                    }`}
                  >
                    <span className="font-mono text-[12px] leading-snug">
                      {item.label}
                    </span>
                    {item.badge && (
                      <span
                        className={`ml-2 shrink-0 px-1.5 py-px font-mono text-[10px] font-bold ${rightNav === item.id ? "bg-ink text-paper" : "bg-line text-ink-soft"}`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-auto border-t border-line px-5 py-4 space-y-2">
              <button
                onClick={onLogout}
                className="w-full border border-line py-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-soft transition-colors hover:border-signal hover:text-signal"
              >
                Log out
              </button>
            </div>
          </>
        ) : (
          <ul className="flex flex-1 flex-col items-center gap-1 py-4">
            {driverNavItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    if (item.id === "notif") onMarkAllRead();
                    setRightNav(rightNav === item.id ? null : item.id);
                  }}
                  title={item.label}
                  className={`relative flex size-8 items-center justify-center transition-colors ${
                    rightNav === item.id
                      ? "bg-ink text-paper"
                      : "text-ink-soft hover:bg-paper"
                  }`}
                >
                  {item.icon}
                  {item.badge && (
                    <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center bg-signal font-mono text-[8px] font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {/* Slide-out detail panel */}
      {rightNav && (
        <div className="flex w-80 shrink-0 flex-col border-l border-line bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
            <span className="font-display text-sm font-bold uppercase tracking-[0.14em]">
              {rightNav === "ticket"
                ? "My Ticket"
                : rightNav === "parking"
                  ? "My Parking"
                  : rightNav === "notif"
                    ? "Notifications"
                    : "My Profile"}
            </span>
            <button
              onClick={() => setRightNav(null)}
              className="font-mono text-xs text-ink-soft hover:text-signal"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* ── Ticket panel ── */}
            {rightNav === "ticket" && (
              <div className="p-4 space-y-4">
                {ticketRes ? (
                  (() => {
                    const res = ticketRes;
                    const arrivalMs = new Date(
                      res.date + "T" + res.time,
                    ).getTime();
                    const endMs = arrivalMs + res.hours * 3_600_000;
                    const fmtTime = (ms: number) =>
                      new Date(ms).toLocaleTimeString("en-PH", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });
                    const fmtDate2 = (ms: number) =>
                      new Date(ms).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                    const totalPaid = RATES[res.vehicle] * res.hours;
                    return (
                      <>
                        <div className="overflow-hidden border border-ink bg-white shadow-lg">
                          <div className="flex items-center justify-between bg-ink px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex size-7 items-center justify-center bg-paper font-display text-sm font-black text-ink">
                                P
                              </div>
                              <div>
                                <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-paper">
                                  ParkHub
                                </div>
                                <div className="font-mono text-[8px] uppercase tracking-wide text-paper/60">
                                  Parking Reservation Ticket
                                </div>
                              </div>
                            </div>
                            <span className="bg-available px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-paper">
                              Paid ✓
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-b border-dashed border-line px-4 py-3">
                            <div>
                              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                                Reservation ID
                              </div>
                              <div className="font-mono text-2xl font-black tracking-tight">
                                {res.id}
                              </div>
                            </div>
                            <div className="flex items-end gap-px opacity-25">
                              {[
                                3, 5, 2, 7, 4, 6, 2, 5, 3, 4, 6, 3, 5, 2, 4, 7,
                                3, 5, 2, 6,
                              ].map((h, i) => (
                                <div
                                  key={i}
                                  className="w-[2px] bg-ink"
                                  style={{ height: h * 3 }}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="relative flex items-center">
                            <div className="absolute -left-2.5 size-5 rounded-full bg-paper border border-line" />
                            <div className="flex-1 border-t border-dashed border-line mx-2.5" />
                            <div className="absolute -right-2.5 size-5 rounded-full bg-paper border border-line" />
                          </div>
                          <div className="grid grid-cols-2 gap-px bg-line">
                            {[
                              ["Slot", res.slot],
                              ["Plate", res.plate],
                              ["Vehicle", res.vehicle],
                              ["Driver", res.driver],
                              [
                                "Date",
                                fmtDate2(
                                  new Date(res.date + "T00:00").getTime(),
                                ),
                              ],
                              ["Duration", `${res.hours}h`],
                            ].map(([k, v]) => (
                              <div key={k} className="bg-white px-3 py-2">
                                <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-ink-soft">
                                  {k}
                                </div>
                                <div className="font-mono text-xs font-bold">
                                  {v}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
                            <div className="px-3 py-2">
                              <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-ink-soft">
                                Entry
                              </div>
                              <div className="font-mono text-sm font-bold">
                                {fmtTime(arrivalMs)}
                              </div>
                            </div>
                            <div className="px-3 py-2">
                              <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-ink-soft">
                                Exit
                              </div>
                              <div className="font-mono text-sm font-bold">
                                {fmtTime(endMs)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between border-t border-ink bg-paper px-4 py-3">
                            <div>
                              <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-ink-soft">
                                Amount Paid
                              </div>
                              <div className="font-mono text-xl font-black">
                                {peso(totalPaid)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-ink-soft">
                                Rate
                              </div>
                              <div className="font-mono text-xs font-bold">
                                {peso(RATES[res.vehicle])}/hr × {res.hours}h
                              </div>
                            </div>
                          </div>
                          <div className="border-t border-line bg-ink px-4 py-1.5 text-center">
                            <p className="font-mono text-[9px] uppercase tracking-wide text-paper/70">
                              Show to staff on arrival
                            </p>
                          </div>
                        </div>
                        <CancelReservationPanel
                          reservation={res}
                          onCancel={() => {
                            setReservations((prev) =>
                              prev.filter((r) => r.id !== res.id),
                            );
                            setSlots((prev) =>
                              prev.map((s) =>
                                s.id === res.slot
                                  ? {
                                      ...s,
                                      status: "available" as const,
                                      plate: undefined,
                                    }
                                  : s,
                              ),
                            );
                            setConfirmed(null);
                            setRightNav(null);
                          }}
                        />
                      </>
                    );
                  })()
                ) : (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-ink-soft/40"
                    >
                      <rect x="2" y="5" width="20" height="14" rx="1" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                    <p className="font-mono text-sm text-ink-soft">
                      No active reservation ticket.
                    </p>
                    <p className="font-mono text-[11px] text-ink-soft/60">
                      Reserve a slot to get your digital ticket here.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Profile panel ── */}
            {rightNav === "profile" && (
              <div className="p-4 space-y-4">
                {/* Avatar only */}
                <div className="flex flex-col items-center gap-3 border border-line bg-paper py-8">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="group relative flex size-20 shrink-0 items-center justify-center overflow-hidden bg-ink font-display text-2xl font-black text-paper transition-opacity hover:opacity-80"
                    title="Change profile photo"
                  >
                    {profilePhoto ? (
                      <img
                        src={profilePhoto}
                        alt="Profile"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span>{nickname.charAt(0).toUpperCase()}</span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wide text-white">
                        Change
                      </span>
                    </span>
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) =>
                        setProfilePhoto(ev.target?.result as string);
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }}
                  />
                </div>

                {/* Account details */}
                <div className="border border-line bg-white">
                  <div className="border-b border-line px-4 py-2.5">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-soft">
                      Account Details
                    </span>
                  </div>
                  <div className="divide-y divide-line">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="font-mono text-[11px] text-ink-soft">
                        Name
                      </span>
                      <span className="font-mono text-[11px] font-bold">
                        {nickname}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="font-mono text-[11px] text-ink-soft">
                        Email
                      </span>
                      <span className="font-mono text-[11px] font-bold">
                        {email || ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="font-mono text-[11px] text-ink-soft">
                        Contact No.
                      </span>
                      <span className="font-mono text-[11px] font-bold">
                        {contact || ""}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Parking activity */}
                <div className="border border-line bg-white">
                  <div className="border-b border-line px-4 py-2.5">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-soft">
                      Parking Activity
                    </span>
                  </div>
                  <div className="divide-y divide-line">
                    {[
                      ["Active Sessions", mySessions.length],
                      ["Active Reservations", myReservations.length],
                      [
                        "Past Sessions",
                        history.filter((h) => h.accountUsername === username)
                          .length,
                      ],
                    ].map(([k, v]) => (
                      <div
                        key={String(k)}
                        className="flex items-center justify-between px-4 py-3"
                      >
                        <span className="font-mono text-[11px] text-ink-soft">
                          {k}
                        </span>
                        <span className="font-mono text-sm font-black">
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Parking panel ── */}
            {rightNav === "parking" && (
              <div className="p-4 space-y-3">
                {mySessions.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-ink-soft/40"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="1" />
                      <path d="M9 17V9h4a3 3 0 0 1 0 6H9" />
                    </svg>
                    <p className="font-mono text-sm text-ink-soft">
                      No active parking session.
                    </p>
                    <p className="font-mono text-[11px] text-ink-soft/60">
                      Your session appears here once staff approves your
                      arrival.
                    </p>
                  </div>
                ) : (
                  mySessions.map((s) => {
                    const nowTs = Date.now();
                    const exitMs = s.duration
                      ? s.entry + s.duration * 3_600_000
                      : null;
                    const minsLeft = exitMs
                      ? Math.max(0, (exitMs - nowTs) / 60_000)
                      : null;
                    const pct = exitMs
                      ? Math.min(
                          100,
                          ((nowTs - s.entry) / (s.duration! * 3_600_000)) * 100,
                        )
                      : 0;
                    const urgent = minsLeft !== null && minsLeft <= 30;
                    const critical = minsLeft !== null && minsLeft <= 10;
                    const barColor = critical
                      ? "bg-signal"
                      : urgent
                        ? "bg-reserved"
                        : "bg-available";
                    const fmtT = (ms: number) =>
                      new Date(ms).toLocaleTimeString("en-PH", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });
                    return (
                      <div
                        key={s.id}
                        className="overflow-hidden border border-line bg-white"
                      >
                        {/* Session header */}
                        <div
                          className={`flex items-center justify-between px-4 py-2 ${s.reservationId ? "bg-reserved-soft" : "bg-paper"}`}
                        >
                          <div>
                            <div className="font-mono text-xs font-bold">
                              {s.id}
                            </div>
                            <div className="font-mono text-[10px] text-ink-soft">
                              Slot {s.slot} · {s.vehicle}
                            </div>
                          </div>
                          {minsLeft !== null && (
                            <span
                              className={`font-mono text-[10px] font-bold px-1.5 py-0.5 ${critical ? "bg-signal text-white" : urgent ? "bg-reserved-soft text-reserved border border-reserved/30" : "bg-available-soft text-available border border-available/30"}`}
                            >
                              {minsLeft < 1
                                ? "Expiring"
                                : `${Math.ceil(minsLeft)}m left`}
                            </span>
                          )}
                        </div>

                        {/* Entry / Exit times */}
                        <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
                          <div className="px-4 py-3">
                            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                              Entry Time
                            </div>
                            <div className="font-mono text-sm font-bold">
                              {fmtT(s.entry)}
                            </div>
                          </div>
                          <div className="px-4 py-3">
                            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                              Exit Time
                            </div>
                            <div
                              className={`font-mono text-sm font-bold ${exitMs ? "" : "text-ink-soft"}`}
                            >
                              {exitMs ? fmtT(exitMs) : "Open"}
                            </div>
                          </div>
                        </div>

                        {/* Plate */}
                        <div className="border-t border-line px-4 py-2">
                          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                            Plate ·{" "}
                          </span>
                          <span className="font-mono text-xs font-bold">
                            {s.plate}
                          </span>
                        </div>

                        {/* Progress bar */}
                        {exitMs && (
                          <div>
                            <div className="flex justify-between border-t border-line px-4 pt-2 pb-1 font-mono text-[9px] text-ink-soft">
                              <span>{fmtT(s.entry)}</span>
                              <span>{fmtT(exitMs)}</span>
                            </div>
                            <div className="h-1.5 w-full bg-line">
                              <div
                                className={`h-full transition-all ${barColor}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Extend button */}
                        {exitMs && (
                          <button
                            onClick={() => openExtend(s)}
                            className={`w-full py-2 font-mono text-[10px] uppercase tracking-wide transition-colors ${urgent ? "bg-signal text-white hover:bg-signal-ink" : "border-t border-line bg-white text-ink-soft hover:bg-ink hover:text-paper"}`}
                          >
                            Extend Parking →
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Notifications panel ── */}
            {rightNav === "notif" && (
              <div>
                {notifications.length === 0 ? (
                  <p className="px-5 py-12 text-center font-mono text-xs text-ink-soft">
                    No notifications
                  </p>
                ) : (
                  <>
                    <div className="flex justify-end border-b border-line px-4 py-2">
                      <button
                        onClick={() =>
                          notifications.forEach((n) =>
                            onDismissNotification(n.id),
                          )
                        }
                        className="font-mono text-[10px] uppercase tracking-wide text-ink-soft hover:text-signal"
                      >
                        Clear all
                      </button>
                    </div>
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className="flex gap-3 border-b border-line/60 p-4 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink">
                              {n.title}
                            </p>
                            <button
                              onClick={() => onDismissNotification(n.id)}
                              className="shrink-0 font-mono text-[10px] text-ink-soft hover:text-signal"
                            >
                              ✕
                            </button>
                          </div>
                          <p className="mt-0.5 text-xs text-ink-soft leading-relaxed">
                            {n.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1100px]">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              {/* Search */}
              <Panel>
                <div className="p-5">
                  <Label>Find parking near you</Label>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-ink-soft">
                        ⌕
                      </span>
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search street, landmark, or facility…"
                        className="w-full border border-line bg-paper py-3 pl-9 pr-3 outline-none transition-colors focus:border-ink"
                      />
                    </div>
                    <div className="flex items-center gap-px bg-line">
                      {(["distance", "available"] as SortKey[]).map((k) => (
                        <button
                          key={k}
                          onClick={() => setSort(k)}
                          className={`px-4 py-3 font-mono text-[11px] uppercase tracking-wide transition-colors ${sort === k ? "bg-ink text-paper" : "bg-white hover:bg-paper"}`}
                        >
                          {k === "distance" ? "Nearest" : "Most open"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Facility list */}
              <div className="space-y-4">
                {results.map((f) => (
                  <FacilityCard
                    key={f.id}
                    facility={f}
                    active={selected?.id === f.id}
                    onSelect={() => setSelected(f)}
                    liveAvailable={
                      slots.filter(
                        (s) =>
                          s.facilityId === f.id && s.status === "available",
                      ).length
                    }
                  />
                ))}
                {results.length === 0 && (
                  <p className="border border-dashed border-line px-5 py-12 text-center text-ink-soft">
                    No facilities match "{query}".
                  </p>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
              {/* My Parking — active sessions for this driver */}
              {mySessions.length > 0 && (
                <div className="border border-line bg-white">
                  <div className="border-b border-line px-5 py-3">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wide">
                      My Parking
                    </span>
                  </div>
                  <div className="divide-y divide-line">
                    {mySessions.map((s) => {
                      const nowTs = Date.now();
                      const endMs = s.duration
                        ? s.entry + s.duration * 3_600_000
                        : null;
                      const minsLeft = endMs
                        ? Math.max(0, (endMs - nowTs) / 60_000)
                        : null;
                      const pct = endMs
                        ? Math.min(
                            100,
                            ((nowTs - s.entry) / (s.duration! * 3_600_000)) *
                              100,
                          )
                        : 0;
                      const urgent = minsLeft !== null && minsLeft <= 30;
                      const critical = minsLeft !== null && minsLeft <= 10;
                      const barColor = critical
                        ? "bg-signal"
                        : urgent
                          ? "bg-reserved"
                          : "bg-available";
                      return (
                        <div key={s.id} className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-mono text-sm font-bold">
                                {s.id}
                              </div>
                              <div className="font-mono text-[11px] text-ink-soft">
                                Slot {s.slot} · {s.vehicle} · {s.plate}
                              </div>
                            </div>
                            {endMs && (
                              <div
                                className={`shrink-0 rounded-none px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${critical ? "bg-signal/10 text-signal" : urgent ? "bg-reserved-soft text-reserved" : "bg-available-soft text-available"}`}
                              >
                                {minsLeft! < 1
                                  ? "Expiring"
                                  : `${Math.ceil(minsLeft!)}m left`}
                              </div>
                            )}
                          </div>

                          {endMs ? (
                            <>
                              <div className="space-y-1">
                                <div className="flex justify-between font-mono text-[10px] text-ink-soft">
                                  <span>
                                    Entry:{" "}
                                    {new Date(s.entry).toLocaleTimeString(
                                      "en-PH",
                                      {
                                        hour: "numeric",
                                        minute: "2-digit",
                                        hour12: true,
                                      },
                                    )}
                                  </span>
                                  <span>
                                    Expires:{" "}
                                    {new Date(endMs).toLocaleTimeString(
                                      "en-PH",
                                      {
                                        hour: "numeric",
                                        minute: "2-digit",
                                        hour12: true,
                                      },
                                    )}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-line">
                                  <div
                                    className={`h-full transition-all ${barColor}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                              <button
                                onClick={() => openExtend(s)}
                                className={`w-full py-2 font-display text-[11px] font-bold uppercase tracking-wide transition-colors ${urgent ? "bg-signal text-white hover:bg-signal-ink" : "border border-ink bg-white text-ink hover:bg-ink hover:text-paper"}`}
                              >
                                Extend Parking →
                              </button>
                            </>
                          ) : (
                            <p className="font-mono text-[10px] text-ink-soft">
                              Open-ended · Staff will process exit.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Facility detail */}
              {selected ? (
                <Panel title="Facility Detail">
                  <div className="aspect-[4/3] bg-line">
                    <img
                      src={selected.photo}
                      alt={selected.name}
                      className="size-full object-cover grayscale-[35%]"
                    />
                  </div>
                  <div className="space-y-4 p-5">
                    <div>
                      <h3 className="font-display text-lg font-bold leading-tight">
                        {selected.name}
                      </h3>
                      <p className="text-sm text-ink-soft">
                        {selected.address}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-y-3 text-sm">
                      <Detail
                        k="Automobile"
                        v={`${peso(selected.ratePerHour)}/h`}
                      />
                      <Detail
                        k="Motorcycle"
                        v={`${peso(selected.motorcycleRate)}/h`}
                      />
                      <Detail k="Hours" v={selected.open} full />
                    </dl>
                    <button className="w-full bg-signal py-3 font-display text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-signal-ink">
                      Get Directions
                    </button>
                    <button
                      onClick={openReserve}
                      className="w-full border-2 border-ink bg-white py-3 font-display text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-ink hover:text-paper"
                    >
                      Reserve a Slot
                    </button>
                  </div>
                </Panel>
              ) : (
                <Panel title="Facility Detail">
                  <p className="px-5 py-10 text-center text-sm text-ink-soft">
                    Select a facility to view rates, hours, and availability.
                  </p>
                </Panel>
              )}
            </aside>
          </div>

          {/* ── Extend Parking modal ── */}
          {extendStep && extendSession && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center">
              <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden border border-line bg-paper shadow-2xl">
                <div className="flex shrink-0 items-center justify-between border-b border-line bg-white px-6 py-4">
                  <div>
                    <div className="font-display text-sm font-bold uppercase tracking-[0.14em]">
                      {extendStep === "pick"
                        ? `Extend Parking — ${extendSession.id}`
                        : "GCash Extension Payment"}
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                      Slot {extendSession.slot} · {extendSession.vehicle} ·{" "}
                      {extendSession.plate}
                    </p>
                  </div>
                  <button
                    onClick={closeExtend}
                    className="font-mono text-xs text-ink-soft hover:text-signal"
                  >
                    ✕
                  </button>
                </div>

                <div className="overflow-y-auto">
                  {extendStep === "pick" && (
                    <div className="space-y-5 p-6">
                      {/* Current session info */}
                      {(() => {
                        const curEnd =
                          extendSession.entry +
                          (extendSession.duration ?? 0) * 3_600_000;
                        const newEnd =
                          extendSession.entry +
                          ((extendSession.duration ?? 0) + extendHours) *
                            3_600_000;
                        const fmtT = (ms: number) =>
                          new Date(ms).toLocaleTimeString("en-PH", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          });
                        const extAmt =
                          RATES[extendSession.vehicle] * extendHours;
                        return (
                          <>
                            <div className="grid grid-cols-2 gap-px bg-line">
                              <InfoCell
                                label="Current expiry"
                                value={fmtT(curEnd)}
                                mono
                              />
                              <InfoCell
                                label="New expiry"
                                value={fmtT(newEnd)}
                                mono
                                accent
                              />
                            </div>

                            <label className="block space-y-2">
                              <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                                Extend by
                              </span>
                              <div className="flex gap-px bg-line">
                                {[1, 2, 3, 4].map((h) => (
                                  <button
                                    key={h}
                                    type="button"
                                    onClick={() => setExtendHours(h)}
                                    className={`flex-1 py-3 font-mono text-sm font-bold transition-colors ${extendHours === h ? "bg-ink text-paper" : "bg-white hover:bg-paper"}`}
                                  >
                                    +{h}h
                                  </button>
                                ))}
                              </div>
                            </label>

                            <div className="flex items-center justify-between border border-line bg-paper px-4 py-3">
                              <div>
                                <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                                  Extension fee
                                </span>
                                <div className="font-mono text-2xl font-bold">
                                  {peso(extAmt)}
                                </div>
                              </div>
                              <span className="font-mono text-[11px] text-ink-soft">
                                {peso(RATES[extendSession.vehicle])}/h ×{" "}
                                {extendHours}h · via GCash
                              </span>
                            </div>

                            <button
                              onClick={() => setExtendStep("payment")}
                              className="w-full bg-ink py-3 font-display text-sm font-bold uppercase tracking-wide text-paper transition-colors hover:bg-[#0070E0]"
                            >
                              Proceed to GCash Payment →
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {extendStep === "payment" && (
                    <div className="space-y-5 p-6">
                      {(() => {
                        const extAmt =
                          RATES[extendSession.vehicle] * extendHours;
                        const newEnd =
                          extendSession.entry +
                          ((extendSession.duration ?? 0) + extendHours) *
                            3_600_000;
                        const fmtT = (ms: number) =>
                          new Date(ms).toLocaleTimeString("en-PH", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          });
                        return (
                          <>
                            <div className="bg-[#0070E0] px-5 py-4 text-white">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-display text-xl font-extrabold tracking-tight">
                                    GCash
                                  </div>
                                  <div className="font-mono text-[11px] opacity-75">
                                    Parking Extension · {extendSession.id}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-mono text-[11px] opacity-75">
                                    Amount Due
                                  </div>
                                  <div className="font-display text-3xl font-extrabold tracking-tight">
                                    {peso(extAmt)}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-px bg-line">
                              <InfoCell
                                label="Slot"
                                value={extendSession.slot}
                                mono
                              />
                              <InfoCell
                                label="Extension"
                                value={`+${extendHours}h`}
                                mono
                                accent
                              />
                              <InfoCell
                                label="New expiry"
                                value={fmtT(newEnd)}
                              />
                              <InfoCell
                                label="Fee"
                                value={`${peso(RATES[extendSession.vehicle])}/h × ${extendHours}h`}
                                mono
                              />
                            </div>

                            <div className="flex flex-col items-center gap-3 border border-line py-6">
                              <QrPlaceholder
                                ref_={extendGcashRef}
                                amount={extAmt}
                              />
                              <div className="font-mono text-[11px] text-ink-soft uppercase tracking-wide">
                                Scan with GCash app to pay
                              </div>
                              <div className="font-mono text-xs text-ink-soft">
                                Ref:{" "}
                                <span className="font-medium text-ink">
                                  {extendGcashRef}
                                </span>
                              </div>
                            </div>

                            <ol className="space-y-1.5 font-mono text-xs text-ink-soft list-decimal list-inside">
                              <li>
                                Open your GCash app and tap{" "}
                                <span className="font-medium text-ink">
                                  Scan QR
                                </span>
                              </li>
                              <li>
                                Confirm {peso(extAmt)} and complete payment
                              </li>
                              <li>
                                Tap{" "}
                                <span className="font-medium text-ink">
                                  "Payment Done"
                                </span>{" "}
                                below to apply the extension
                              </li>
                            </ol>

                            <button
                              onClick={confirmExtend}
                              className="w-full bg-[#0070E0] py-3 font-display text-sm font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90"
                            >
                              Payment Done — Apply Extension
                            </button>
                            <p className="text-center font-mono text-[10px] text-ink-soft">
                              Only click after payment is reflected in your
                              GCash account
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Reserve modal ── */}
          {reserveStep && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center">
              <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border border-line bg-paper shadow-2xl">
                {/* Modal header */}
                <div className="flex shrink-0 items-center justify-between border-b border-line bg-white px-6 py-4">
                  <div>
                    <div className="font-display text-sm font-bold uppercase tracking-[0.14em]">
                      {reserveStep === "map"
                        ? `Select a Slot — ${selected?.name ?? "Facility"}`
                        : reserveStep === "form"
                          ? `Reservation Details — Slot ${pickedSlot?.id}`
                          : "GCash Advance Payment"}
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                      {reserveStep === "map"
                        ? `${slots.filter((s) => s.facilityId === selected?.id && s.status === "available").length} slots available — green slots are selectable`
                        : reserveStep === "form"
                          ? "Fill in your vehicle details, then proceed to payment"
                          : "Pay to confirm your reservation — staff will approve your arrival"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {reserveStep === "form" && (
                      <button
                        onClick={() => setReserveStep("map")}
                        className="font-mono text-xs text-ink-soft hover:text-ink"
                      >
                        ← map
                      </button>
                    )}
                    {reserveStep === "payment" && (
                      <button
                        onClick={() => setReserveStep("form")}
                        className="font-mono text-xs text-ink-soft hover:text-ink"
                      >
                        ← back
                      </button>
                    )}
                    <button
                      onClick={closeReserve}
                      className="font-mono text-xs text-ink-soft hover:text-signal"
                    >
                      ✕ close
                    </button>
                  </div>
                </div>

                {/* Step indicator */}
                <div className="flex shrink-0 items-center gap-px border-b border-line bg-paper">
                  {(
                    [
                      ["map", "1. Pick Slot"],
                      ["form", "2. Details"],
                      ["payment", "3. Payment"],
                    ] as [ReserveStep, string][]
                  ).map(([step, label]) => {
                    const stepOrder = { map: 0, form: 1, payment: 2 };
                    const current = stepOrder[reserveStep];
                    const thisStep = stepOrder[step];
                    const done = thisStep < current;
                    const active = thisStep === current;
                    return (
                      <div
                        key={step}
                        className={`flex-1 py-2 text-center font-mono text-[10px] uppercase tracking-wide transition-colors ${active ? "bg-ink text-paper" : done ? "bg-available-soft text-available" : "text-ink-soft"}`}
                      >
                        {done ? "✓ " : ""}
                        {label}
                      </div>
                    );
                  })}
                </div>

                <div className="overflow-y-auto">
                  {/* ── Step 1: Slot map ── */}
                  {reserveStep === "map" && (
                    <>
                      <div className="flex flex-wrap items-center gap-4 border-b border-line px-6 py-3">
                        <span className="flex items-center gap-2 text-xs text-ink-soft">
                          <StatusDot status="available" /> Available — click to
                          select
                        </span>
                        <span className="flex items-center gap-2 text-xs text-ink-soft">
                          <StatusDot status="occupied" /> Occupied
                        </span>
                        <span className="flex items-center gap-2 text-xs text-ink-soft">
                          <StatusDot status="reserved" /> Reserved
                        </span>
                        <span className="flex items-center gap-2 text-xs text-ink-soft">
                          <StatusDot status="out_of_service" /> Out of Service
                        </span>
                        <span className="flex items-center gap-2 text-xs text-ink-soft">
                          <span className="inline-block size-2 rounded-full bg-blue-500" />{" "}
                          PWD Slot
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-px bg-line p-px sm:grid-cols-10">
                        {slots
                          .filter((s) => s.facilityId === selected?.id)
                          .map((s) => (
                            <DriverSlotCell
                              key={s.id}
                              slot={s}
                              onPick={pickSlot}
                            />
                          ))}
                      </div>
                    </>
                  )}

                  {/* ── Step 2: Details form ── */}
                  {reserveStep === "form" && (
                    <form onSubmit={goToPayment} className="space-y-4 p-6">
                      <div className="flex items-center gap-3 border border-ink bg-paper px-4 py-3">
                        <StatusDot status="available" />
                        <div>
                          <Label>Selected slot</Label>
                          <div className="font-mono text-xl font-bold">
                            {pickedSlot?.id}
                          </div>
                        </div>
                      </div>

                      <DriverField label="Plate Number">
                        <input
                          value={rPlate}
                          onChange={(e) => setRPlate(e.target.value)}
                          placeholder="ABC 1234"
                          required
                          className="w-full border border-line bg-white px-3 py-2 font-mono uppercase outline-none transition-colors focus:border-ink"
                        />
                      </DriverField>

                      <DriverField label="Driver Name">
                        <input
                          value={rDriver}
                          onChange={(e) => setRDriver(e.target.value)}
                          placeholder="Optional"
                          className="w-full border border-line bg-white px-3 py-2 outline-none transition-colors focus:border-ink"
                        />
                      </DriverField>

                      <DriverField label="Date">
                        <input
                          type="date"
                          value={rDate}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setRDate(e.target.value)}
                          required
                          className="w-full border border-line bg-white px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-ink"
                        />
                      </DriverField>

                      <DriverField label="Entry Time">
                        <input
                          type="time"
                          value={rTime}
                          onChange={(e) => setRTime(e.target.value)}
                          required
                          className="w-full border border-line bg-white px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-ink"
                        />
                      </DriverField>

                      <DriverField label="Vehicle Type">
                        <div className="grid grid-cols-2 gap-px bg-line">
                          {VEHICLES.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setRVehicle(v)}
                              className={`px-3 py-2 text-sm transition-colors ${rVehicle === v ? "bg-ink text-paper" : "bg-white hover:bg-paper"}`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </DriverField>

                      <DriverField label="Duration — minimum 2 hours">
                        <input
                          type="number"
                          min={2}
                          value={rHours}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setRHours(isNaN(v) || v < 2 ? 2 : v);
                          }}
                          className="w-full border border-line bg-paper px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-ink"
                          placeholder="Enter hours (min 2)"
                        />
                        <p className="mt-1 font-mono text-[10px] text-ink-soft">
                          Enter the number of hours you plan to park (minimum
                          2).
                        </p>
                      </DriverField>

                      {/* Pricing summary */}
                      <div className="border border-ink bg-paper">
                        <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
                          <div className="px-4 py-3">
                            <Label>Rate · {rVehicle}</Label>
                            <div className="font-mono text-lg font-bold">
                              {peso(RATES[rVehicle])}
                              <span className="text-sm font-normal text-ink-soft">
                                /hr
                              </span>
                            </div>
                          </div>
                          <div className="px-4 py-3">
                            <Label>Duration</Label>
                            <div className="font-mono text-lg font-bold">
                              {rHours} hours
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3">
                          <div>
                            <Label>Total payment</Label>
                            <div className="font-mono text-2xl font-bold text-ink">
                              {peso(reservationTotal)}
                            </div>
                          </div>
                          <div className="text-right">
                            <Label>End time</Label>
                            <div className="font-mono text-sm font-bold text-ink-soft">
                              {reservationEndTime ?? "—"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-line pt-2">
                        <button
                          type="submit"
                          disabled={!rPlate.trim() || !rDate || !rTime}
                          className="w-full bg-ink py-3 font-display text-sm font-bold uppercase tracking-wide text-paper transition-colors hover:bg-[#0070E0] disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
                        >
                          Proceed to GCash Payment →
                        </button>
                      </div>
                    </form>
                  )}

                  {/* ── Step 3: GCash payment ── */}
                  {reserveStep === "payment" && (
                    <div className="p-6 space-y-5">
                      {/* GCash header band */}
                      <div className="bg-[#0070E0] px-5 py-4 text-white">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-display text-xl font-extrabold tracking-tight">
                              GCash
                            </div>
                            <div className="font-mono text-[11px] opacity-75">
                              ParkHub · UV Main Campus Lot
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-[11px] opacity-75">
                              Total Due
                            </div>
                            <div className="font-display text-3xl font-extrabold tracking-tight">
                              {peso(reservationTotal)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Payment summary */}
                      <div className="grid grid-cols-2 gap-px bg-line">
                        <InfoCell
                          label="Slot"
                          value={pickedSlot?.id ?? ""}
                          mono
                        />
                        <InfoCell
                          label="Date"
                          value={
                            rDate
                              ? new Date(rDate + "T00:00").toLocaleDateString(
                                  "en-PH",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )
                              : "—"
                          }
                        />
                        <InfoCell
                          label="Entry Time"
                          value={
                            rTime
                              ? (() => {
                                  const [h, m] = rTime.split(":");
                                  const d = new Date();
                                  d.setHours(+h, +m);
                                  return d.toLocaleTimeString("en-PH", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                    hour12: true,
                                  });
                                })()
                              : "—"
                          }
                          mono
                        />
                        <InfoCell
                          label="Plate"
                          value={rPlate.toUpperCase()}
                          mono
                          accent
                        />
                        <InfoCell label="Vehicle" value={rVehicle} />
                        <InfoCell
                          label="Duration"
                          value={`${rHours} hrs`}
                          mono
                        />
                        <InfoCell
                          label="Rate"
                          value={`${peso(RATES[rVehicle])}/hr × ${rHours} hrs`}
                          mono
                        />
                        <InfoCell
                          label="End time"
                          value={reservationEndTime ?? "—"}
                          mono
                        />
                      </div>

                      {/* QR code placeholder */}
                      <div className="flex flex-col items-center gap-3 border border-line py-6">
                        <QrPlaceholder
                          ref_={gcashRef}
                          amount={reservationTotal}
                        />
                        <div className="font-mono text-[11px] text-ink-soft uppercase tracking-wide">
                          Scan with GCash app to pay
                        </div>
                        <div className="font-mono text-xs text-ink-soft">
                          Ref:{" "}
                          <span className="font-medium text-ink">
                            {gcashRef}
                          </span>
                        </div>
                      </div>

                      {/* Instructions */}
                      <ol className="space-y-1.5 font-mono text-xs text-ink-soft list-decimal list-inside">
                        <li>
                          Open your GCash app and tap{" "}
                          <span className="font-medium text-ink">Scan QR</span>
                        </li>
                        <li>
                          Scan the code above or enter the reference number
                        </li>
                        <li>
                          Confirm the amount of{" "}
                          <span className="font-medium text-ink">
                            {peso(reservationTotal)}
                          </span>{" "}
                          and pay
                        </li>
                        <li>
                          Tap{" "}
                          <span className="font-medium text-ink">
                            "Payment Done"
                          </span>{" "}
                          below to confirm your reservation
                        </li>
                      </ol>

                      <div className="border-t border-line pt-2">
                        <button
                          onClick={confirmPayment}
                          className="w-full bg-[#0070E0] py-3 font-display text-sm font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90"
                        >
                          Payment Done — Confirm Reservation
                        </button>
                        <p className="mt-2 text-center font-mono text-[10px] text-ink-soft">
                          Only click after payment is reflected in your GCash
                          account
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function QrPlaceholder({ ref_, amount }: { ref_: string; amount: number }) {
  // A deterministic-looking QR grid built from the ref string chars
  const cells = Array.from({ length: 11 * 11 }, (_, i) => {
    const charCode = ref_.charCodeAt(i % ref_.length) + amount + i;
    return charCode % 3 !== 0;
  });
  return (
    <div
      className="inline-grid gap-px bg-ink p-2"
      style={{ gridTemplateColumns: "repeat(11, 10px)" }}
    >
      {cells.map((filled, i) => (
        <div
          key={i}
          className={filled ? "bg-ink" : "bg-white"}
          style={{ width: 10, height: 10 }}
        />
      ))}
    </div>
  );
}

function InfoCell({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <Label>{label}</Label>
      <div
        className={`mt-0.5 text-sm font-medium ${mono ? "font-mono" : ""} ${accent ? "text-signal" : "text-ink"}`}
      >
        {value}
      </div>
    </div>
  );
}

function DriverSlotCell({
  slot,
  onPick,
}: {
  slot: Slot;
  onPick: (s: Slot) => void;
}) {
  const available = slot.status === "available";
  const bg: Record<SlotStatus, string> = {
    available: slot.isPwd
      ? "bg-blue-50 hover:bg-blue-100 cursor-pointer"
      : "bg-available-soft hover:bg-available/30 cursor-pointer",
    occupied: "bg-white opacity-40 cursor-not-allowed",
    reserved: "bg-reserved-soft opacity-50 cursor-not-allowed",
    out_of_service: "bg-line opacity-40 cursor-not-allowed",
  };
  return (
    <button
      type="button"
      disabled={!available}
      onClick={() => available && onPick(slot)}
      title={
        available
          ? `Select slot ${slot.id}`
          : `${slot.id} — ${slot.status === "out_of_service" ? "Out of Service" : slot.status}`
      }
      className={`group relative flex aspect-square flex-col justify-between p-2 text-left transition-colors focus:outline-none ${bg[slot.status]}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`font-mono text-xs font-medium ${slot.status === "out_of_service" ? "line-through text-ink-soft" : ""}`}
        >
          {slot.id}
        </span>
        <div className="flex items-center gap-0.5">
          {slot.isPwd && (
            <span className="inline-block size-2 rounded-full bg-blue-500" />
          )}
          <StatusDot status={slot.status} />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <span className="truncate font-mono text-[10px] text-ink-soft">
          {available
            ? "open"
            : slot.status === "out_of_service"
              ? "OOS"
              : slot.status === "reserved"
                ? "RSVD"
                : "—"}
        </span>
        {slot.isPwd && (
          <span className="font-mono text-[8px] font-bold text-blue-500">
            PWD
          </span>
        )}
      </div>
      {available && (
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="bg-available px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-white">
            Select
          </span>
        </span>
      )}
    </button>
  );
}

function FacilityCard({
  facility,
  active,
  onSelect,
  liveAvailable,
}: {
  facility: Facility;
  active: boolean;
  onSelect: () => void;
  liveAvailable?: number;
}) {
  const available = liveAvailable ?? facility.available;
  const full = available === 0;
  const pct = Math.round((available / facility.total) * 100);
  const level = full
    ? "text-signal"
    : pct <= 15
      ? "text-reserved"
      : "text-available";
  return (
    <button
      onClick={onSelect}
      className={`group grid w-full grid-cols-[120px_1fr_auto] gap-0 border bg-white text-left transition-colors ${active ? "border-ink" : "border-line hover:border-ink/50"}`}
    >
      <div className="aspect-square bg-line sm:aspect-auto">
        <img
          src={facility.photo}
          alt={facility.name}
          className="size-full object-cover grayscale-[35%] transition-all group-hover:grayscale-0"
        />
      </div>
      <div className="min-w-0 space-y-1 p-4">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-display text-base font-bold">
            {facility.name}
          </h3>
          <span className="shrink-0 border border-ink px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide">
            Reservable
          </span>
        </div>
        <p className="truncate text-sm text-ink-soft">{facility.address}</p>
        <div className="flex items-center gap-4 pt-1 font-mono text-xs text-ink-soft">
          <span>{facility.distanceKm} km away</span>
          <span>{peso(facility.ratePerHour)}/h</span>
        </div>
      </div>
      <div className="flex flex-col items-end justify-center border-l border-line px-5 py-4">
        <span className={`font-display text-3xl font-extrabold ${level}`}>
          {full ? "FULL" : available}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
          {full ? "no slots" : "open slots"}
        </span>
      </div>
    </button>
  );
}

function Detail({ k, v, full }: { k: string; v: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt>
        <Label>{k}</Label>
      </dt>
      <dd className="font-mono font-medium">{v}</dd>
    </div>
  );
}

function DriverField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

function CancelReservationPanel({
  reservation,
  onCancel,
}: {
  reservation: Reservation;
  onCancel: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  return (
    <>
      <div className="border border-line bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink">
              Cancel Reservation
            </div>
            <div className="font-mono text-[10px] text-ink-soft mt-0.5">
              You may cancel your reservation before arrival.
            </div>
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            className="shrink-0 border border-signal px-4 py-1.5 font-mono text-[11px] uppercase tracking-wide text-signal transition-colors hover:bg-signal hover:text-white"
          >
            Cancel Reservation
          </button>
        </div>
        <div className="mt-3 flex items-start gap-2 border border-signal/30 bg-signal/5 px-3 py-2">
          <span className="mt-px shrink-0 font-mono text-[11px] text-signal">
            ⚠
          </span>
          <p className="font-mono text-[10px] leading-relaxed text-signal">
            This reservation is{" "}
            <span className="font-bold uppercase">non-refundable</span>.
            Cancelling will forfeit your payment of{" "}
            {peso(RATES[reservation.vehicle] * reservation.hours)} and release
            the slot.
          </p>
        </div>
      </div>

      {/* Confirm cancel modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm border border-line bg-white shadow-2xl">
            <div className="border-b border-line bg-signal px-5 py-3">
              <div className="font-display text-sm font-bold uppercase tracking-wide text-white">
                Confirm Cancellation
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="border border-signal/40 bg-signal/5 px-4 py-3">
                <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-signal">
                  ⚠ Non-Refundable Payment
                </p>
                <p className="mt-1 font-mono text-[11px] text-ink-soft leading-relaxed">
                  Your payment of{" "}
                  <span className="font-bold text-ink">
                    {peso(RATES[reservation.vehicle] * reservation.hours)}
                  </span>{" "}
                  will not be returned. This action cannot be undone.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-px bg-line text-sm">
                {[
                  ["Reservation", reservation.id],
                  ["Slot", reservation.slot],
                  ["Plate", reservation.plate],
                  [
                    "Amount Forfeited",
                    peso(RATES[reservation.vehicle] * reservation.hours),
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white px-3 py-2">
                    <div className="font-mono text-[9px] uppercase tracking-wide text-ink-soft">
                      {k}
                    </div>
                    <div className="font-mono text-xs font-bold">{v}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 border border-line py-2.5 font-mono text-[11px] uppercase tracking-wide text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  Keep Reservation
                </button>
                <button
                  onClick={onCancel}
                  className="flex-1 bg-signal py-2.5 font-mono text-[11px] uppercase tracking-wide text-white transition-colors hover:bg-signal-ink"
                >
                  Yes, Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
