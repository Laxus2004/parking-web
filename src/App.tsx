import { useState } from "react";
import AdminDashboard from "./parking/AdminDashboard";
import SuperAdminDashboard from "./parking/SuperAdminDashboard";
import DriverView from "./parking/DriverView";
import {
  seedHistory,
  seedReservations,
  seedSessions,
  seedSlots,
  type Reservation,
  type Session,
  type Slot,
} from "./parking/data";

type Role = "admin" | "driver" | "superadmin";

export interface DamageReport {
  id: string;
  slotId: string;
  facilityName: string;
  reportedBy: string;
  timestamp: number;
  resolved: boolean;
}

export interface AppNotification {
  id: string;
  type: "approval" | "reminder" | "overdue" | "expiry";
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  reservationId?: string;
}

interface User {
  username: string;
  role: Role;
  displayName: string;
  email?: string;
  facilityId?: string;
}

interface Account {
  username: string;
  email?: string;
  password: string;
  role: Role;
  displayName: string;
  facilityId?: string; // assigned facility for staff accounts
  // Driver profile fields
  firstName?: string;
  lastName?: string;
  contact?: string;
}

const SEED_ACCOUNTS: Account[] = [
  {
    username: "admin",
    password: "12345",
    role: "superadmin",
    displayName: "Super Admin",
  },
  {
    username: "staff1",
    password: "12345",
    role: "admin",
    displayName: "Staff 1",
    facilityId: "fac-uv-main",
  },
  {
    username: "staff2",
    password: "12345",
    role: "admin",
    displayName: "Staff 2",
    facilityId: "fac-sanciangko",
  },
  {
    username: "staff3",
    password: "12345",
    role: "admin",
    displayName: "Staff 3",
    facilityId: "fac-plaza-independencia",
  },
  {
    username: "vintoy",
    password: "12345",
    role: "driver",
    displayName: "Vintoy",
    firstName: "Vintoy",
    lastName: "Kupal",
    contact: "09919089508",
    email: "vintoy123@gmail.com",
  },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>(SEED_ACCOUNTS);
  // "login" | "register" | "registered" (brief success state)
  const [authScreen, setAuthScreen] = useState<"login" | "register">("login");
  const [registeredName, setRegisteredName] = useState("");

  const [slots, setSlots] = useState<Slot[]>(seedSlots);
  const [sessions, setSessions] = useState<Session[]>(seedSessions);
  const [history, setHistory] = useState<Session[]>(seedHistory);
  const [reservations, setReservations] =
    useState<Reservation[]>(seedReservations);
  const [notificationsByUsername, setNotificationsByUsername] = useState<
    Record<string, AppNotification[]>
  >({});
  const [damageReports, setDamageReports] = useState<DamageReport[]>([]);
  const [driverNavOpen, setDriverNavOpen] = useState(false);
  const [adminNavOpen, setAdminNavOpen] = useState(false);

  function addDamageReport(
    slotId: string,
    facilityName: string,
    reportedBy: string,
  ) {
    setDamageReports((prev) => [
      {
        id: Math.random().toString(36).slice(2),
        slotId,
        facilityName,
        reportedBy,
        timestamp: Date.now(),
        resolved: false,
      },
      ...prev,
    ]);
  }

  function resolveDamageReport(id: string) {
    setDamageReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, resolved: true } : r)),
    );
  }

  function addNotification(
    username: string,
    n: Omit<AppNotification, "id" | "timestamp" | "read">,
  ) {
    setNotificationsByUsername((prev) => ({
      ...prev,
      [username]: [
        {
          ...n,
          id: Math.random().toString(36).slice(2),
          timestamp: Date.now(),
          read: false,
        },
        ...(prev[username] ?? []),
      ],
    }));
  }

  function markAllRead(username: string) {
    setNotificationsByUsername((prev) => ({
      ...prev,
      [username]: (prev[username] ?? []).map((n) => ({ ...n, read: true })),
    }));
  }

  function dismissNotification(username: string, id: string) {
    setNotificationsByUsername((prev) => ({
      ...prev,
      [username]: (prev[username] ?? []).filter((n) => n.id !== id),
    }));
  }

  function handleLogin(
    usernameOrEmail: string,
    password: string,
  ): string | null {
    const key = usernameOrEmail.trim().toLowerCase();
    const account = accounts.find(
      (a) =>
        (a.username === key || a.email?.toLowerCase() === key) &&
        a.password === password,
    );
    if (!account) return "Invalid username / email or password.";
    setUser({
      username: account.username,
      role: account.role,
      displayName: account.displayName,
      email: account.email,
      facilityId: account.facilityId,
    });
    return null;
  }

  function handleRegister(
    data: Omit<Account, "role" | "displayName"> & { username: string },
  ): string | null {
    const usernameKey = data.username.trim().toLowerCase();
    const emailKey = data.email!.trim().toLowerCase();
    if (accounts.some((a) => a.username === usernameKey)) {
      return "That username is already taken.";
    }
    if (accounts.some((a) => a.email?.toLowerCase() === emailKey)) {
      return "An account with this email already exists.";
    }
    const displayName = [data.firstName, data.lastName]
      .filter(Boolean)
      .join(" ");
    const newAccount: Account = {
      username: usernameKey,
      email: emailKey,
      password: data.password,
      role: "driver",
      displayName,
      firstName: data.firstName,
      lastName: data.lastName,
      contact: data.contact,
    };
    setAccounts((prev) => [...prev, newAccount]);
    setRegisteredName(displayName);
    setAuthScreen("login");
    return null;
  }

  function handleLogout() {
    setUser(null);
    setAuthScreen("login");
    setRegisteredName("");
  }

  if (!user) {
    return authScreen === "register" ? (
      <RegisterScreen
        onRegister={handleRegister}
        onBackToLogin={() => setAuthScreen("login")}
      />
    ) : (
      <LoginScreen
        onLogin={handleLogin}
        onGoToRegister={() => {
          setRegisteredName("");
          setAuthScreen("register");
        }}
        justRegistered={registeredName}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden font-sans text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center bg-ink font-display text-lg font-black text-paper">
              P
            </div>
            <div className="leading-tight">
              <div className="font-display text-sm font-bold uppercase tracking-[0.14em]">
                ParkHub
              </div>
              <div className="font-mono text-[11px] text-ink-soft">
                Community Parking Facility Management
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {user.role === "superadmin" ? (
          <SuperAdminDashboard
            slots={slots}
            setSlots={setSlots}
            sessions={sessions}
            history={history}
            reservations={reservations}
            accounts={accounts}
            onLogout={handleLogout}
            displayName={user.displayName}
            damageReports={damageReports}
            onResolveDamageReport={resolveDamageReport}
          />
        ) : user.role === "admin" ? (
          <AdminDashboard
            slots={slots}
            setSlots={setSlots}
            sessions={sessions}
            setSessions={setSessions}
            history={history}
            setHistory={setHistory}
            reservations={reservations}
            setReservations={setReservations}
            addNotification={addNotification}
            addDamageReport={(slotId, facilityName) =>
              addDamageReport(slotId, facilityName, user.displayName)
            }
            onLogout={handleLogout}
            displayName={user.displayName}
            facilityId={user.facilityId}
            navOpen={adminNavOpen}
            onNavToggle={() => setAdminNavOpen((v) => !v)}
          />
        ) : (
          <DriverView
            slots={slots}
            setSlots={setSlots}
            sessions={sessions}
            setSessions={setSessions}
            history={history}
            setHistory={setHistory}
            reservations={reservations}
            setReservations={setReservations}
            addNotification={(notification) =>
              addNotification(user.username, notification)
            }
            username={user.username}
            displayName={user.displayName}
            contact={
              accounts.find((a) => a.username === user.username)?.contact
            }
            email={accounts.find((a) => a.username === user.username)?.email}
            onLogout={handleLogout}
            navOpen={driverNavOpen}
            onNavClose={() => setDriverNavOpen(false)}
            onNavOpen={() => setDriverNavOpen(true)}
            notifications={notificationsByUsername[user.username] ?? []}
            onMarkAllRead={() => markAllRead(user.username)}
            onDismissNotification={(id) =>
              dismissNotification(user.username, id)
            }
          />
        )}
      </main>
    </div>
  );
}

