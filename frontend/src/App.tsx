import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { format, addDays, startOfDay, startOfWeek, setHours, setMinutes, parseISO, isSameDay } from "date-fns";
import { CalendarDays, UsersRound, Boxes, LogOut, Plus, Search, ChevronLeft, ChevronRight, Clock3, Trash2, Pencil, X, Menu, Check, UserRound, BarChart3, ClipboardList } from "lucide-react";
import { api, errorMessage } from "./api";
import type { Booking, Resource, ResourceType, Role, TaskType, User } from "./types";
import { announceBookingChange } from "./bookingEvents";
const ReportsPage = lazy(() => import("./ReportsPage"));
const RequestsPage = lazy(() => import("./RequestsPage"));

type Toast = { id: number; text: string; kind: "success" | "error" };
type ViewMode = "day" | "week";
type BookingDraft = { id?: string; resourceId: string; taskNumber: string; taskType: TaskType | ""; taskTitle: string; startDateTime: string; endDateTime: string; isAllDay: boolean; notes: string };
const roleLabels: Record<Role, string> = { ADMIN: "Admin", TEAM_LEAD: "Team Lead", PROJECT_MANAGER: "Project Manager" };
const hasRole = (user: User, role: Role) => user.roles.includes(role);
const canManageResources = (user: User) => hasRole(user, "ADMIN") || hasRole(user, "TEAM_LEAD");
const displayRoles = (roles: Role[]) => roles.map(role => roleLabels[role]).join(" · ");

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mobileNav, setMobileNav] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const notify = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts(items => [...items, { id, text, kind }]);
    window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 3500);
  }, []);

  useEffect(() => {
    api.get("/auth/me").then(response => setUser(response.data.user)).catch(() => setUser(null)).finally(() => setChecking(false));
  }, []);

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (error) { notify(errorMessage(error), "error"); }
    setUser(null);
    navigate("/login");
  };

  if (checking) return <div className="screen-loading"><div className="spinner" />Loading your workspace</div>;
  return <>
    {user ? <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-icon"><CalendarDays size={20} /></div><div><strong>Resource</strong><span>BLOCKING CALENDAR</span></div></div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <Link className={location.pathname === "/" ? "nav-link active" : "nav-link"} to="/"><CalendarDays size={18} />Calendar</Link>
          {canManageResources(user) && <Link className={location.pathname.startsWith("/resources") ? "nav-link active" : "nav-link"} to="/resources"><Boxes size={18} />Resources</Link>}
          {(canManageResources(user) || hasRole(user, "PROJECT_MANAGER")) && <Link className={location.pathname.startsWith("/requests") ? "nav-link active" : "nav-link"} to="/requests"><ClipboardList size={18} />Requests</Link>}
          {hasRole(user, "ADMIN") && <>
            <Link className={location.pathname.startsWith("/reports") ? "nav-link active" : "nav-link"} to="/reports"><BarChart3 size={18} />Reports</Link>
            <Link className={location.pathname.startsWith("/users") ? "nav-link active" : "nav-link"} to="/users"><UsersRound size={18} />Users</Link>
          </>}
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><div className="help-badge">i</div><div><strong>Need help?</strong><small>Contact your workspace admin</small></div></div><div className="sidebar-footer">RESOURCE PLANNER <span>v1.0</span></div></div>
      </aside>
      {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <main className="main-area">
        <header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumbs">Workspace <span>/</span> <b>{location.pathname.startsWith("/resources") ? "Resources" : location.pathname.startsWith("/users") ? "Users" : location.pathname.startsWith("/reports") ? "Reports" : location.pathname.startsWith("/requests") ? "Requests" : "Calendar"}</b></div><div className="top-actions"><div className="user-chip"><div className="avatar">{user.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</div><div className="user-details"><strong>{user.name}</strong><span className="role-label">{displayRoles(user.roles)}</span></div></div><button className="icon-btn logout-btn" onClick={logout} title="Log out" aria-label="Log out"><LogOut size={18} /></button></div></header>
        <Routes>
          <Route path="/" element={<CalendarPage user={user} notify={notify} />} />
          <Route path="/resources" element={canManageResources(user) ? <ResourcesPage notify={notify} /> : <Navigate to="/" replace />} />
          <Route path="/requests" element={(canManageResources(user) || hasRole(user, "PROJECT_MANAGER")) ? <Suspense fallback={<div className="screen-loading"><div className="spinner" />Loading requests</div>}><RequestsPage user={user} notify={notify} /></Suspense> : <Navigate to="/" replace />} />
          <Route path="/reports" element={hasRole(user, "ADMIN") ? <Suspense fallback={<div className="screen-loading"><div className="spinner" />Loading reports</div>}><ReportsPage notify={notify} /></Suspense> : <Navigate to="/" replace />} />
          <Route path="/users" element={hasRole(user, "ADMIN") ? <UsersPage notify={notify} /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <div className="toast-stack" aria-live="polite">{toasts.map(toast => <div key={toast.id} className={`toast ${toast.kind}`}><span className="toast-dot">{toast.kind === "success" ? <Check size={14} /> : "!"}</span>{toast.text}</div>)}</div>
    </div> : <Routes><Route path="/login" element={<LoginPage onLogin={setUser} />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>}
  </>;
}

function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setLoginError("");
    try { const response = await api.post("/auth/login", { username, password }); onLogin(response.data.user); }
    catch (error) {
      const message = errorMessage(error);
      setLoginError(message === "Invalid username or password"
        ? "The username or password is incorrect. Please check your details and try again."
        : "We couldn't sign you in. Please try again or contact your workspace administrator.");
    }
    finally { setBusy(false); }
  };
  return <div className="login-screen"><div className="login-brand"><div className="brand-icon"><CalendarDays size={20} /></div><div><strong>Resource</strong><span>BLOCKING CALENDAR</span></div></div><section className="login-card"><div className="login-eyebrow">WELCOME BACK</div><h1>Sign in to your workspace</h1><p>Manage resource availability and project blocks.</p><form onSubmit={submit}>{loginError && <div className="login-error" role="alert">{loginError}</div>}<label>Username<input autoComplete="username" value={username} onChange={event => { setUsername(event.target.value); setLoginError(""); }} placeholder="Enter your username" required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value); setLoginError(""); }} placeholder="Enter your password" required /></label><button className="primary-btn full-btn" disabled={busy}>{busy ? "Signing in..." : "Sign in"}<span>→</span></button></form></section><div className="login-foot">A clear view of who's working on what.</div></div>;
}

