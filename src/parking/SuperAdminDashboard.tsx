import React, { useMemo, useState } from "react";
import {
  RATES,
  facilities,
  peso,
  type Reservation,
  type Session,
  type Slot,
  type SlotStatus,
} from "./data";
import { StatusDot } from "./ui";
import type { DamageReport } from "../App";

type NavSection =
  | "overview"
  | "slots"
  | "users"
  | "reservations"
  | "history"
  | "reports";

interface Account {
  username: string;
  email?: string;
  role: string;
  displayName: string;
  contact?: string;
}

interface Props {
  slots: Slot[];
  setSlots: React.Dispatch<React.SetStateAction<Slot[]>>;
  sessions: Session[];
  history: Session[];
  reservations: Reservation[];
  accounts: Account[];
  onLogout: () => void;
  displayName: string;
  damageReports: DamageReport[];
  onResolveDamageReport: (id: string) => void;
}

const NAV_ITEMS: { id: NavSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "slots", label: "Facility Slots" },
  { id: "users", label: "Registered Users" },
  { id: "reservations", label: "Reservations" },
  { id: "history", label: "Parking History" },
  { id: "reports", label: "Reports" },
];

function AdminSlotCell({ slot }: { slot: Slot }) {
  const bg: Record<SlotStatus, string> = {
    available: slot.isPwd ? "bg-blue-50" : "bg-available-soft",
    occupied: "bg-white",
    reserved: "bg-reserved-soft",
    out_of_service: "bg-line opacity-60",
  };
  return (
    <div
      className={`relative flex aspect-square flex-col justify-between p-2 ${bg[slot.status]}`}
      title={`${slot.id} — ${slot.status === "out_of_service" ? "Out of Service" : slot.status}`}
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
    </div>
  );
}