// ─── Shared auth shell ────────────────────────────────────────────────────────

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden font-sans text-ink"
      style={{
        background:
          "linear-gradient(135deg, #0f172a 0%, #134e4a 55%, #1e293b 100%)",
      }}
    >
      {/* Glowing blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-32 -top-32 size-[500px] rounded-full opacity-25"
          style={{
            background: "radial-gradient(circle, #0d9488 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute -right-24 top-1/3 size-[400px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, #2563eb 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
        <div
          className="absolute bottom-0 left-1/3 size-[350px] rounded-full opacity-15"
          style={{
            background: "radial-gradient(circle, #0f766e 0%, transparent 70%)",
            filter: "blur(70px)",
          }}
        />
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4 py-12">
        {children}
      </div>
    </div>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({
  onLogin,
  onGoToRegister,
  justRegistered,
}: {
  onLogin: (u: string, p: string) => string | null;
  onGoToRegister: () => void;
  justRegistered: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setTimeout(() => {
      const err = onLogin(username, password);
      if (err) {
        setError(err);
        setLoading(false);
      }
    }, 400);
  }

  return (
    <AuthShell>
      <div className="w-full max-w-4xl">
        <div className="flex min-h-[520px] overflow-hidden shadow-2xl shadow-black/40">
          {/* ── Left: Branding panel ── */}
          <div
            className="hidden flex-col justify-between p-12 md:flex md:w-1/2"
            style={{
              background: "rgba(255,255,255,0.05)",
              backdropFilter: "blur(16px)",
              borderRight: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center bg-white/15 font-display text-xl font-black text-white">
                P
              </div>
              <span className="font-display text-lg font-extrabold uppercase tracking-[0.18em] text-white">
                ParkHub
              </span>
            </div>
            <div>
              <h2
                className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white text-left"
                style={{ marginTop: "102px", marginBottom: "176px" }}
              >
                Smart Parking Management
              </h2>
              <p
                className="font-mono text-sm leading-relaxed text-white/60"
                style={{ marginTop: "0px" }}
              >
                Community Parking Facility
              </p>
            </div>
          </div>

          {/* ── Right: Login form ── */}
          <div className="flex flex-1 flex-col justify-center bg-white px-8 py-10 md:px-10">
            <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight">
              Sign In
            </h1>

            {justRegistered && (
              <div className="mt-4 flex items-center gap-2 border border-available/30 bg-available-soft px-3 py-2">
                <span className="text-available text-xs">✓</span>
                <p className="font-mono text-xs text-available">
                  Account created for{" "}
                  <span className="font-bold">{justRegistered}</span>.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <AuthField label="Username">
                <input
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError(null);
                  }}
                  placeholder="Username"
                  autoComplete="username"
                  autoFocus
                  className="w-full border border-line bg-paper px-3 py-2.5 font-mono text-sm outline-none transition-colors focus:border-ink"
                />
              </AuthField>

              <AuthField label="Password">
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    className="w-full border border-line bg-paper px-3 py-2.5 pr-12 font-mono text-sm outline-none transition-colors focus:border-ink"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-ink-soft hover:text-ink"
                  >
                    {showPw ? "hide" : "show"}
                  </button>
                </div>
              </AuthField>

              {error && (
                <div className="border border-signal/40 bg-signal/5 px-3 py-2 font-mono text-xs text-signal">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!username.trim() || !password || loading}
                className="w-full bg-signal py-3 font-display text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-signal-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>

            <p className="mt-6 text-center font-mono text-xs text-ink-soft">
              New driver?{" "}
              <button
                onClick={onGoToRegister}
                className="font-medium text-ink underline underline-offset-2 hover:text-signal"
              >
                Create an account
              </button>
            </p>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}

// ─── Register screen ──────────────────────────────────────────────────────────

const PW_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter (A–Z)", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number (0–9)", test: (p: string) => /[0-9]/.test(p) },
  {
    label: "One special character (!@#…)",
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
  },
];

