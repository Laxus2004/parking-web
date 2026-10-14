import { useEffect, useMemo, useRef, useState } from "react";
import {
  RATES,
  clock,
  computeFee,
  durationLabel,
  facilities,
  peso,
  type Reservation,
  type Session,
  type Slot,
  type SlotStatus,
  type VehicleType,
} from "./data";
import type { AppNotification } from "../App";
import { Label, Panel, StatusDot } from "./ui";

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
    username: string,
    n: Omit<AppNotification, "id" | "timestamp" | "read">,
  ) => void;
  addDamageReport: (slotId: string, facilityName: string) => void;
  onLogout: () => void;
  displayName: string;
  facilityId?: string; // if set, staff is locked to this facility
  navOpen: boolean;
  onNavToggle: () => void;
}

export default function AdminDashboard({
  slots,
  setSlots,
  sessions,
  setSessions,
  history,
  setHistory,
  reservations,
  setReservations,
  addNotification,
  addDamageReport,
  onLogout,
  displayName,
  facilityId: assignedFacilityId,
  navOpen,
  onNavToggle,
}: Props) {
  const [activeNav, setActiveNav] = useState<
    "facility" | "map" | "sessions" | "reservations" | "history"
  >("facility");
  const [selectedFacilityId, setSelectedFacilityId] = useState(
    assignedFacilityId ?? facilities[0].id,
  );
  const isLocked = !!assignedFacilityId;
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");
  const [ticket, setTicket] = useState<Session | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");
  const [manualSlot, setManualSlot] = useState<Slot | null>(null);
  const entryFormRef = useRef<HTMLDivElement>(null);

  // Entry form state
  const [plate, setPlate] = useState("");
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState<VehicleType>("Automobile");

  // Arrival alert popup
  const [arrivalAlerts, setArrivalAlerts] = useState<Reservation[]>([]);
  const firedArrivalAlerts = useRef<Set<string>>(new Set());

  // Reset zone filter when facility changes
  useEffect(() => {
    setZoneFilter("ALL");
  }, [selectedFacilityId]);

  // Reset slot selection when facility changes
  useEffect(() => {
    setSelectedSlot(null);
    setManualSlot(null);
  }, [selectedFacilityId]);

  useEffect(() => {
    function check() {
      const now = Date.now();
      const incoming: Reservation[] = [];
      reservations.forEach((r) => {
        const arrivalMs = new Date(r.date + "T" + r.time).getTime();
        const secsLeft = (arrivalMs - now) / 1000;
        if (
          secsLeft <= 30 &&
          secsLeft > 0 &&
          !firedArrivalAlerts.current.has(r.id)
        ) {
          firedArrivalAlerts.current.add(r.id);
          incoming.push(r);
        }
      });
      if (incoming.length > 0)
        setArrivalAlerts((prev) => [...prev, ...incoming]);
    }
    check();
    const interval = setInterval(check, 5_000);
    return () => clearInterval(interval);
  }, [reservations]);

  // Map slot ID → facilityId for fast lookup
  const slotFacilityMap = useMemo(
    () => new Map(slots.map((s) => [s.id, s.facilityId])),
    [slots],
  );

  const selectedFacility = facilities.find((f) => f.id === selectedFacilityId)!;

  // All data scoped to selected facility
  const facilitySlots = useMemo(
    () => slots.filter((s) => s.facilityId === selectedFacilityId),
    [slots, selectedFacilityId],
  );
  const facilitySessions = useMemo(
    () =>
      sessions.filter(
        (s) => slotFacilityMap.get(s.slot) === selectedFacilityId,
      ),
    [sessions, slotFacilityMap, selectedFacilityId],
  );
  const facilityReservations = useMemo(
    () =>
      reservations.filter(
        (r) => slotFacilityMap.get(r.slot) === selectedFacilityId,
      ),
    [reservations, slotFacilityMap, selectedFacilityId],
  );
  const facilityHistory = useMemo(
    () =>
      history.filter((h) => slotFacilityMap.get(h.slot) === selectedFacilityId),
    [history, slotFacilityMap, selectedFacilityId],
  );

  const counts = useMemo(() => {
    const c: Record<SlotStatus, number> = {
      available: 0,
      occupied: 0,
      reserved: 0,
      out_of_service: 0,
    };
    facilitySlots.forEach((s) => (c[s.status] += 1));
    return c;
  }, [facilitySlots]);

  const occupancyPct = facilitySlots.length
    ? Math.round((counts.occupied / facilitySlots.length) * 100)
    : 0;
  const revenueToday = facilityHistory
    .filter((h) => h.paid)
    .reduce((sum, h) => sum + (h.amount ?? 0), 0);

  const facilityZones = selectedFacility.zones;
  const shownSlots =
    zoneFilter === "ALL"
      ? facilitySlots
      : facilitySlots.filter((s) => s.zone === zoneFilter);

  function firstAvailable(): Slot | undefined {
    if (manualSlot)
      return facilitySlots.find(
        (s) => s.id === manualSlot.id && s.status === "available",
      );
    return facilitySlots.find((s) => s.status === "available");
  }

  function handleManualAssign(slot: Slot) {
    setManualSlot(slot);
    setSelectedSlot(null);
    setActiveNav("facility");
    setTimeout(() => {
      entryFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function extendReservation(res: Reservation, extraHours: number) {
    setReservations((prev) =>
      prev.map((r) =>
        r.id === res.id ? { ...r, hours: r.hours + extraHours } : r,
      ),
    );
  }

  function cancelReservation(res: Reservation) {
    setReservations((prev) => prev.filter((r) => r.id !== res.id));
    setSlots((prev) =>
      prev.map((s) =>
        s.id === res.slot ? { ...s, status: "available", plate: undefined } : s,
      ),
    );
    setSelectedSlot(null);
  }

  function approveReservation(res: Reservation) {
    const id = "TCK-" + (20510 + sessions.length + 1);
    const session: Session = {
      id,
      accountUsername: res.accountUsername,
      plate: res.plate,
      vehicle: res.vehicle,
      driver: res.driver,
      slot: res.slot,
      entry: Date.now(),
      duration: res.hours,
      reservationId: res.id,
    };
    setSessions((prev) => [session, ...prev]);
    setSlots((prev) =>
      prev.map((s) =>
        s.id === res.slot ? { ...s, status: "occupied", plate: res.plate } : s,
      ),
    );
    setReservations((prev) => prev.filter((r) => r.id !== res.id));
    setSelectedSlot(null);
    addNotification(res.accountUsername, {
      type: "approval",
      title: "Reservation Approved",
      body: `Your reservation ${res.id} for slot ${res.slot} has been approved by staff. You are now checked in — welcome to ${selectedFacility.name}!`,
      reservationId: res.id,
    });
  }

  function recordEntry(e: React.FormEvent) {
    e.preventDefault();
    const slot = firstAvailable();
    if (!plate.trim() || !slot) return;
    const id = "TCK-" + (20510 + sessions.length + 1);
    const session: Session = {
      id,
      plate: plate.trim().toUpperCase(),
      vehicle,
      driver: driver.trim() || "Walk-in",
      slot: slot.id,
      entry: Date.now(),
    };
    setSessions((prev) => [session, ...prev]);
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slot.id
          ? { ...s, status: "occupied", plate: session.plate }
          : s,
      ),
    );
    setTicket(session);
    setManualSlot(null);
    setPlate("");
    setDriver("");
  }

  function recordExit(session: Session) {
    const exit = Date.now();
    const amount = computeFee(session.vehicle, session.entry, exit);
    const closed: Session = { ...session, exit, amount, paid: true };
    setSessions((prev) => prev.filter((s) => s.id !== session.id));
    setHistory((prev) => [closed, ...prev]);
    setSlots((prev) =>
      prev.map((s) =>
        s.id === session.slot
          ? { ...s, status: "available", plate: undefined }
          : s,
      ),
    );
  }

  type NavSection =
    | "facility"
    | "map"
    | "sessions"
    | "reservations"
    | "history";
  const navItems: { id: NavSection; label: string; badge?: string }[] = [
    { id: "facility", label: "Facility Control" },
    { id: "map", label: "Slot Occupancy Map" },
    {
      id: "sessions",
      label: "Active Parking Sessions",
      badge:
        facilitySessions.length > 0
          ? String(facilitySessions.length)
          : undefined,
    },
    {
      id: "reservations",
      label: "Parking Reservations",
      badge:
        facilityReservations.length > 0
          ? String(facilityReservations.length)
          : undefined,
    },
    { id: "history", label: "Payments & Parking History" },
  ];

  return (
    <div className="flex flex-1 overflow-hidden flex-row-reverse">
      {/* ── Right navigation sidebar ── */}
      <nav
        className={`flex shrink-0 flex-col border-l border-line bg-white transition-all duration-300 h-full ${navOpen ? "w-56" : "w-12"}`}
      >
        <button
          onClick={onNavToggle}
          className={`flex items-center gap-3 border-b border-line px-3 py-4 transition-colors hover:bg-paper ${navOpen ? "w-full" : "justify-center"}`}
          title={navOpen ? "Close menu" : "Open menu"}
        >
          <div className="flex shrink-0 flex-col gap-1.5">
            {navOpen ? (
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
          {navOpen && (
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-ink-soft">
              Staff
            </span>
          )}
        </button>

        {navOpen ? (
          <>
            <ul className="py-2">
              {navItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveNav(item.id)}
                    className={`flex w-full items-center justify-between px-5 py-2.5 text-left transition-colors ${
                      activeNav === item.id
                        ? "border-r-2 border-ink bg-paper font-bold text-ink"
                        : "border-r-2 border-transparent text-ink-soft hover:bg-paper/60 hover:text-ink"
                    }`}
                  >
                    <span className="font-mono text-[12px] leading-snug">
                      {item.label}
                    </span>
                    {item.badge && (
                      <span
                        className={`ml-2 shrink-0 px-1.5 py-px font-mono text-[10px] font-bold ${activeNav === item.id ? "bg-ink text-paper" : "bg-line text-ink-soft"}`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-auto border-t border-line px-5 py-4 space-y-2">
              <div>
                <div className="font-mono text-[11px] font-bold text-ink">
                  {displayName}
                </div>
              </div>
              <button
                onClick={onLogout}
                className="w-full border border-line py-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-soft transition-colors hover:border-signal hover:text-signal"
              >
                Log out
              </button>
            </div>
          </>
        ) : (
          <ul className="flex flex-1 flex-col items-center gap-1 py-14">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveNav(item.id)}
                  title={item.label}
                  className={`relative flex size-8 items-center justify-center transition-colors ${
                    activeNav === item.id
                      ? "bg-ink text-paper"
                      : "text-ink-soft hover:bg-paper"
                  }`}
                >
                  <span className="font-mono text-[10px] font-bold">
                    {item.label[0]}
                  </span>
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

      {/* ── Main content area ── */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        {/* ── Facility selector (hidden when staff is assigned to one facility) ── */}
        {isLocked ? (
          <div className="mb-6 border border-line bg-ink px-4 py-3">
            <div className="font-display text-[11px] font-bold uppercase tracking-wide leading-tight text-paper">
              {selectedFacility.name}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-paper/60">
              {selectedFacility.zones.length} zones · {selectedFacility.total}{" "}
              slots · Assigned facility
            </div>
          </div>
        ) : (
          <div className="mb-6 flex flex-wrap items-center gap-px border border-line bg-line">
            {facilities.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFacilityId(f.id)}
                className={`flex-1 min-w-[120px] px-4 py-3 text-left transition-colors ${
                  selectedFacilityId === f.id
                    ? "bg-ink text-paper"
                    : "bg-white text-ink-soft hover:bg-paper hover:text-ink"
                }`}
              >
                <div className="font-display text-[11px] font-bold uppercase tracking-wide leading-tight">
                  {f.name}
                </div>
                <div className="mt-0.5 font-mono text-[10px] opacity-70">
                  {f.zones.length} zones · {f.total} slots
                </div>
              </button>
            ))}
          </div>
        )}

        {/* KPI row */}
        <div className="mb-8 grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
          <Kpi
            label="Total Slots"
            value={String(facilitySlots.length)}
            sub={`${facilitySlots.length > 0 ? facilityZones.length : 0} zones · ${facilityZones.join("–")}`}
          />
          <Kpi
            label="Available Now"
            value={String(counts.available)}
            sub={`${counts.reserved} reserved`}
            accent="available"
          />
          <Kpi
            label="Occupancy"
            value={`${occupancyPct}%`}
            sub={`${counts.occupied} vehicles parked`}
            accent="signal"
          />
          <Kpi
            label="Revenue Today"
            value={peso(revenueToday)}
            sub={`${facilityHistory.filter((h) => h.paid).length} paid transactions`}
          />
        </div>

        {/* ── Facility Control ── */}
        {activeNav === "facility" && (
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_360px]">
            <div ref={entryFormRef}>
              <Panel title={`Record Vehicle Entry — ${selectedFacility.name}`}>
                <form onSubmit={recordEntry} className="space-y-4 p-5">
                  <Field label="Plate Number">
                    <input
                      value={plate}
                      onChange={(e) => setPlate(e.target.value)}
                      placeholder="ABC 1234"
                      className="w-full border border-line bg-paper px-3 py-2 font-mono uppercase outline-none transition-colors focus:border-ink"
                    />
                  </Field>
                  <Field label="Driver Name">
                    <input
                      value={driver}
                      onChange={(e) => setDriver(e.target.value)}
                      placeholder="Optional"
                      className="w-full border border-line bg-paper px-3 py-2 outline-none transition-colors focus:border-ink"
                    />
                  </Field>
                  <Field label="Vehicle Type">
                    <div className="grid grid-cols-2 gap-px bg-line">
                      {VEHICLES.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setVehicle(v)}
                          className={`flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                            vehicle === v
                              ? "bg-ink text-paper"
                              : "bg-white hover:bg-paper"
                          }`}
                        >
                          <span>{v}</span>
                          <span className="font-mono text-[11px] opacity-70">
                            {peso(RATES[v])}/h
                          </span>
                        </button>
                      ))}
                    </div>
                  </Field>
                  <div className="border-t border-line pt-4">
                    {manualSlot ? (
                      <div className="mb-3 flex items-center justify-between border border-ink bg-paper px-3 py-2">
                        <div>
                          <Label>Manual slot selected</Label>
                          <div className="font-mono text-lg font-medium">
                            {manualSlot.id}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setManualSlot(null)}
                          className="font-mono text-[11px] uppercase tracking-wide text-ink-soft hover:text-signal"
                        >
                          ✕ use auto
                        </button>
                      </div>
                    ) : (
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <Label>Auto-assigned slot</Label>
                          <div className="font-mono text-lg font-medium">
                            {facilitySlots.find((s) => s.status === "available")
                              ?.id ?? "FULL"}
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-ink-soft">
                          or pick a slot on the map
                        </span>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={!firstAvailable() || !plate.trim()}
                      className="w-full bg-signal py-3 font-display text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-signal-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
                    >
                      Issue Ticket
                    </button>
                  </div>
                </form>
              </Panel>
            </div>

            <div className="space-y-8">
              {ticket && (
                <Ticket session={ticket} onClose={() => setTicket(null)} />
              )}
              <Panel title="Rate Card">
                <ul className="divide-y divide-line">
                  <li className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm">Automobile</span>
                    <span className="font-mono text-sm">
                      {peso(RATES["Automobile"])}{" "}
                      <span className="text-ink-soft">/ hour</span>
                    </span>
                  </li>
                  <li className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm">Motorcycle</span>
                    <span className="font-mono text-sm">
                      {peso(RATES["Motorcycle"])}{" "}
                      <span className="text-ink-soft">/ hour</span>
                    </span>
                  </li>
                </ul>
              </Panel>
            </div>
          </div>
        )}

        {/* ── Slot Occupancy Map ── */}
        {activeNav === "map" && (
          <Panel
            title={`Slot Occupancy Map — ${selectedFacility.name}`}
            action={
              <div className="flex items-center gap-1">
                {["ALL", ...facilityZones].map((z) => (
                  <button
                    key={z}
                    onClick={() => setZoneFilter(z)}
                    className={`px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                      zoneFilter === z
                        ? "bg-ink text-paper"
                        : "text-ink-soft hover:bg-paper"
                    }`}
                  >
                    {z === "ALL" ? "All" : `Zone ${z}`}
                  </button>
                ))}
              </div>
            }
          >
            <div className="relative grid grid-cols-5 gap-px bg-line p-px sm:grid-cols-8 lg:grid-cols-10">
              {shownSlots.map((s) => (
                <SlotCell
                  key={s.id}
                  slot={s}
                  isSelected={selectedSlot?.id === s.id}
                  fromReservation={sessions.some(
                    (sess) => sess.slot === s.id && !!sess.reservationId,
                  )}
                  onClick={() =>
                    setSelectedSlot(selectedSlot?.id === s.id ? null : s)
                  }
                />
              ))}
            </div>
            {selectedSlot && (
              <SlotDetail
                slot={selectedSlot}
                session={
                  sessions.find((sess) => sess.slot === selectedSlot.id) ?? null
                }
                reservation={
                  reservations.find((r) => r.slot === selectedSlot.id) ?? null
                }
                onClose={() => setSelectedSlot(null)}
                onCheckout={(sess) => {
                  recordExit(sess);
                  setSelectedSlot(null);
                }}
                onManualAssign={handleManualAssign}
                onCancelReservation={cancelReservation}
                onApproveReservation={approveReservation}
                onExtendReservation={extendReservation}
                onReportDamage={(s) => {
                  addDamageReport(s.id, selectedFacility.name);
                  setSelectedSlot(null);
                }}
              />
            )}
            <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-3">
              <Legend status="available" text="Available" />
              <Legend status="occupied" text="Occupied" />
              <Legend status="reserved" text="Reserved" />
              <Legend status="out_of_service" text="Out of Service" />
              <span className="flex items-center gap-2 text-xs text-ink-soft">
                <span className="inline-block size-2 rounded-full bg-blue-500" />
                PWD Slot
              </span>
            </div>
          </Panel>
        )}

        {/* ── Active Parking Sessions ── */}
        {activeNav === "sessions" && (
          <Panel
            title={`Active Parking Sessions — ${selectedFacility.name}`}
            action={<Label>{facilitySessions.length} in facility</Label>}
          >
            <div className="border-b border-line px-5 py-3">
              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <circle
                    cx="6.5"
                    cy="6.5"
                    r="5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M10.5 10.5L14 14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  placeholder="Search ticket, plate, driver, vehicle type…"
                  className="w-full border border-line bg-paper py-2 pl-9 pr-9 font-mono text-sm outline-none transition-colors focus:border-ink placeholder:text-ink-soft/60"
                />
                {sessionSearch && (
                  <button
                    onClick={() => setSessionSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-soft hover:text-signal"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <Th>Ticket</Th>
                    <Th>Plate</Th>
                    <Th>Vehicle</Th>
                    <Th>Slot</Th>
                    <Th>Entry</Th>
                    <Th>Duration</Th>
                    <Th className="text-right">Running Fee</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const q = sessionSearch.trim().toLowerCase();
                    const filtered = facilitySessions.filter(
                      (s) =>
                        !q ||
                        s.id.toLowerCase().includes(q) ||
                        s.plate.toLowerCase().includes(q) ||
                        s.driver.toLowerCase().includes(q) ||
                        s.vehicle.toLowerCase().includes(q),
                    );
                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-5 py-8 text-center font-mono text-sm text-ink-soft"
                          >
                            {q
                              ? `No results for "${sessionSearch.trim()}"`
                              : "No vehicles currently parked."}
                          </td>
                        </tr>
                      );
                    }
                    return filtered.map((s) => {
                      const nowMs = Date.now();
                      return (
                        <tr
                          key={s.id}
                          className="border-b border-line/70 last:border-0 hover:bg-paper/60"
                        >
                          <Td className="font-mono text-xs">{s.id}</Td>
                          <Td className="font-mono font-medium">{s.plate}</Td>
                          <Td className="text-ink-soft">{s.vehicle}</Td>
                          <Td className="font-mono">{s.slot}</Td>
                          <Td className="font-mono text-xs text-ink-soft">
                            {clock(s.entry)}
                          </Td>
                          <Td className="font-mono">
                            {durationLabel(s.entry, nowMs)}
                          </Td>
                          <Td className="text-right font-mono font-medium">
                            {peso(computeFee(s.vehicle, s.entry, nowMs))}
                          </Td>
                          <Td className="text-right">
                            <button
                              onClick={() => recordExit(s)}
                              className="border border-ink bg-white px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors hover:bg-ink hover:text-paper"
                            >
                              Check-out
                            </button>
                          </Td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* ── Parking Reservations ── */}
        {activeNav === "reservations" && (
          <Panel
            title={`Parking Reservations — ${selectedFacility.name}`}
            action={<Label>{facilityReservations.length} reserved</Label>}
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <Th>Reservation ID</Th>
                    <Th>Plate</Th>
                    <Th>Vehicle</Th>
                    <Th>Driver</Th>
                    <Th>Slot</Th>
                    <Th>Date</Th>
                    <Th>Arrival Time</Th>
                    <Th>Duration</Th>
                    <Th className="text-right">Total Paid</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {facilityReservations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-5 py-8 text-center font-mono text-sm text-ink-soft"
                      >
                        No reservations for this facility.
                      </td>
                    </tr>
                  ) : (
                    facilityReservations.map((r) => {
                      const reservationMs = new Date(
                        r.date + "T" + r.time,
                      ).getTime();
                      const isPast = reservationMs < Date.now();
                      return (
                        <tr
                          key={r.id}
                          className={`border-b border-line/70 last:border-0 hover:bg-paper/60 ${isPast ? "opacity-60" : ""}`}
                        >
                          <Td className="font-mono text-xs">{r.id}</Td>
                          <Td className="font-mono font-medium">{r.plate}</Td>
                          <Td className="text-ink-soft">{r.vehicle}</Td>
                          <Td>{r.driver}</Td>
                          <Td className="font-mono">{r.slot}</Td>
                          <Td className="font-mono text-xs">
                            {new Date(r.date + "T00:00").toLocaleDateString(
                              "en-PH",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          </Td>
                          <Td className="font-mono text-xs">
                            {(() => {
                              const [h, m] = r.time.split(":");
                              const d = new Date();
                              d.setHours(+h, +m);
                              return d.toLocaleTimeString("en-PH", {
                                hour: "numeric",
                                minute: "2-digit",
                                hour12: true,
                              });
                            })()}
                          </Td>
                          <Td className="font-mono text-xs">{r.hours}h</Td>
                          <Td className="text-right font-mono font-medium text-available">
                            {peso(RATES[r.vehicle] * r.hours)}
                          </Td>
                          <Td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isPast && (
                                <span className="font-mono text-[10px] uppercase tracking-wide text-signal">
                                  Overdue
                                </span>
                              )}
                              <button
                                onClick={() => approveReservation(r)}
                                className="border border-available bg-white px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-available transition-colors hover:bg-available hover:text-white"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => cancelReservation(r)}
                                className="border border-signal bg-white px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-signal transition-colors hover:bg-signal hover:text-white"
                              >
                                Cancel
                              </button>
                            </div>
                          </Td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* ── Payments & Parking History ── */}
        {activeNav === "history" && (
          <Panel
            title={`Payments & Parking History — ${selectedFacility.name}`}
            action={<Label>Latest transactions</Label>}
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <Th>Ticket</Th>
                    <Th>Plate</Th>
                    <Th>Slot</Th>
                    <Th>Duration</Th>
                    <Th>Payment</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {facilityHistory.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-8 text-center font-mono text-sm text-ink-soft"
                      >
                        No transactions for this facility.
                      </td>
                    </tr>
                  ) : (
                    facilityHistory.map((h) => (
                      <tr
                        key={h.id}
                        className="border-b border-line/70 last:border-0 hover:bg-paper/60"
                      >
                        <Td className="font-mono text-xs">{h.id}</Td>
                        <Td className="font-mono font-medium">{h.plate}</Td>
                        <Td className="font-mono">{h.slot}</Td>
                        <Td className="font-mono text-ink-soft">
                          {h.exit ? durationLabel(h.entry, h.exit) : "—"}
                        </Td>
                        <Td>
                          <span
                            className={`font-mono text-[11px] uppercase tracking-wide ${h.paid ? "text-available" : "text-signal"}`}
                          >
                            {h.paid ? "Paid" : "Unpaid"}
                          </span>
                        </Td>
                        <Td className="text-right font-mono font-medium">
                          {peso(h.amount ?? 0)}
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>

      {/* ── Arrival alert popups ── */}
      {arrivalAlerts.length > 0 && (
        <div
          className="fixed bottom-6 right-6 z-50 flex flex-col gap-3"
          style={{ maxWidth: 360 }}
        >
          {arrivalAlerts.map((r) => {
            const fmtT = (t: string) => {
              const [h, m] = t.split(":");
              const d = new Date();
              d.setHours(+h, +m);
              return d.toLocaleTimeString("en-PH", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
            };
            return (
              <div
                key={r.id}
                className="border-l-4 border-signal bg-white shadow-2xl"
              >
                <div className="flex items-center justify-between bg-signal px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white">
                      ⚑
                    </span>
                    <span className="font-display text-sm font-bold uppercase tracking-wide text-white">
                      Driver Arriving — 30 seconds
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      setArrivalAlerts((prev) =>
                        prev.filter((a) => a.id !== r.id),
                      )
                    }
                    className="font-mono text-xs text-white/70 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-px bg-line">
                  <AlertCell label="Reservation" value={r.id} mono />
                  <AlertCell label="Slot" value={r.slot} mono accent />
                  <AlertCell label="Driver" value={r.driver} />
                  <AlertCell label="Plate" value={r.plate} mono />
                  <AlertCell label="Vehicle" value={r.vehicle} />
                  <AlertCell label="Entry Time" value={fmtT(r.time)} mono />
                </div>
                <div className="flex gap-px bg-line">
                  <button
                    onClick={() => {
                      approveReservation(r);
                      setArrivalAlerts((prev) =>
                        prev.filter((a) => a.id !== r.id),
                      );
                    }}
                    className="flex-1 bg-available py-2.5 font-mono text-[11px] font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-80"
                  >
                    ✓ Approve Arrival
                  </button>
                  <button
                    onClick={() =>
                      setArrivalAlerts((prev) =>
                        prev.filter((a) => a.id !== r.id),
                      )
                    }
                    className="bg-white px-4 py-2.5 font-mono text-[11px] uppercase tracking-wide text-ink-soft transition-colors hover:text-ink"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function AlertCell({
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
    <div className="bg-white px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
        {label}
      </div>
      <div
        className={`mt-0.5 text-sm font-medium ${mono ? "font-mono" : ""} ${accent ? "text-signal" : "text-ink"}`}
      >
        {value}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "signal" | "available";
}) {
  const accentClass =
    accent === "signal"
      ? "text-signal"
      : accent === "available"
        ? "text-available"
        : "text-ink";
  return (
    <div className="bg-white p-5">
      <Label>{label}</Label>
      <div
        className={`mt-2 font-display text-4xl font-extrabold tracking-tight ${accentClass}`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-ink-soft">{sub}</div>
    </div>
  );
}

function SlotCell({
  slot,
  isSelected,
  fromReservation,
  onClick,
}: {
  slot: Slot;
  isSelected: boolean;
  fromReservation?: boolean;
  onClick: () => void;
}) {
  const bg: Record<SlotStatus, string> = {
    available: slot.isPwd
      ? "bg-blue-50 hover:bg-blue-100"
      : "bg-available-soft hover:bg-available/20",
    occupied: fromReservation
      ? "bg-reserved-soft hover:bg-reserved-soft"
      : "bg-white hover:bg-paper",
    reserved: "bg-reserved-soft hover:bg-reserved/20",
    out_of_service: "bg-line opacity-60 hover:opacity-80",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex aspect-square flex-col justify-between p-2 text-left transition-colors focus:outline-none ${bg[slot.status]} ${isSelected ? "ring-2 ring-inset ring-ink" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`font-mono text-xs font-medium ${slot.status === "out_of_service" ? "line-through text-ink-soft" : ""}`}
        >
          {slot.id}
        </span>
        <div className="flex items-center gap-0.5">
          {slot.isPwd && (
            <span
              className="inline-block size-2 rounded-full bg-blue-500"
              title="PWD slot"
            />
          )}
          <StatusDot status={slot.status} />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <span className="truncate font-mono text-[10px] text-ink-soft">
          {slot.status === "out_of_service"
            ? "OOS"
            : (slot.plate ?? (slot.status === "reserved" ? "RSVD" : "—"))}
        </span>
        {slot.isPwd && (
          <span className="font-mono text-[8px] font-bold text-blue-500">
            PWD
          </span>
        )}
      </div>
      {isSelected && (
        <span className="absolute bottom-0 left-1/2 h-1 w-3 -translate-x-1/2 translate-y-full bg-ink" />
      )}
    </button>
  );
}

function SlotDetail({
  slot,
  session,
  reservation,
  onClose,
  onCheckout,
  onManualAssign,
  onCancelReservation,
  onApproveReservation,
  onExtendReservation,
  onReportDamage,
}: {
  slot: Slot;
  session: Session | null;
  reservation: Reservation | null;
  onClose: () => void;
  onCheckout: (s: Session) => void;
  onManualAssign: (s: Slot) => void;
  onCancelReservation: (r: Reservation) => void;
  onApproveReservation: (r: Reservation) => void;
  onExtendReservation: (r: Reservation, extraHours: number) => void;
  onReportDamage: (slot: Slot) => void;
}) {
  const now = Date.now();
  const [extending, setExtending] = useState(false);
  const [extendHours, setExtendHours] = useState(1);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const statusLabel: Record<SlotStatus, string> = {
    available: "Available",
    occupied: "Occupied",
    reserved: "Reserved",
    out_of_service: "Out of Service",
  };

  return (
    <div className="border-t border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-base font-bold">{slot.id}</span>
          <StatusDot status={slot.status} />
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
            {statusLabel[slot.status]}
          </span>
          {slot.isPwd && (
            <span className="border border-blue-400 px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-wide text-blue-500">
              PWD
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {slot.status !== "out_of_service" && (
            <button
              onClick={() => onReportDamage(slot)}
              className="font-mono text-[10px] uppercase tracking-wide text-signal/70 hover:text-signal transition-colors"
              title="Report this slot as damaged — notifies the administrator"
            >
              ⚠ Report Damage
            </button>
          )}
          <button
            onClick={onClose}
            className="font-mono text-xs text-ink-soft transition-colors hover:text-signal"
          >
            ✕ close
          </button>
        </div>
      </div>

      {slot.status === "occupied" ? (
        session ? (
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
            <InfoCell label="Ticket ID" value={session.id} mono />
            <InfoCell label="Plate No." value={session.plate} mono accent />
            <InfoCell label="Vehicle Type" value={session.vehicle} />
            <InfoCell label="Driver" value={session.driver} />
            <InfoCell label="Entry Time" value={clock(session.entry)} mono />
            <InfoCell
              label="Duration"
              value={durationLabel(session.entry, now)}
              mono
            />
            <InfoCell
              label="Running Fee"
              value={peso(computeFee(session.vehicle, session.entry, now))}
              mono
              accent
            />
            <div className="flex items-end justify-end bg-white p-4">
              <button
                onClick={() => onCheckout(session)}
                className="border border-ink bg-white px-4 py-2 font-mono text-[11px] uppercase tracking-wide transition-colors hover:bg-signal hover:border-signal hover:text-white"
              >
                Check-out
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 px-5 py-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper">
              <span className="font-mono text-sm text-ink-soft">!</span>
            </div>
            <div>
              <div className="font-mono text-sm font-medium">
                No active session found
              </div>
              <p className="text-xs text-ink-soft">
                Slot marked occupied but no session record linked.
              </p>
            </div>
          </div>
        )
      ) : slot.status === "reserved" ? (
        reservation ? (
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
            <InfoCell label="Reservation ID" value={reservation.id} mono />
            <InfoCell label="Plate No." value={reservation.plate} mono accent />
            <InfoCell label="Vehicle Type" value={reservation.vehicle} />
            <InfoCell label="Driver" value={reservation.driver} />
            <InfoCell
              label="Date"
              value={new Date(reservation.date + "T00:00").toLocaleDateString(
                "en-PH",
                { month: "short", day: "numeric", year: "numeric" },
              )}
              mono
            />
            <InfoCell
              label="Arrival Time"
              value={(() => {
                const [h, m] = reservation.time.split(":");
                const d = new Date();
                d.setHours(+h, +m);
                return d.toLocaleTimeString("en-PH", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                });
              })()}
              mono
            />
            <InfoCell label="Duration" value={`${reservation.hours}h`} mono />
            <div className="flex flex-col justify-center bg-white px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
                Total Paid
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-sm font-bold">
                  {peso(RATES[reservation.vehicle] * reservation.hours)}
                </span>
                <span className="bg-available px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-wide text-paper">
                  Paid ✓
                </span>
              </div>
            </div>
            {(() => {
              const arrMs = new Date(
                reservation.date + "T" + reservation.time,
              ).getTime();
              const exitMs = arrMs + reservation.hours * 3_600_000;
              const exitStr = new Date(exitMs).toLocaleTimeString("en-PH", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
              const exitDate = new Date(exitMs).toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric",
              });
              return (
                <div className="col-span-2 flex items-center justify-between bg-paper px-5 py-3 sm:col-span-4">
                  <div>
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
                      Exit Time
                    </span>
                    <div className="font-mono text-xl font-bold tracking-tight">
                      {exitStr}{" "}
                      <span className="font-mono text-sm font-normal text-ink-soft">
                        · {exitDate}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-ink-soft">
                    Entry{" "}
                    {(() => {
                      const d = new Date();
                      const [h, m] = reservation.time.split(":");
                      d.setHours(+h, +m);
                      return d.toLocaleTimeString("en-PH", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });
                    })()}{" "}
                    + {reservation.hours}h
                  </span>
                </div>
              );
            })()}
            {extending && (
              <div className="col-span-2 border-t border-line bg-paper sm:col-span-4">
                <div className="flex items-center justify-between border-b border-line px-5 py-3">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wide">
                    Extend Reservation — {reservation.id}
                  </span>
                  <button
                    onClick={() => {
                      setExtending(false);
                      setExtendHours(1);
                    }}
                    className="font-mono text-[10px] text-ink-soft hover:text-signal"
                  >
                    ✕ cancel
                  </button>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <Label>Additional hours</Label>
                    <div className="mt-2 flex gap-px bg-line">
                      {[1, 2, 3, 4].map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setExtendHours(h)}
                          className={`flex-1 py-2.5 font-mono text-sm font-bold transition-colors ${extendHours === h ? "bg-ink text-paper" : "bg-white hover:bg-paper"}`}
                        >
                          +{h}h
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-line">
                    <div className="bg-white px-4 py-3">
                      <Label>New duration</Label>
                      <div className="font-mono text-lg font-bold">
                        {reservation.hours + extendHours}h total
                      </div>
                    </div>
                    <div className="bg-white px-4 py-3">
                      <Label>Extension fee</Label>
                      <div className="font-mono text-lg font-bold text-available">
                        {peso(RATES[reservation.vehicle] * extendHours)}
                      </div>
                    </div>
                  </div>
                  <p className="font-mono text-[10px] text-ink-soft">
                    Collect {peso(RATES[reservation.vehicle] * extendHours)}{" "}
                    cash from the driver before approving.
                  </p>
                  <button
                    onClick={() => {
                      onExtendReservation(reservation, extendHours);
                      setExtending(false);
                      setExtendHours(1);
                    }}
                    className="w-full bg-ink py-2.5 font-display text-sm font-bold uppercase tracking-wide text-paper transition-colors hover:bg-available"
                  >
                    ✓ Confirm Extension — Payment Received
                  </button>
                </div>
              </div>
            )}
            <div className="col-span-2 flex items-center justify-center gap-3 border-t border-line bg-white p-4 sm:col-span-4">
              <button
                onClick={() => onApproveReservation(reservation)}
                className="border border-available bg-available px-6 py-2.5 font-mono text-[11px] uppercase tracking-wide text-white transition-colors hover:opacity-80"
              >
                ✓ Approve — Customer Arrived
              </button>
              <button
                onClick={() => {
                  setExtending((v) => !v);
                  setExtendHours(1);
                }}
                className="border border-ink bg-white px-6 py-2.5 font-mono text-[11px] uppercase tracking-wide text-ink transition-colors hover:bg-ink hover:text-paper"
              >
                ↑ Extend Time
              </button>
              <button
                onClick={() => onCancelReservation(reservation)}
                className="border border-signal bg-white px-5 py-2.5 font-mono text-[11px] uppercase tracking-wide text-signal transition-colors hover:bg-signal hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-6 text-center">
            <div className="font-mono text-sm font-medium text-ink-soft uppercase tracking-wide">
              Reserved Slot
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              No reservation record linked to this slot.
            </p>
          </div>
        )
      ) : slot.status === "out_of_service" ? (
        <div className="flex items-center gap-4 px-5 py-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-line">
            <span className="font-mono text-sm font-bold text-ink-soft">!</span>
          </div>
          <div>
            <div className="font-mono text-sm font-medium uppercase tracking-wide">
              Slot Out of Service
            </div>
            <p className="text-xs text-ink-soft mt-1">
              This slot is currently unavailable. Contact the administrator to
              restore it.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-available-soft">
              <span className="text-available text-lg">✓</span>
            </div>
            <div>
              <div className="font-mono text-sm font-medium">
                Slot {slot.id} — Available
              </div>
              <p className="text-xs text-ink-soft">
                Empty. Assign a vehicle here.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onManualAssign(slot);
              }}
              className="shrink-0 border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-paper transition-colors hover:bg-signal hover:border-signal"
            >
              Assign vehicle →
            </button>
          </div>
        </div>
      )}
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
    <div className="bg-white px-5 py-4">
      <Label>{label}</Label>
      <div
        className={`mt-1 text-sm font-medium ${mono ? "font-mono" : ""} ${accent ? "text-signal" : "text-ink"}`}
      >
        {value}
      </div>
    </div>
  );
}

function Legend({ status, text }: { status: SlotStatus; text: string }) {
  return (
    <span className="flex items-center gap-2 text-xs text-ink-soft">
      <StatusDot status={status} />
      {text}
    </span>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-ink-soft ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-5 py-3 align-middle ${className}`}>{children}</td>;
}

function Field({
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

function Ticket({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  return (
    <div className="border-2 border-dashed border-ink bg-white">
      <div className="flex items-center justify-between border-b border-dashed border-ink px-5 py-3">
        <span className="font-display text-sm font-bold uppercase tracking-[0.14em]">
          Digital Ticket
        </span>
        <button
          onClick={onClose}
          className="font-mono text-xs text-ink-soft hover:text-signal"
        >
          ✕ dismiss
        </button>
      </div>
      <div className="space-y-3 p-5">
        <div className="font-mono text-3xl font-bold tracking-tight text-signal">
          {session.id}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <TicketRow k="Plate" v={session.plate} />
          <TicketRow k="Vehicle" v={session.vehicle} />
          <TicketRow k="Slot" v={session.slot} />
          <TicketRow k="Entry" v={clock(session.entry)} />
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
          <span className="text-xs text-ink-soft">Driver</span>
          <span className="font-medium">{session.driver}</span>
        </div>
      </div>
    </div>
  );
}

function TicketRow({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <Label>{k}</Label>
      <div className="font-mono font-medium">{v}</div>
    </div>
  );
}