export default function SuperAdminDashboard({
  slots,
  setSlots,
  sessions,
  history,
  reservations,
  accounts,
  onLogout,
  displayName,
  damageReports,
  onResolveDamageReport,
}: Props) {
  const [activeNav, setActiveNav] = useState<NavSection>("overview");
  const [navOpen, setNavOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>(
    facilities[0].id,
  );

  const slotFacilityMap = useMemo(
    () => new Map(slots.map((s) => [s.id, s.facilityId])),
    [slots],
  );

  const selectedFacility =
    facilities.find((f) => f.id === selectedFacilityId) ?? facilities[0];

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

  const facilityZones = selectedFacility.zones;

  const shownSlots =
    zoneFilter === "ALL"
      ? facilitySlots
      : facilitySlots.filter((s) => s.zone === zoneFilter);

  const drivers = accounts.filter((a) => a.role === "driver");
  const staff = accounts.filter((a) => a.role === "admin");

  const totalRevenue = facilityHistory.reduce(
    (sum, s) => sum + (s.duration ? RATES[s.vehicle] * s.duration : 0),
    0,
  );
  const occupiedCount = facilitySlots.filter(
    (s) => s.status === "occupied",
  ).length;
  const reservedCount = facilitySlots.filter(
    (s) => s.status === "reserved",
  ).length;
  const availableCount = facilitySlots.filter(
    (s) => s.status === "available",
  ).length;
  const oosCount = facilitySlots.filter(
    (s) => s.status === "out_of_service",
  ).length;
  const occupancyPct = facilitySlots.length
    ? Math.round(((occupiedCount + reservedCount) / facilitySlots.length) * 100)
    : 0;

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  // The users nav section never filters by facility — accounts are system-wide
  const usersSection = activeNav === "users";

  return (
    <div className="flex flex-1 overflow-hidden flex-row-reverse">
      {/* ── Right sidebar nav ── */}
      <nav
        className={`flex shrink-0 flex-col border-l border-line bg-white transition-all duration-300 h-full ${navOpen ? "w-56" : "w-12"}`}
      >
        <button
          onClick={() => setNavOpen((v) => !v)}
          className={`flex items-center gap-3 border-b border-line px-3 py-4 transition-colors hover:bg-paper ${navOpen ? "w-full" : "justify-center"}`}
          title={navOpen ? "Collapse" : "Expand"}
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
              Admin
            </span>
          )}
        </button>

        {navOpen ? (
          <>
            <ul className="py-2">
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveNav(item.id)}
                    className={`flex w-full items-center px-5 py-2.5 text-left transition-colors ${
                      activeNav === item.id
                        ? "border-r-2 border-ink bg-paper font-bold text-ink"
                        : "border-r-2 border-transparent text-ink-soft hover:bg-paper/60 hover:text-ink"
                    }`}
                  >
                    <span className="font-mono text-[12px] leading-snug">
                      {item.label}
                    </span>
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
          <ul className="flex flex-1 flex-col items-center gap-1 py-4">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveNav(item.id)}
                  title={item.label}
                  className={`flex size-8 items-center justify-center font-mono text-[10px] font-bold transition-colors ${
                    activeNav === item.id
                      ? "bg-ink text-paper"
                      : "text-ink-soft hover:bg-paper"
                  }`}
                >
                  {item.label[0]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        {/* ── Facility selector (hidden on Users section) ── */}
        {!usersSection && (
          <div className="mb-6 flex flex-wrap items-center gap-px border border-line bg-line">
            {facilities.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setSelectedFacilityId(f.id);
                  setZoneFilter("ALL");
                }}
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

        {/* Overview */}
        {activeNav === "overview" && (
          <div className="space-y-8">
            <SectionHeader title="Overview" subtitle={selectedFacility.name} />

            <div className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
              <KpiTile
                label="Total Slots"
                value={String(facilitySlots.length)}
              />
              <KpiTile
                label="Occupied"
                value={String(occupiedCount)}
                accent="text-signal"
              />
              <KpiTile
                label="Reserved"
                value={String(reservedCount)}
                accent="text-reserved"
              />
              <KpiTile
                label="Available"
                value={String(availableCount)}
                accent="text-available"
              />
              <KpiTile label="Occupancy Rate" value={`${occupancyPct}%`} />
              <KpiTile
                label="Active Sessions"
                value={String(facilitySessions.length)}
              />
              <KpiTile
                label="Pending Reservations"
                value={String(facilityReservations.length)}
              />
              <KpiTile label="Total Revenue" value={peso(totalRevenue)} />
            </div>

            <div className="border border-line bg-white">
              <TableHeader
                title="Active Sessions"
                count={facilitySessions.length}
              />
              <TableWrap>
                <Thead
                  cols={[
                    "Session ID",
                    "Driver",
                    "Slot",
                    "Vehicle",
                    "Plate",
                    "Entry",
                    "Duration",
                  ]}
                />
                <tbody className="divide-y divide-line">
                  {facilitySessions.length === 0 ? (
                    <EmptyRow cols={7} msg="No active sessions" />
                  ) : (
                    facilitySessions.map((s) => (
                      <tr key={s.id} className="hover:bg-paper/60">
                        <Td bold>{s.id}</Td>
                        <Td>{s.driver}</Td>
                        <Td>{s.slot}</Td>
                        <Td>{s.vehicle}</Td>
                        <Td>{s.plate}</Td>
                        <Td>{fmtTime(s.entry)}</Td>
                        <Td>{s.duration ? `${s.duration}h` : "Open"}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </TableWrap>
            </div>

            <div className="border border-line bg-white">
              <TableHeader
                title="Pending Reservations"
                count={facilityReservations.length}
              />
              <TableWrap>
                <Thead
                  cols={[
                    "Res. ID",
                    "Driver",
                    "Slot",
                    "Vehicle",
                    "Plate",
                    "Date",
                    "Arrival",
                    "Hours",
                  ]}
                />
                <tbody className="divide-y divide-line">
                  {facilityReservations.length === 0 ? (
                    <EmptyRow cols={8} msg="No pending reservations" />
                  ) : (
                    facilityReservations.map((r) => (
                      <tr key={r.id} className="hover:bg-paper/60">
                        <Td bold>{r.id}</Td>
                        <Td>{r.driver}</Td>
                        <Td>{r.slot}</Td>
                        <Td>{r.vehicle}</Td>
                        <Td>{r.plate}</Td>
                        <Td>{r.date}</Td>
                        <Td>{r.time}</Td>
                        <Td>{r.hours}h</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </TableWrap>
            </div>
          </div>
        )}

        {/* Facility Slots */}
        {activeNav === "slots" && (
          <div className="space-y-0 border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <div>
                <span className="font-display text-sm font-bold uppercase tracking-[0.14em]">
                  {selectedFacility
                    ? `${selectedFacility.name} — Slot Map`
                    : "All Facilities — Slot Map"}
                </span>
                <span className="ml-3 font-mono text-[11px] text-ink-soft">
                  {facilitySlots.length} total · {availableCount} available ·{" "}
                  {occupiedCount} occupied · {reservedCount} reserved
                  {oosCount > 0 ? ` · ${oosCount} OOS` : ""}
                </span>
              </div>
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
            </div>

            <div className="relative grid grid-cols-5 gap-px bg-line p-px sm:grid-cols-8 lg:grid-cols-10">
              {shownSlots.map((s) => (
                <AdminSlotCell key={s.id} slot={s} />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-3">
              {(
                [
                  "available",
                  "occupied",
                  "reserved",
                  "out_of_service",
                ] as SlotStatus[]
              ).map((st) => (
                <span
                  key={st}
                  className="flex items-center gap-2 text-xs text-ink-soft"
                >
                  <StatusDot status={st} />
                  {st === "out_of_service"
                    ? "Out of Service"
                    : st.charAt(0).toUpperCase() + st.slice(1)}
                </span>
              ))}
              <span className="flex items-center gap-2 text-xs text-ink-soft">
                <span className="inline-block size-2 rounded-full bg-blue-500" />
                PWD Slot
              </span>
            </div>

            <div className="border-t border-line">
              <div className="flex items-center justify-between px-5 py-3 border-b border-line">
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-soft">
                  Slot Details
                </span>
                <span className="font-mono text-[11px] font-bold text-ink">
                  {shownSlots.length}
                </span>
              </div>
              <TableWrap>
                <Thead
                  cols={[
                    "Slot ID",
                    "Zone",
                    "Facility",
                    "Status",
                    "Plate",
                    "Current Session",
                    "Driver",
                  ]}
                />
                <tbody className="divide-y divide-line">
                  {shownSlots.map((slot) => {
                    const sess = sessions.find((s) => s.slot === slot.id);
                    const fac = facilities.find(
                      (f) => f.id === slot.facilityId,
                    );
                    return (
                      <tr key={slot.id} className="hover:bg-paper/60">
                        <Td bold>{slot.id}</Td>
                        <Td>{slot.zone}</Td>
                        <Td muted>{fac?.name ?? "—"}</Td>
                        <td className="px-4 py-3">
                          <StatusBadge status={slot.status} />
                        </td>
                        <Td>{slot.plate ?? "—"}</Td>
                        <Td>{sess ? sess.id : "—"}</Td>
                        <Td>{sess ? sess.driver : "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            </div>
          </div>
        )}

        {/* Registered Users — always system-wide */}
        {activeNav === "users" && (
          <div className="space-y-6">
            <SectionHeader
              title="Registered Users"
              subtitle={`${accounts.length} total accounts · ${drivers.length} drivers · ${staff.length} staff`}
            />

            <div className="relative max-w-sm">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-ink-soft">
                ⌕
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or username…"
                className="w-full border border-line bg-paper py-2.5 pl-9 pr-3 font-mono text-sm outline-none transition-colors focus:border-ink"
              />
            </div>

            <div className="border border-line bg-white">
              <TableHeader title="Staff Accounts" count={staff.length} />
              <TableWrap>
                <Thead cols={["Username", "Display Name", "Email", "Role"]} />
                <tbody className="divide-y divide-line">
                  {staff.length === 0 ? (
                    <EmptyRow cols={4} msg="No staff accounts" />
                  ) : (
                    staff.map((a) => (
                      <tr key={a.username} className="hover:bg-paper/60">
                        <Td bold>{a.username}</Td>
                        <Td>{a.displayName}</Td>
                        <Td muted>{a.email ?? "—"}</Td>
                        <td className="px-4 py-3">
                          <span className="bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-paper">
                            Staff
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </TableWrap>
            </div>

            <div className="border border-line bg-white">
              <TableHeader title="Driver Accounts" count={drivers.length} />
              <TableWrap>
                <Thead
                  cols={[
                    "Username",
                    "Display Name",
                    "Email",
                    "Contact",
                    "Active Sessions",
                    "Completed",
                  ]}
                />
                <tbody className="divide-y divide-line">
                  {drivers
                    .filter(
                      (a) =>
                        !search ||
                        a.displayName
                          .toLowerCase()
                          .includes(search.toLowerCase()) ||
                        a.username.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((a) => {
                      const active = sessions.filter(
                        (s) => s.accountUsername === a.username,
                      ).length;
                      const completed = history.filter(
                        (s) => s.accountUsername === a.username,
                      ).length;
                      return (
                        <tr key={a.username} className="hover:bg-paper/60">
                          <Td bold>{a.username}</Td>
                          <Td>{a.displayName}</Td>
                          <Td muted>{a.email ?? "—"}</Td>
                          <Td muted>{a.contact ?? "—"}</Td>
                          <Td>{active}</Td>
                          <Td>{completed}</Td>
                        </tr>
                      );
                    })}
                </tbody>
              </TableWrap>
            </div>
          </div>
        )}

        {/* Reservations */}
        {activeNav === "reservations" && (
          <div className="space-y-6">
            <SectionHeader
              title="Reservations"
              subtitle={`${facilityReservations.length} pending — ${selectedFacility.name}`}
            />
            <div className="border border-line bg-white">
              <TableHeader
                title="All Reservations"
                count={facilityReservations.length}
              />
              <TableWrap>
                <Thead
                  cols={[
                    "Res. ID",
                    "Driver",
                    "Slot",
                    "Facility",
                    "Vehicle",
                    "Plate",
                    "Date",
                    "Arrival",
                    "Duration",
                    "Fee",
                    "Status",
                  ]}
                />
                <tbody className="divide-y divide-line">
                  {facilityReservations.length === 0 ? (
                    <EmptyRow cols={11} msg="No reservations" />
                  ) : (
                    facilityReservations.map((r) => {
                      const fee = (r.hours ?? 2) * RATES[r.vehicle];
                      const isPast =
                        new Date(r.date + "T" + r.time).getTime() < Date.now();
                      const fac = facilities.find(
                        (f) => f.id === slotFacilityMap.get(r.slot),
                      );
                      return (
                        <tr
                          key={r.id}
                          className={`hover:bg-paper/60 ${isPast ? "opacity-60" : ""}`}
                        >
                          <Td bold>{r.id}</Td>
                          <Td>{r.driver}</Td>
                          <Td>{r.slot}</Td>
                          <Td muted>{fac?.name ?? "—"}</Td>
                          <Td>{r.vehicle}</Td>
                          <Td>{r.plate}</Td>
                          <Td>{r.date}</Td>
                          <Td>{r.time}</Td>
                          <Td>{r.hours}h</Td>
                          <Td bold>{peso(fee)}</Td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${isPast ? "bg-signal/10 text-signal" : "bg-reserved-soft text-reserved"}`}
                            >
                              {isPast ? "Overdue" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </TableWrap>
            </div>
          </div>
        )}

        {/* Parking History */}
        {activeNav === "history" && (
          <div className="space-y-6">
            <SectionHeader
              title="Parking History"
              subtitle={`${facilityHistory.length} completed session${facilityHistory.length !== 1 ? "s" : ""} — ${selectedFacility.name}`}
            />
            <div className="border border-line bg-white">
              <TableHeader
                title="Completed Sessions"
                count={facilityHistory.length}
              />
              <TableWrap>
                <Thead
                  cols={[
                    "Session ID",
                    "Driver",
                    "Slot",
                    "Facility",
                    "Vehicle",
                    "Plate",
                    "Entry",
                    "Exit",
                    "Duration",
                    "Fee",
                  ]}
                />
                <tbody className="divide-y divide-line">
                  {facilityHistory.length === 0 ? (
                    <EmptyRow cols={10} msg="No history yet" />
                  ) : (
                    facilityHistory.map((s) => {
                      const exitMs = s.duration
                        ? s.entry + s.duration * 3_600_000
                        : null;
                      const fee = s.duration
                        ? RATES[s.vehicle] * s.duration
                        : 0;
                      const fac = facilities.find(
                        (f) => f.id === slotFacilityMap.get(s.slot),
                      );
                      return (
                        <tr key={s.id} className="hover:bg-paper/60">
                          <Td bold>{s.id}</Td>
                          <Td>{s.driver}</Td>
                          <Td>{s.slot}</Td>
                          <Td muted>{fac?.name ?? "—"}</Td>
                          <Td>{s.vehicle}</Td>
                          <Td>{s.plate}</Td>
                          <Td>
                            {fmtDate(s.entry)} {fmtTime(s.entry)}
                          </Td>
                          <Td>{exitMs ? fmtTime(exitMs) : "—"}</Td>
                          <Td>{s.duration ? `${s.duration}h` : "—"}</Td>
                          <Td bold>{fee ? peso(fee) : "—"}</Td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </TableWrap>
            </div>
          </div>
        )}

        {/* Reports */}
        {activeNav === "reports" && (
          <div className="space-y-8">
            <SectionHeader
              title="Reports"
              subtitle={`Analytics — ${selectedFacility.name}`}
            />

            <div className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3">
              <KpiTile label="Current Occupancy" value={`${occupancyPct}%`} />
              <KpiTile
                label="Total Sessions (All Time)"
                value={String(facilityHistory.length + facilitySessions.length)}
              />
              <KpiTile
                label="Registered Drivers"
                value={String(drivers.length)}
              />
            </div>

            <div className="border border-line bg-white">
              <TableHeader title="Revenue by Vehicle Type" count={null} />
              <div className="divide-y divide-line">
                {(["Automobile", "Motorcycle"] as const).map((v) => {
                  const vSessions = facilityHistory.filter(
                    (s) => s.vehicle === v,
                  );
                  const rev = vSessions.reduce(
                    (sum, s) => sum + (s.duration ? RATES[v] * s.duration : 0),
                    0,
                  );
                  const pct = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
                  return (
                    <div key={v} className="px-5 py-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div>
                          <span className="font-mono text-sm font-bold">
                            {v}
                          </span>
                          <span className="ml-3 font-mono text-[11px] text-ink-soft">
                            {vSessions.length} session
                            {vSessions.length !== 1 ? "s" : ""} ·{" "}
                            {peso(RATES[v])}/h
                          </span>
                        </div>
                        <span className="font-mono text-sm font-bold">
                          {peso(rev)}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-line">
                        <div
                          className="h-full bg-ink transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between bg-paper px-5 py-3">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                    Total Revenue
                  </span>
                  <span className="font-mono text-base font-extrabold">
                    {peso(totalRevenue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Slot Damage Reports */}
            <div className="border border-line bg-white">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em]">
                    Slot Damage Reports
                  </h2>
                  {damageReports.filter((r) => !r.resolved).length > 0 && (
                    <span className="bg-signal px-1.5 py-px font-mono text-[9px] font-bold text-white">
                      {damageReports.filter((r) => !r.resolved).length} open
                    </span>
                  )}
                </div>
              </div>
              <TableWrap>
                <Thead
                  cols={[
                    "Slot",
                    "Facility",
                    "Reported By",
                    "Date & Time",
                    "Status",
                    "Actions",
                  ]}
                />
                <tbody className="divide-y divide-line">
                  {damageReports.length === 0 ? (
                    <EmptyRow cols={6} msg="No damage reports submitted" />
                  ) : (
                    damageReports.map((r) => (
                      <tr
                        key={r.id}
                        className={`hover:bg-paper/60 ${r.resolved ? "opacity-50" : ""}`}
                      >
                        <Td bold>{r.slotId}</Td>
                        <Td muted>{r.facilityName}</Td>
                        <Td>{r.reportedBy}</Td>
                        <Td muted>
                          {new Date(r.timestamp).toLocaleString("en-PH", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </Td>
                        <td className="px-5 py-3">
                          <span
                            className={`px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${r.resolved ? "bg-available-soft text-available" : "bg-signal/10 text-signal"}`}
                          >
                            {r.resolved ? "Resolved" : "Open"}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {!r.resolved && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => onResolveDamageReport(r.id)}
                                className="border border-available px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-available transition-colors hover:bg-available hover:text-white"
                              >
                                Mark Resolved
                              </button>
                              <button
                                onClick={() => {
                                  setSlots((prev) =>
                                    prev.map((s) =>
                                      s.id === r.slotId
                                        ? { ...s, status: "out_of_service" }
                                        : s,
                                    ),
                                  );
                                  onResolveDamageReport(r.id);
                                }}
                                className="border border-signal px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-signal transition-colors hover:bg-signal hover:text-white"
                              >
                                Mark Out of Service
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </TableWrap>
            </div>

            <div className="border border-line bg-white">
              <TableHeader title="Top Drivers by Activity" count={null} />
              <TableWrap>
                <Thead
                  cols={[
                    "Driver",
                    "Completed Sessions",
                    "Active Sessions",
                    "Total Revenue",
                  ]}
                />
                <tbody className="divide-y divide-line">
                  {drivers.length === 0 ? (
                    <EmptyRow cols={4} msg="No driver data" />
                  ) : (
                    drivers
                      .map((d) => {
                        const completed = facilityHistory.filter(
                          (s) => s.accountUsername === d.username,
                        );
                        const active = facilitySessions.filter(
                          (s) => s.accountUsername === d.username,
                        ).length;
                        const rev = completed.reduce(
                          (sum, s) =>
                            sum +
                            (s.duration ? RATES[s.vehicle] * s.duration : 0),
                          0,
                        );
                        return {
                          name: d.displayName,
                          completed: completed.length,
                          active,
                          rev,
                        };
                      })
                      .sort(
                        (a, b) =>
                          b.completed + b.active - (a.completed + a.active),
                      )
                      .map((row) => (
                        <tr key={row.name} className="hover:bg-paper/60">
                          <Td bold>{row.name}</Td>
                          <Td>{row.completed}</Td>
                          <Td>{row.active}</Td>
                          <Td bold>{peso(row.rev)}</Td>
                        </tr>
                      ))
                  )}
                </tbody>
              </TableWrap>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-2">
      <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight">
        {title}
      </h1>
      <p className="mt-1 font-mono text-[11px] text-ink-soft">{subtitle}</p>
    </div>
  );
}

function TableHeader({
  title,
  count,
}: {
  title: string;
  count: number | null;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-3">
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-soft">
        {title}
      </span>
      {count !== null && (
        <span className="font-mono text-[11px] font-bold text-ink">
          {count}
        </span>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  accent = "text-ink",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-white px-5 py-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </div>
      <div className={`mt-1 font-display text-2xl font-extrabold ${accent}`}>
        {value}
      </div>
    </div>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">{children}</table>
    </div>
  );
}

function Thead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-line bg-paper">
        {cols.map((c) => (
          <th
            key={c}
            className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-ink-soft"
          >
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Td({
  children,
  bold,
  muted,
}: {
  children: React.ReactNode;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 font-mono text-xs ${bold ? "font-bold" : ""} ${muted ? "text-ink-soft" : ""}`}
    >
      {children}
    </td>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <tr>
      <td
        colSpan={cols}
        className="px-4 py-8 text-center font-mono text-xs text-ink-soft"
      >
        {msg}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    available: "bg-available-soft text-available",
    occupied: "bg-signal/10 text-signal",
    reserved: "bg-reserved-soft text-reserved",
    out_of_service: "bg-line text-ink-soft",
  };
  const labels: Record<string, string> = {
    available: "Available",
    occupied: "Occupied",
    reserved: "Reserved",
    out_of_service: "Out of Service",
  };
  return (
    <span
      className={`px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${styles[status] ?? "bg-line text-ink-soft"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