function RegisterScreen({
  onRegister,
  onBackToLogin,
}: {
  onRegister: (data: {
    username: string;
    firstName: string;
    lastName: string;
    contact: string;
    email: string;
    password: string;
  }) => string | null;
  onBackToLogin: () => void;
}) {
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const pwRulesPassed = PW_RULES.map((r) => r.test(password));
  const pwValid = pwRulesPassed.every(Boolean);
  const pwMatch = password === confirmPw && confirmPw.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!pwValid) {
      setError("Please meet all password requirements.");
      return;
    }
    if (!pwMatch) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    setTimeout(() => {
      const err = onRegister({
        username,
        firstName,
        lastName,
        contact,
        email,
        password,
      });
      if (err) {
        setError(err);
        setLoading(false);
      }
    }, 400);
  }

  return (
    <AuthShell>
      <div className="w-full max-w-xl">
        <div className="border border-line bg-white">
          {/* Header */}
          <div className="border-b border-line px-8 py-6">
            <button
              onClick={onBackToLogin}
              className="mb-3 flex items-center gap-1 font-mono text-[11px] text-ink-soft hover:text-ink"
            >
              ← Back to Sign In
            </button>
            <h1 className="font-display text-xl font-extrabold uppercase tracking-tight">
              Create Driver Account
            </h1>
            <p className="mt-1 font-mono text-[11px] text-ink-soft">
              UV Main Campus Lot · Community Parking
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Section 1: Personal Information */}
            <div className="border-b border-line px-8 py-6 space-y-5">
              <SectionLabel>1 — Personal Information</SectionLabel>

              {/* Full name row */}
              <div className="grid grid-cols-2 gap-3">
                <AuthField label="First Name">
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Juan"
                    required
                    className="w-full border border-line bg-paper px-3 py-2.5 text-sm outline-none transition-colors focus:border-ink"
                  />
                </AuthField>
                <AuthField label="Last Name">
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Dela Cruz"
                    required
                    className="w-full border border-line bg-paper px-3 py-2.5 text-sm outline-none transition-colors focus:border-ink"
                  />
                </AuthField>
              </div>

              <AuthField label="Username" hint="Used to log in to your account">
                <input
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.replace(/\s/g, ""))
                  }
                  placeholder="e.g. juandelacruz"
                  required
                  autoComplete="username"
                  className="w-full border border-line bg-paper px-3 py-2.5 font-mono text-sm outline-none transition-colors focus:border-ink"
                />
              </AuthField>

              <AuthField label="Contact Number">
                <input
                  value={contact}
                  onChange={(e) =>
                    setContact(e.target.value.replace(/[^\d+\s\-()]/g, ""))
                  }
                  placeholder="e.g. 09XX XXX XXXX"
                  required
                  className="w-full border border-line bg-paper px-3 py-2.5 font-mono text-sm outline-none transition-colors focus:border-ink"
                />
              </AuthField>

              <AuthField label="Email Address">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="w-full border border-line bg-paper px-3 py-2.5 font-mono text-sm outline-none transition-colors focus:border-ink"
                />
              </AuthField>
            </div>

            {/* Section 2: Password */}
            <div className="px-8 py-6 space-y-5">
              <SectionLabel>2 — Security</SectionLabel>

              <AuthField label="Password">
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="Create a password"
                    required
                    autoComplete="new-password"
                    className="w-full border border-line bg-paper px-3 py-2.5 pr-12 font-mono text-sm outline-none transition-colors focus:border-ink"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-ink-soft hover:text-ink"
                  >
                    {showPw ? "hide" : "show"}
                  </button>
                </div>
                {/* Password criteria */}
                {(password.length > 0 || touched) && (
                  <ul className="mt-2 space-y-1">
                    {PW_RULES.map((rule, i) => (
                      <li
                        key={i}
                        className={`flex items-center gap-2 font-mono text-[11px] transition-colors ${
                          pwRulesPassed[i] ? "text-available" : "text-ink-soft"
                        }`}
                      >
                        <span
                          className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                            pwRulesPassed[i]
                              ? "bg-available text-white"
                              : "bg-line text-ink-soft"
                          }`}
                        >
                          {pwRulesPassed[i] ? "✓" : "·"}
                        </span>
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                )}
              </AuthField>

              <AuthField label="Confirm Password">
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPw}
                    onChange={(e) => {
                      setConfirmPw(e.target.value);
                      setError(null);
                    }}
                    placeholder="Re-enter password"
                    required
                    autoComplete="new-password"
                    className={`w-full border bg-paper px-3 py-2.5 pr-12 font-mono text-sm outline-none transition-colors focus:border-ink ${
                      confirmPw.length > 0
                        ? pwMatch
                          ? "border-available"
                          : "border-signal"
                        : "border-line"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-ink-soft hover:text-ink"
                  >
                    {showConfirm ? "hide" : "show"}
                  </button>
                </div>
                {confirmPw.length > 0 && !pwMatch && (
                  <p className="mt-1 font-mono text-[11px] text-signal">
                    Passwords do not match.
                  </p>
                )}
                {confirmPw.length > 0 && pwMatch && (
                  <p className="mt-1 font-mono text-[11px] text-available">
                    ✓ Passwords match.
                  </p>
                )}
              </AuthField>

              {error && (
                <div className="border border-signal/40 bg-signal/5 px-3 py-2 font-mono text-xs text-signal">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  !username.trim() ||
                  !firstName.trim() ||
                  !lastName.trim() ||
                  !contact.trim() ||
                  !email.trim() ||
                  !pwValid ||
                  !pwMatch ||
                  loading
                }
                className="w-full bg-ink py-3 font-display text-sm font-bold uppercase tracking-wide text-paper transition-colors hover:bg-signal disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
              >
                {loading ? "Creating account…" : "Create Account"}
              </button>

              <p className="text-center font-mono text-[11px] text-ink-soft">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="font-medium text-ink underline underline-offset-2 hover:text-signal"
                >
                  Sign in
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </AuthShell>
  );
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-ink-soft">
        {children}
      </span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

function AuthField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <div>
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
          {label}
        </span>
        {hint && (
          <p className="mt-0.5 font-mono text-[10px] text-ink-soft/70">
            {hint}
          </p>
        )}
      </div>
      {children}
    </label>
  );
}