function CalendarPage({ user, notify }: { user: User; notify: (text: string, kind?: Toast["kind"]) => void }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState<ViewMode>("week");
  const [filterType, setFilterType] = useState("All resources");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [resourceResponse, bookingResponse] = await Promise.all([api.get("/resources"), api.get("/bookings")]);
      setResources(resourceResponse.data.filter((resource: Resource) => resource.isActive));
      setBookings(bookingResponse.data);
    } catch (error) { notify(errorMessage(error), "error"); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void loadData(); }, [loadData]);
  const days = useMemo(() => {
    if (view === "day") return [cursor];
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [cursor, view]);
  const shownResources = resources.filter(resource =>
    (filterType === "All resources" || resource.type === filterType) &&
    (!search || resource.name.toLowerCase().includes(search.toLowerCase()) || bookings.some(booking => booking.resourceId === resource.id && booking.taskNumber.toLowerCase().includes(search.toLowerCase())))
  );
  const displayTitle = view === "day" ? format(cursor, "EEEE, MMMM d, yyyy") : `${format(days[0]!, "MMM d")} – ${format(days[6]!, "MMM d, yyyy")}`;
  const canEdit = (_booking: Booking) => canManageResources(user);
  const newBooking = (resourceId?: string, date = cursor, hour = 9) => {
    const now = new Date();
    const bookingDate = date < startOfDay(now) ? now : date;
    const bookingHour = isSameDay(bookingDate, now) ? Math.max(hour, now.getHours() + 1) : hour;
    const start = setMinutes(setHours(bookingDate, bookingHour), 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setDraft({ resourceId: resourceId ?? shownResources[0]?.id ?? "", taskNumber: "", taskType: "", taskTitle: "", startDateTime: toLocalInput(start), endDateTime: toLocalInput(end), isAllDay: false, notes: "" });
  };
  const saveBooking = async (event: FormEvent) => {
    event.preventDefault(); if (!draft) return; setSaving(true);
    const historicalEdit = Boolean(draft.id && isPastSchedule(new Date(draft.startDateTime), draft.isAllDay));
    const payload = historicalEdit
      ? { taskNumber: draft.taskNumber, taskType: draft.taskType, taskTitle: draft.taskTitle, notes: draft.notes }
      : { resourceId: draft.resourceId, taskNumber: draft.taskNumber, taskType: draft.taskType, taskTitle: draft.taskTitle, notes: draft.notes, isAllDay: draft.isAllDay, ...(draft.isAllDay ? { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}), startDateTime: new Date(draft.startDateTime).toISOString(), endDateTime: new Date(draft.endDateTime).toISOString() };
    try {
      if (draft.id) await api.put(`/bookings/${draft.id}`, payload); else await api.post("/bookings", payload);
      announceBookingChange();
      setDraft(null); notify(draft.id ? "Booking updated" : "Resource blocked successfully"); await loadData();
    } catch (error) { notify(errorMessage(error), "error"); }
    finally { setSaving(false); }
  };
  const deleteBooking = async () => {
    if (!draft?.id) return;
    try { await api.delete(`/bookings/${draft.id}`); announceBookingChange(); setDraft(null); notify("Booking deleted"); await loadData(); }
    catch (error) { notify(errorMessage(error), "error"); }
  };
  const openBooking = (booking: Booking) => {
    if (!canEdit(booking)) { notify("Only Team Leads and Admins can edit calendar bookings.", "error"); return; }
    setDraft({ id: booking.id, resourceId: booking.resourceId, taskNumber: booking.taskNumber, taskType: booking.taskType ?? "", taskTitle: booking.taskTitle ?? "", startDateTime: toLocalInput(parseISO(booking.startDateTime)), endDateTime: toLocalInput(parseISO(booking.endDateTime)), isAllDay: booking.isAllDay, notes: booking.notes });
  };
  const moveBooking = async (booking: Booking, targetResource: string, targetDate: Date) => {
    if (!canEdit(booking)) { notify("Only Team Leads and Admins can reschedule calendar bookings.", "error"); return; }
    const start = parseISO(booking.startDateTime);
    const end = parseISO(booking.endDateTime);
    const movedStart = new Date(targetDate); movedStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
    const movedEnd = new Date(movedStart.getTime() + end.getTime() - start.getTime());
    try {
      await api.put(`/bookings/${booking.id}`, { resourceId: targetResource, startDateTime: movedStart.toISOString(), endDateTime: movedEnd.toISOString() });
      announceBookingChange();
      notify("Booking rescheduled"); await loadData();
    } catch (error) { notify(errorMessage(error), "error"); }
  };
  const resizeBooking = (event: React.PointerEvent<HTMLSpanElement>, booking: Booking) => {
    event.preventDefault();
    event.stopPropagation();
    const grid = event.currentTarget.closest(".resource-slots");
    if (!grid) return;
    const bounds = grid.getBoundingClientRect();
    const count = view === "day" ? 9 : days.length;
    const width = bounds.width / count;
    const start = parseISO(booking.startDateTime);
    const startIndex = view === "day" ? Math.max(0, start.getHours() - 9) : days.findIndex(day => isSameDay(day, start));
    const originX = event.clientX;
    const onPointerUp = async (pointerEvent: PointerEvent) => {
      window.removeEventListener("pointerup", onPointerUp);
      if (Math.abs(pointerEvent.clientX - originX) < 8) return;
      const lastIndex = Math.max(startIndex, Math.min(count - 1, Math.floor((pointerEvent.clientX - bounds.left) / width)));
      const duration = lastIndex - startIndex + 1;
      const end = new Date(start);
      if (view === "day") end.setTime(start.getTime() + duration * 60 * 60 * 1000);
      else end.setDate(start.getDate() + duration);
      if (end.getTime() === parseISO(booking.endDateTime).getTime()) return;
      try {
        await api.put(`/bookings/${booking.id}`, { endDateTime: end.toISOString(), ...(booking.isAllDay ? { isAllDay: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}) });
        announceBookingChange();
        notify("Booking duration updated");
        await loadData();
      } catch (error) { notify(errorMessage(error), "error"); }
    };
    window.addEventListener("pointerup", onPointerUp);
  };
  const filteredBookings = bookings.filter(booking => !search || booking.taskNumber.toLowerCase().includes(search.toLowerCase()) || booking.taskTitle?.toLowerCase().includes(search.toLowerCase()));
  return <section className="page-content calendar-page">
    <div className="page-heading"><div><div className="eyebrow">OVERVIEW</div><h1>Resource calendar</h1><p>{canManageResources(user) ? "Plan and manage your team's resource availability." : "View resource availability and submit work requests for assignment and approval."}</p></div>{canManageResources(user) ? <button className="primary-btn" onClick={() => newBooking()}><Plus size={17} />Block resource</button> : <Link className="primary-btn" to="/requests"><ClipboardList size={17} />Submit work request</Link>}</div>
    <section className="calendar-card">
      <div className="calendar-toolbar"><div className="calendar-date-tools"><div className="date-nav"><button onClick={() => setCursor(addDays(cursor, view === "day" ? -1 : -7))} aria-label="Previous"><ChevronLeft size={17} /></button><button onClick={() => setCursor(new Date())}>Today</button><button onClick={() => setCursor(addDays(cursor, view === "day" ? 1 : 7))} aria-label="Next"><ChevronRight size={17} /></button></div><strong>{displayTitle}</strong></div><div className="view-switcher">{(["day", "week"] as ViewMode[]).map(item => <button key={item} className={view === item ? "selected" : ""} onClick={() => setView(item)}>{item[0]!.toUpperCase() + item.slice(1)}</button>)}</div></div>
      <div className="calendar-filters"><div className="search-wrap"><Search size={16} /><input placeholder="Search resources or tasks..." value={search} onChange={event => setSearch(event.target.value)} /></div><select value={filterType} onChange={event => setFilterType(event.target.value)} aria-label="Filter by resource type"><option>All resources</option><option>Person</option><option>Equipment</option><option>Room</option></select><span className="results-count">{shownResources.length} resources</span></div>
      {loading ? <div className="calendar-skeleton">{[1, 2, 3, 4].map(item => <div className="skeleton-row" key={item}><i /><span /></div>)}</div> : shownResources.length ? <div className={`timeline timeline-${view}`} style={{ "--columns": view === "day" ? 24 : days.length } as React.CSSProperties}>
        <div className="timeline-head"><div className="resource-heading">RESOURCE <small>{shownResources.length}</small></div><div className="timeline-dates">{(view === "day" ? Array.from({ length: 24 }, (_, index) => index) : days).map((value, index) => <div className={isSameDay(view === "day" ? cursor : value as Date, new Date()) ? "today-col" : ""} key={view === "day" ? `hour-${index}` : (value as Date).toISOString()}>{view === "day" ? `${String(index).padStart(2, "0")}:00` : <><b>{format(value as Date, "EEE")}</b><span>{format(value as Date, "d")}</span></>}</div>)}</div></div>
        {shownResources.map(resource => {
          const resourceBookings = filteredBookings.filter(booking => booking.resourceId === resource.id && days.some(day => isSameDay(parseISO(booking.startDateTime), day)));
          return <div className="resource-row" key={resource.id}><div className="resource-cell"><div className={`resource-icon ${resource.type.toLowerCase()}`}>{resource.type === "Person" ? <UserRound size={16} /> : resource.type === "Room" ? <Boxes size={16} /> : <Clock3 size={16} />}</div><div><strong>{resource.name}</strong><span>{resource.type}{resource.description ? ` · ${resource.description}` : ""}</span></div></div><div className="resource-slots">
            {(view === "day" ? Array.from({ length: 24 }, (_, index) => ({ day: cursor, hour: index, key: `hour-${index}` })) : days.map(day => ({ day, hour: 9, key: day.toISOString() }))).map(({ day, hour, key }) => {
              const now = new Date();
              const isUnavailable = view === "day" ? new Date(day).setHours(hour, 0, 0, 0) < now.getTime() : day < startOfDay(now);
              return <button key={key} disabled={isUnavailable || !canManageResources(user)} className={`slot-cell ${isSameDay(day, now) ? "today-col" : ""} ${isUnavailable || !canManageResources(user) ? "past-slot" : ""}`} onClick={() => newBooking(resource.id, day, hour)} onDragOver={event => { if (canManageResources(user)) event.preventDefault(); }} onDrop={event => { if (!canManageResources(user)) return; event.preventDefault(); const id = event.dataTransfer.getData("booking"); const booking = bookings.find(item => item.id === id); if (booking) void moveBooking(booking, resource.id, day); }} aria-label={canManageResources(user) ? `Add block for ${resource.name} on ${format(day, "MMM d")} at ${hour}:00` : `${resource.name} availability on ${format(day, "MMM d")} at ${hour}:00`} />;
            })}
            {resourceBookings.map(booking => {
              const bookingDate = parseISO(booking.startDateTime);
              const index = view === "day" ? Math.max(0, Math.min(23, bookingDate.getHours())) : days.findIndex(day => isSameDay(bookingDate, day));
              const duration = booking.isAllDay ? 24 : Math.max(1, (parseISO(booking.endDateTime).getTime() - bookingDate.getTime()) / (60 * 60 * 1000));
              const palette = ["#e8efff", "#e7f5ef", "#fff1df", "#f4eaff", "#ffe9ed"];
              const accent = ["#4774d0", "#2c9566", "#d38a24", "#9362c4", "#d26074"][booking.taskNumber.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5]!;
              const isHistorical = isPastSchedule(bookingDate, booking.isAllDay);
              return <button key={booking.id} draggable={canEdit(booking)} aria-disabled={!canEdit(booking)} onDragStart={event => { if (canEdit(booking)) event.dataTransfer.setData("booking", booking.id); }} className={`booking-block ${view === "day" ? "booking-day" : ""} ${canEdit(booking) ? "" : "booking-readonly"}`} style={{ "--position": index, "--duration": Math.min(duration, view === "day" ? 24 - index : 1), "--block-bg": palette[booking.taskNumber.length % palette.length], "--block-accent": accent } as React.CSSProperties} title={`${booking.taskNumber}${booking.taskTitle ? ` · ${booking.taskTitle}` : ""}\n${resource.name}\n${format(bookingDate, "PPp")} – ${format(parseISO(booking.endDateTime), "p")}\n${booking.notes || ""}`} onClick={event => { event.stopPropagation(); if (canEdit(booking)) openBooking(booking); }}><b>{booking.taskNumber}</b>{booking.taskTitle && <span>{booking.taskTitle}</span>}{canEdit(booking) && !isHistorical && <span className="resize-handle" onPointerDown={event => resizeBooking(event, booking)} aria-label="Resize booking" />}</button>;
            })}
          </div></div>;
        })}
      </div> : <div className="empty-state"><div className="empty-icon"><Boxes size={22} /></div><strong>No resources found</strong><span>Try changing your filters or add a resource.</span></div>}
      <div className="calendar-foot"><span><i className="legend-dot" />Blocked time</span><span>{canManageResources(user) ? "Tip: select an open slot to create a block" : "Calendar is read-only; submit a request to reserve resource time"}</span></div>
    </section>
    {draft && <BookingModal draft={draft} setDraft={setDraft} resources={resources} saving={saving} onSave={saveBooking} onDelete={deleteBooking} onClose={() => setDraft(null)} />}
  </section>;
}

function BookingModal({ draft, setDraft, resources, saving, onSave, onDelete, onClose }: { draft: BookingDraft; setDraft: (draft: BookingDraft | null) => void; resources: Resource[]; saving: boolean; onSave: (event: FormEvent) => void; onDelete: () => void; onClose: () => void }) {
  const update = (key: keyof BookingDraft, value: string | boolean) => setDraft({ ...draft, [key]: value });
  const toggleAllDay = (enabled: boolean) => {
    const start = new Date(draft.startDateTime);
    const end = new Date(draft.endDateTime);
    if (enabled) {
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      if (end <= start) end.setDate(start.getDate() + 1);
    } else {
      start.setHours(9, 0, 0, 0);
      end.setTime(start.getTime() + 60 * 60 * 1000);
    }
    setDraft({ ...draft, isAllDay: enabled, startDateTime: toLocalInput(start), endDateTime: toLocalInput(end) });
  };
  const historicalBooking = Boolean(draft.id && isPastSchedule(new Date(draft.startDateTime), draft.isAllDay));
  const minimumDateTime = toLocalInput(new Date(Date.now() + 60_000));
  const minimumAllDay = toLocalInput(startOfDay(new Date()));
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
      <header className="modal-header"><div><div className="eyebrow">{draft.id ? "EDIT BLOCK" : "NEW BLOCK"}</div><h2 id="booking-title">{draft.id ? "Update resource block" : "Block a resource"}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
      <form onSubmit={onSave}>
        <div className="modal-body">
          {historicalBooking && <div className="past-booking-note" role="status">Past bookings can be viewed, updated, or deleted, but their schedule cannot be changed.</div>}
          <label>Resource<select value={draft.resourceId} onChange={event => update("resourceId", event.target.value)} required disabled={historicalBooking}>{resources.map(resource => <option key={resource.id} value={resource.id}>{resource.name} · {resource.type}</option>)}</select></label>
          <div className="form-grid">
            <label>Task number <em>Required</em><input autoFocus value={draft.taskNumber} onChange={event => update("taskNumber", event.target.value)} placeholder="e.g. PROJ-142" required /></label>
            <label>Task title<input value={draft.taskTitle} onChange={event => update("taskTitle", event.target.value)} placeholder="Short description" /></label>
          </div>
          <label>Task type <em>Required</em><select required value={draft.taskType} onChange={event => update("taskType", event.target.value as TaskType | "")}><option value="">Select task type</option><option>Banner</option><option>Emailer</option><option>IVA</option><option>Website</option><option>Screenshot</option></select></label>
          <div className="all-day-row"><div><strong>All-day block</strong><span>Block the resource for the full day</span></div><input type="checkbox" checked={draft.isAllDay} onChange={event => toggleAllDay(event.target.checked)} disabled={historicalBooking} /></div>
          <div className="form-grid">
            <label>Start date & time<input type="datetime-local" value={draft.startDateTime} min={historicalBooking ? undefined : draft.isAllDay ? minimumAllDay : minimumDateTime} onChange={event => update("startDateTime", event.target.value)} required disabled={historicalBooking} /></label>
            <label>End date & time<input type="datetime-local" value={draft.endDateTime} min={historicalBooking ? undefined : draft.isAllDay ? minimumAllDay : minimumDateTime} onChange={event => update("endDateTime", event.target.value)} required disabled={historicalBooking} /></label>
          </div>
          <label>Notes<textarea rows={3} value={draft.notes} onChange={event => update("notes", event.target.value)} placeholder="Add context for your team..." /></label>
        </div>
        <footer className="modal-footer">{draft.id && <button type="button" className="danger-text" onClick={onDelete}><Trash2 size={16} />Delete block</button>}<span /><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={saving}>{saving ? "Saving..." : draft.id ? "Save changes" : "Create block"}</button></footer>
      </form>
    </section>
  </div>;
}

function ResourcesPage({ notify }: { notify: (text: string, kind?: Toast["kind"]) => void }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Resource | null>(null);
  const [form, setForm] = useState({ name: "", type: "Person" as ResourceType, description: "" });
  const [loading, setLoading] = useState(true);
  const load = async () => { try { const response = await api.get("/resources"); setResources(response.data); } catch (error) { notify(errorMessage(error), "error"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try { if (editing) await api.put(`/resources/${editing.id}`, form); else await api.post("/resources", form); notify(editing ? "Resource updated" : "Resource added"); setEditing(null); setForm({ name: "", type: "Person", description: "" }); await load(); }
    catch (error) { notify(errorMessage(error), "error"); }
  };
  const edit = (resource: Resource) => { setEditing(resource); setForm({ name: resource.name, type: resource.type, description: resource.description }); };
  const deactivate = async (resource: Resource) => { try { await api.delete(`/resources/${resource.id}`); notify("Resource deactivated"); await load(); } catch (error) { notify(errorMessage(error), "error"); } };
  const filtered = resources.filter(resource => `${resource.name} ${resource.type} ${resource.description}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-content"><div className="page-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Resources</h1><p>Manage people, equipment, and rooms available for planning.</p></div></div>
    <div className="management-card"><div className="management-toolbar"><div><strong>All resources</strong><span>{resources.filter(item => item.isActive).length} active resources</span></div><div className="search-wrap"><Search size={16} /><input placeholder="Search resources..." value={query} onChange={event => setQuery(event.target.value)} /></div></div>
    {loading ? <TableSkeleton /> : filtered.length ? <div className="table-scroll"><table className="resources-table"><thead><tr><th>RESOURCE</th><th>TYPE</th><th>DESCRIPTION</th><th>STATUS</th><th className="action-head">ACTIONS</th></tr></thead><tbody>{filtered.map(resource => <tr key={resource.id}><td><div className="table-resource"><span className={`resource-icon ${resource.type.toLowerCase()}`}><Boxes size={16} /></span><strong>{resource.name}</strong></div></td><td>{resource.type}</td><td className="muted">{resource.description || "—"}</td><td><span className={`status-pill ${resource.isActive ? "status-active" : "status-inactive"}`}>{resource.isActive ? "Active" : "Inactive"}</span></td><td className="row-actions">{resource.isActive && <><button onClick={() => edit(resource)} title="Edit"><Pencil size={15} /></button><button onClick={() => void deactivate(resource)} title="Deactivate"><Trash2 size={15} /></button></>}</td></tr>)}</tbody></table></div> : <div className="table-empty"><Boxes size={22} /><strong>No resources match</strong><span>Add a resource or adjust your search.</span></div>}
    </div>
    {!editing && <div className="inline-form-card"><div className="inline-form-heading"><div className="eyebrow">QUICK ADD</div><h2>Add a resource</h2></div><ResourceForm form={form} setForm={setForm} submit={submit} button="Add resource" /></div>}
    {editing && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null); }}><section className="modal resource-modal" role="dialog" aria-modal="true" aria-labelledby="resource-title"><header className="modal-header"><div><div className="eyebrow">RESOURCE DETAILS</div><h2 id="resource-title">Edit resource</h2></div><button className="icon-btn" onClick={() => setEditing(null)} aria-label="Close"><X size={19} /></button></header><div className="modal-body"><ResourceForm form={form} setForm={setForm} submit={submit} button="Save changes" /></div></section></div>}
  </section>;
}

function ResourceForm({ form, setForm, submit, button }: { form: { name: string; type: ResourceType; description: string }; setForm: (value: { name: string; type: ResourceType; description: string }) => void; submit: (event: FormEvent) => void; button: string }) {
  return <form className="resource-form" onSubmit={submit}><label>Resource name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. Studio Room 2" /></label><label>Type<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value as ResourceType })}><option>Person</option><option>Equipment</option><option>Room</option></select></label><label>Description<input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Optional details" /></label><button className="primary-btn">{button}</button></form>;
}

function UsersPage({ notify }: { notify: (text: string, kind?: Toast["kind"]) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [form, setForm] = useState({ name: "", username: "", password: "", roles: ["PROJECT_MANAGER"] as Role[] });
  const load = async () => { try { const response = await api.get("/users"); setUsers(response.data); } catch (error) { notify(errorMessage(error), "error"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const toggleRole = (roles: Role[], role: Role) => roles.includes(role) ? roles.filter(item => item !== role) : [...roles, role];
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try { await api.post("/users", form); setShowForm(false); setForm({ name: "", username: "", password: "", roles: ["PROJECT_MANAGER"] }); notify("User created"); await load(); }
    catch (error) { notify(errorMessage(error), "error"); }
  };
  const saveRoles = async (event: FormEvent) => {
    event.preventDefault();
    if (!roleTarget || !selectedRoles.length) return;
    try { await api.patch(`/users/${roleTarget.id}`, { roles: selectedRoles }); setRoleTarget(null); notify("User roles updated"); await load(); }
    catch (error) { notify(errorMessage(error), "error"); }
  };
  const toggle = async (user: User) => {
    try { await api.patch(`/users/${user.id}`, { isActive: !user.isActive }); notify(user.isActive ? "User deactivated" : "User activated"); await load(); }
    catch (error) { notify(errorMessage(error), "error"); }
  };
  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetTarget) return;
    try { await api.patch(`/users/${resetTarget.id}`, { password: newPassword }); setResetTarget(null); setNewPassword(""); notify("Password reset"); }
    catch (error) { notify(errorMessage(error), "error"); }
  };
  return <section className="page-content"><div className="page-heading"><div><div className="eyebrow">ADMINISTRATION</div><h1>User management</h1><p>Create accounts and manage workspace access.</p></div><button className="primary-btn" onClick={() => setShowForm(!showForm)}><Plus size={17} />Create user</button></div>
    {showForm && <div className="inline-form-card user-create-card"><div className="inline-form-heading"><div className="eyebrow">NEW ACCOUNT</div><h2>Create a user</h2></div><form className="user-form" onSubmit={submit}><label>Full name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>Username<input required value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label><label>Temporary password<input required minLength={8} type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label><fieldset className="roles-picker"><legend>Roles</legend>{(Object.keys(roleLabels) as Role[]).map(role => <label key={role}><input type="checkbox" checked={form.roles.includes(role)} onChange={() => setForm({ ...form, roles: toggleRole(form.roles, role) })} />{roleLabels[role]}</label>)}</fieldset><button className="primary-btn" disabled={!form.roles.length}>Create user</button></form></div>}
    <div className="management-card"><div className="management-toolbar"><div><strong>Workspace users</strong><span>{users.length} accounts</span></div></div>{loading ? <TableSkeleton /> : users.length ? <div className="table-scroll"><table className="users-table"><thead><tr><th>USER</th><th>USERNAME</th><th>ROLES</th><th>STATUS</th><th className="action-head">ACTIONS</th></tr></thead><tbody>{users.map(item => <tr key={item.id}><td><div className="table-resource"><span className="avatar small-avatar">{item.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</span><strong>{item.name}</strong></div></td><td className="muted">{item.username}</td><td><div className="role-pills">{item.roles.map(role => <span className="role-pill" key={role}>{roleLabels[role]}</span>)}</div></td><td><span className={`status-pill ${item.isActive ? "status-active" : "status-inactive"}`}>{item.isActive ? "Active" : "Inactive"}</span></td><td className="row-actions"><button onClick={() => { setRoleTarget(item); setSelectedRoles(item.roles); }}>Edit roles</button><button onClick={() => { setResetTarget(item); setNewPassword(""); }}>Reset password</button><button onClick={() => void toggle(item)}>{item.isActive ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div> : <div className="table-empty"><UsersRound size={22} /><strong>No users yet</strong></div>}</div>
    {resetTarget && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setResetTarget(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title"><header className="modal-header"><div><div className="eyebrow">ACCOUNT SECURITY</div><h2 id="reset-title">Reset password</h2></div><button className="icon-btn" onClick={() => setResetTarget(null)} aria-label="Close"><X size={19} /></button></header><form onSubmit={resetPassword}><div className="modal-body"><p className="reset-description">Set a new password for {resetTarget.name}. It must be at least 8 characters.</p><label>New password<input type="password" minLength={8} required autoFocus value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label></div><footer className="modal-footer"><span /><button type="button" className="secondary-btn" onClick={() => setResetTarget(null)}>Cancel</button><button className="primary-btn">Reset password</button></footer></form></section></div>}
    {roleTarget && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setRoleTarget(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="roles-title"><header className="modal-header"><div><div className="eyebrow">ACCOUNT ACCESS</div><h2 id="roles-title">Edit roles</h2></div><button className="icon-btn" onClick={() => setRoleTarget(null)} aria-label="Close"><X size={19} /></button></header><form onSubmit={saveRoles}><div className="modal-body"><p className="reset-description">Choose one or more roles for {roleTarget.name}. Changes apply immediately.</p><fieldset className="roles-picker modal-roles-picker"><legend>Roles</legend>{(Object.keys(roleLabels) as Role[]).map(role => <label key={role}><input type="checkbox" checked={selectedRoles.includes(role)} onChange={() => setSelectedRoles(current => toggleRole(current, role))} />{roleLabels[role]}</label>)}</fieldset></div><footer className="modal-footer"><span /><button type="button" className="secondary-btn" onClick={() => setRoleTarget(null)}>Cancel</button><button className="primary-btn" disabled={!selectedRoles.length}>Save roles</button></footer></form></section></div>}
  </section>;
}

function TableSkeleton() {
  return <div className="table-skeleton">{[1, 2, 3, 4].map(item => <div key={item}><i /><span /><span /></div>)}</div>;
}
function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function isPastSchedule(start: Date, isAllDay: boolean) {
  const now = new Date();
  return isAllDay ? start < startOfDay(now) : start < now;
}

export default App;
