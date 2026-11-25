import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format, startOfMonth } from "date-fns";
import { Download, BarChart3, Boxes, Clock3 } from "lucide-react";
import { api, errorMessage } from "./api";
import type { Booking, Resource } from "./types";
import { subscribeToBookingChanges } from "./bookingEvents";

type ToastNotify = (text: string, kind?: "success" | "error") => void;

function localDateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function hoursInRange(booking: Booking, from: Date, to: Date) {
  const start = Math.max(new Date(booking.startDateTime).getTime(), from.getTime());
  const end = Math.min(new Date(booking.endDateTime).getTime(), to.getTime());
  if (end <= start) return 0;
  if (booking.isAllDay) return Math.max(1, differenceInCalendarDays(new Date(end), new Date(start))) * 8;
  return Math.max(0, end - start) / 3_600_000;
}

export default function ReportsPage({ notify }: { notify: ToastNotify }) {
  const today = new Date();
  const [fromDate, setFromDate] = useState(localDateInput(startOfMonth(today)));
  const [toDate, setToDate] = useState(localDateInput(today));
  const [resources, setResources] = useState<Resource[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingAll, setExportingAll] = useState(false);

  const range = useMemo(() => {
    if (!fromDate || !toDate) return null;
    const from = new Date(`${fromDate}T00:00:00`);
    const to = addDays(new Date(`${toDate}T00:00:00`), 1);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) return null;
    return { from, to };
  }, [fromDate, toDate]);

  const load = useCallback(async () => {
    if (!range) {
      setResources([]);
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [resourceResponse, bookingResponse] = await Promise.all([
        api.get("/resources"),
        api.get("/bookings", { params: { from: range.from.toISOString(), to: range.to.toISOString() } })
      ]);
      setResources(resourceResponse.data);
      setBookings(bookingResponse.data);
    } catch (error) {
      setResources([]);
      setBookings([]);
      notify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [notify, range]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => { void load(); };
    const unsubscribe = subscribeToBookingChanges(refresh);
    const onFocus = () => { if (document.visibilityState === "visible") refresh(); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const activeResources = resources.filter(resource => resource.isActive);
  const resourceRows = resources.map(resource => {
    const resourceBookings = bookings.filter(booking => booking.resourceId === resource.id);
    const hours = range ? resourceBookings.reduce((sum, booking) => sum + hoursInRange(booking, range.from, range.to), 0) : 0;
    return { resource, bookings: resourceBookings, hours };
  });
  const totalHours = range ? bookings.reduce((sum, booking) => sum + hoursInRange(booking, range.from, range.to), 0) : 0;

  const exportResource = async (resource: Resource, rows: Booking[]) => {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Resource Blocking Calendar";
      workbook.created = new Date();
      const sheet = workbook.addWorksheet("Bookings");
      sheet.columns = [
        { header: "Task number", key: "taskNumber", width: 18 },
        { header: "Task type", key: "taskType", width: 16 },
        { header: "Task title", key: "taskTitle", width: 32 },
        { header: "Resource", key: "resource", width: 24 },
        { header: "Booking date", key: "bookingDate", width: 18 },
        { header: "Start", key: "start", width: 24 },
        { header: "End", key: "end", width: 24 },
        { header: "All day", key: "allDay", width: 12 },
        { header: "Hours", key: "hours", width: 12 },
        { header: "Booked by", key: "creator", width: 24 },
        { header: "Notes", key: "notes", width: 40 }
      ];
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF426FD3" } };
      for (const booking of rows) {
        sheet.addRow({
          taskNumber: booking.taskNumber,
          taskType: booking.taskType ?? "",
          taskTitle: booking.taskTitle ?? "",
          resource: resource.name,
          bookingDate: format(new Date(booking.startDateTime), "yyyy-MM-dd"),
          start: format(new Date(booking.startDateTime), "yyyy-MM-dd HH:mm"),
          end: format(new Date(booking.endDateTime), "yyyy-MM-dd HH:mm"),
          allDay: booking.isAllDay ? "Yes" : "No",
          hours: range ? Number(hoursInRange(booking, range.from, range.to).toFixed(2)) : 0,
          creator: booking.creator?.name ?? "",
          notes: booking.notes
        });
      }
      sheet.autoFilter = { from: "A1", to: "K1" };
      const file = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([file], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      const safeName = resource.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "resource";
      link.download = `${safeName}-bookings-${fromDate}-to-${toDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`Excel export ready for ${resource.name}`);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const exportAllResources = async () => {
    if (!range) return;
    setExportingAll(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Resource Blocking Calendar";
      workbook.created = new Date();

      const detail = workbook.addWorksheet("All Bookings");
      detail.columns = [
        { header: "Task number", key: "taskNumber", width: 18 },
        { header: "Task type", key: "taskType", width: 16 },
        { header: "Task title", key: "taskTitle", width: 32 },
        { header: "Resource", key: "resource", width: 26 },
        { header: "Resource type", key: "resourceType", width: 16 },
        { header: "Booking date", key: "bookingDate", width: 18 },
        { header: "Start", key: "start", width: 24 },
        { header: "End", key: "end", width: 24 },
        { header: "All day", key: "allDay", width: 12 },
        { header: "Hours", key: "hours", width: 12 },
        { header: "Booked by", key: "creator", width: 24 },
        { header: "Notes", key: "notes", width: 40 }
      ];
      for (const booking of bookings) {
        const resource = resources.find(item => item.id === booking.resourceId);
        detail.addRow({
          taskNumber: booking.taskNumber,
          taskType: booking.taskType ?? "",
          taskTitle: booking.taskTitle ?? "",
          resource: resource?.name ?? booking.resource?.name ?? "",
          resourceType: resource?.type ?? booking.resource?.type ?? "",
          bookingDate: format(new Date(booking.startDateTime), "yyyy-MM-dd"),
          start: format(new Date(booking.startDateTime), "yyyy-MM-dd HH:mm"),
          end: format(new Date(booking.endDateTime), "yyyy-MM-dd HH:mm"),
          allDay: booking.isAllDay ? "Yes" : "No",
          hours: Number(hoursInRange(booking, range.from, range.to).toFixed(2)),
          creator: booking.creator?.name ?? "",
          notes: booking.notes
        });
      }

      const summary = workbook.addWorksheet("Resource Summary");
      summary.columns = [
        { header: "Resource", key: "resource", width: 26 },
        { header: "Type", key: "type", width: 16 },
        { header: "Status", key: "status", width: 14 },
        { header: "Bookings", key: "bookings", width: 14 },
        { header: "Blocked hours", key: "hours", width: 18 }
      ];
      for (const { resource, bookings: rows, hours } of resourceRows) {
        summary.addRow({
          resource: resource.name,
          type: resource.type,
          status: resource.isActive ? "Active" : "Inactive",
          bookings: rows.length,
          hours: Number(hours.toFixed(2))
        });
      }

      for (const sheet of [summary, detail]) {
        const lastColumn = sheet.columnCount;
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF426FD3" } };
        sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + lastColumn)}1` };
      }

      const file = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([file], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `all-resources-bookings-${fromDate}-to-${toDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Overall report exported for all resources");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setExportingAll(false);
    }
  };

  return <section className="page-content">
    <div className="page-heading"><div><div className="eyebrow">ADMINISTRATION</div><h1>Reports &amp; dashboard</h1><p>Review resource blocking activity and export detailed booking data.</p></div></div>
    <section className="management-card reports-card">
      <div className="reports-toolbar">
        <div><strong>Reporting period</strong><span>Bookings overlapping the selected dates are included.</span></div>
        <div className="report-date-fields">
          <label>From<input type="date" value={fromDate} max={toDate || undefined} onChange={event => setFromDate(event.target.value)} /></label>
          <label>To<input type="date" value={toDate} min={fromDate || undefined} onChange={event => setToDate(event.target.value)} /></label>
          <button className="primary-btn report-export-all" onClick={() => void exportAllResources()} disabled={loading || !range || !resources.length || exportingAll}><Download size={15} />{exportingAll ? "Preparing export..." : "Export all to Excel"}</button>
        </div>
      </div>
      {!range && <div className="report-error" role="alert">Choose a valid date range; the end date must be on or after the start date.</div>}
      <div className="report-metrics">
        <article className="report-metric"><span className="report-metric-icon"><Boxes size={17} /></span><div><small>Active resources</small><strong>{loading ? "—" : activeResources.length}</strong></div></article>
        <article className="report-metric"><span className="report-metric-icon"><BarChart3 size={17} /></span><div><small>Bookings in range</small><strong>{loading ? "—" : bookings.length}</strong></div></article>
        <article className="report-metric"><span className="report-metric-icon"><Clock3 size={17} /></span><div><small>Blocked hours</small><strong>{loading ? "—" : totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong></div></article>
      </div>
      <div className="management-toolbar report-table-toolbar"><div><strong>Resource breakdown</strong><span>{resourceRows.length} resources</span></div></div>
      {loading ? <div className="table-skeleton">{[1, 2, 3].map(item => <div key={item}><i /><span /><span /></div>)}</div> : resourceRows.length ? <div className="table-scroll"><table className="reports-table"><thead><tr><th>RESOURCE</th><th>TYPE</th><th>STATUS</th><th>BOOKINGS</th><th>BLOCKED HOURS</th><th className="action-head">EXPORT</th></tr></thead><tbody>{resourceRows.map(({ resource, bookings: rows, hours }) => <tr key={resource.id}><td><strong className="report-resource-name">{resource.name}</strong></td><td>{resource.type}</td><td><span className={`status-pill ${resource.isActive ? "status-active" : "status-inactive"}`}>{resource.isActive ? "Active" : "Inactive"}</span></td><td>{rows.length}</td><td>{hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td><td className="row-actions"><button className="export-btn" onClick={() => void exportResource(resource, rows)} aria-label={`Export ${resource.name} bookings to Excel`}><Download size={14} />Excel</button></td></tr>)}</tbody></table></div> : <div className="table-empty"><Boxes size={22} /><strong>No resources available</strong><span>Resources will appear here once they are added.</span></div>}
      {!loading && resourceRows.length > 0 && bookings.length === 0 && <div className="report-empty-note">No bookings overlap this reporting period. You can still export a workbook with an empty booking list for any resource.</div>}
      <div className="management-toolbar report-table-toolbar"><div><strong>Booking details</strong><span>{bookings.length} bookings in the selected period</span></div></div>
      {loading ? <div className="table-skeleton">{[1, 2, 3].map(item => <div key={item}><i /><span /><span /></div>)}</div> : bookings.length ? <div className="table-scroll"><table className="reports-table booking-details-table"><thead><tr><th>RESOURCE</th><th>TASK NUMBER</th><th>TASK TYPE</th><th>TASK TITLE</th><th>BOOKING DATE</th><th>TIME</th><th>HOURS</th></tr></thead><tbody>{bookings.map(booking => {
        const resource = resources.find(item => item.id === booking.resourceId) ?? booking.resource;
        const start = new Date(booking.startDateTime);
        const end = new Date(booking.endDateTime);
        const lastDay = new Date(end.getTime() - 1);
        const bookingDate = format(start, "yyyy-MM-dd") !== format(lastDay, "yyyy-MM-dd")
          ? `${format(start, "PP")} – ${format(lastDay, "PP")}`
          : format(start, "PP");
        return <tr key={booking.id}><td>{resource?.name ?? "—"}</td><td><strong className="report-resource-name">{booking.taskNumber}</strong></td><td>{booking.taskType ?? "—"}</td><td>{booking.taskTitle || "—"}</td><td>{bookingDate}</td><td>{booking.isAllDay ? "All day" : `${format(start, "p")} – ${format(end, "p")}`}</td><td>{(range ? hoursInRange(booking, range.from, range.to) : 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td></tr>;
      })}</tbody></table></div> : <div className="table-empty"><Clock3 size={22} /><strong>No bookings in this period</strong><span>Bookings will appear here as resources are blocked.</span></div>}
    </section>
  </section>;
}
