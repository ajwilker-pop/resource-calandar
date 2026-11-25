import { useCallback, useEffect, useState, type FormEvent } from "react";
import { format, parseISO } from "date-fns";
import { Check, ClipboardList, X } from "lucide-react";
import { api, errorMessage } from "./api";
import { announceBookingChange } from "./bookingEvents";
import type { BookingRequest, Resource, Role, TaskType, User } from "./types";

type Toast = (text: string, kind?: "success" | "error") => void;
type RequestDraft = {
  taskNumber: string;
  taskType: TaskType | "";
  taskTitle: string;
  start: string;
  duration: string;
  isAllDay: boolean;
  notes: string;
};

const taskTypes: TaskType[] = ["Banner", "Emailer", "IVA", "Website", "Screenshot"];
const canReview = (user: User) => user.roles.some((role: Role) => role === "ADMIN" || role === "TEAM_LEAD");

function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function BookingRequestCard({ request, allowReview, reviewing, resources, resourceId, onResourceChange, onApprove, onReject }: {
  request: BookingRequest;
  allowReview: boolean;
  reviewing: boolean;
  resources: Resource[];
  resourceId: string;
  onResourceChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const duration = request.isAllDay
    ? `${Math.max(1, Math.round((parseISO(request.endDateTime).getTime() - parseISO(request.startDateTime).getTime()) / 86_400_000))} day(s)`
    : `${((parseISO(request.endDateTime).getTime() - parseISO(request.startDateTime).getTime()) / 3_600_000).toLocaleString()} hour(s)`;
  return <article className="request-card">
    <div className="request-card-main">
      <div className="request-card-title"><strong>{request.taskNumber}</strong><span className={`request-status status-${request.status.toLowerCase()}`}>{request.status.toLowerCase()}</span></div>
      <p>{request.taskTitle || "No task title"}</p>
      <div className="request-details">
        <span><b>Resource</b>{request.resource?.name ?? "To be assigned"}</span>
        <span><b>Task type</b>{request.taskType}</span>
        <span><b>Duration</b>{duration}</span>
        <span><b>Schedule</b>{request.isAllDay
          ? `${format(parseISO(request.startDateTime), "PP")} – ${format(new Date(parseISO(request.endDateTime).getTime() - 1), "PP")}`
          : `${format(parseISO(request.startDateTime), "PP p")} – ${format(parseISO(request.endDateTime), "PP p")}`}</span>
        {request.requester && <span><b>Requested by</b>{request.requester.name}</span>}
      </div>
      {request.notes && <p className="request-notes">{request.notes}</p>}
      {request.status === "REJECTED" && request.rejectionReason && <p className="request-notes">Reason: {request.rejectionReason}</p>}
      {request.reviewer && request.reviewedAt && <small className="request-review-meta">Reviewed by {request.reviewer.name} · {format(parseISO(request.reviewedAt), "PP p")}</small>}
    </div>
    {allowReview && request.status === "PENDING" && <div className="request-actions">
      <label className="request-assignment">Assign resource<select aria-label={`Assign resource for ${request.taskNumber}`} value={resourceId} onChange={event => onResourceChange(event.target.value)} disabled={reviewing}><option value="">Select an active resource</option>{resources.map(resource => <option key={resource.id} value={resource.id}>{resource.name} · {resource.type}</option>)}</select></label>
      <div className="request-buttons"><button className="secondary-btn" onClick={onReject} disabled={reviewing}><X size={15} />Reject</button>
      <button className="primary-btn" onClick={onApprove} disabled={reviewing || !resourceId}><Check size={15} />Approve</button></div>
      {!resources.length && <span className="request-empty-hint">No active resources available to assign.</span>}
    </div>}
  </article>;
}

export default function RequestsPage({ user, notify }: { user: User; notify: Toast }) {
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const isRequester = user.roles.includes("PROJECT_MANAGER");
  const isReviewer = canReview(user);
  const [draft, setDraft] = useState<RequestDraft>(() => ({
    taskNumber: "",
    taskType: "",
    taskTitle: "",
    start: localDateTime(new Date(Date.now() + 60_000)),
    duration: "1",
    isAllDay: false,
    notes: ""
  }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestResponse, resourceResponse] = await Promise.all([
        api.get("/booking-requests"),
        isReviewer ? api.get("/resources") : Promise.resolve({ data: [] })
      ]);
      setRequests(requestResponse.data);
      const activeResources = resourceResponse.data.filter((resource: Resource) => resource.isActive);
      setResources(activeResources);
      setAssignments(current => Object.fromEntries(requestResponse.data.map((request: BookingRequest) => [
        request.id,
        current[request.id] ?? request.resourceId ?? ""
      ])));
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [isReviewer, notify]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const start = draft.isAllDay ? new Date(`${draft.start}T00:00:00`) : new Date(draft.start);
      const end = new Date(start);
      if (draft.isAllDay) end.setDate(end.getDate() + Number(draft.duration));
      else end.setTime(end.getTime() + Number(draft.duration) * 3_600_000);
      await api.post("/booking-requests", {
        taskNumber: draft.taskNumber,
        taskType: draft.taskType,
        taskTitle: draft.taskTitle || null,
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        isAllDay: draft.isAllDay,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notes: draft.notes
      });
      notify("Booking request submitted for approval");
      setDraft(current => ({ ...current, taskNumber: "", taskTitle: "", notes: "" }));
      await load();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const review = async (request: BookingRequest, action: "approve" | "reject", resourceId?: string) => {
    if (action === "approve" && !resourceId) {
      notify("Assign an active resource before approving this request.", "error");
      return;
    }
    setReviewingId(request.id);
    try {
      await api.post(`/booking-requests/${request.id}/${action}`, action === "approve" ? { resourceId } : {});
      if (action === "approve") announceBookingChange();
      notify(action === "approve" ? "Request approved and resource blocked" : "Request rejected");
      await load();
    } catch (error) {
      notify(errorMessage(error), "error");
      await load();
    } finally {
      setReviewingId(null);
    }
  };

  const pending = requests.filter(request => request.status === "PENDING");
  const myRequests = requests.filter(request => request.createdBy === user.id);
  const startMinimum = localDateTime(new Date(Date.now() + 60_000));
  const dateMinimum = startMinimum.slice(0, 10);

  return <section className="page-content requests-page">
    <div className="page-heading"><div><div className="eyebrow">{isReviewer ? "WORKSPACE" : "RESOURCE PLANNING"}</div><h1>{isReviewer ? "Booking requests" : "Submit a work request"}</h1><p>{isReviewer ? "Assign an active resource, then approve or reject each request." : "Submit task details and duration; a Team Lead or Admin will assign the resource."}</p></div></div>
    {isRequester && <section className="inline-form-card request-form-card">
      <div className="inline-form-heading"><div className="eyebrow">NEW REQUEST</div><h2>Submit task details</h2></div>
      <form className="request-form" onSubmit={submit}>
        <label>Task number<input required value={draft.taskNumber} onChange={event => setDraft({ ...draft, taskNumber: event.target.value })} placeholder="e.g. PROJ-142" /></label>
        <label>Task type<select required value={draft.taskType} onChange={event => setDraft({ ...draft, taskType: event.target.value as TaskType | "" })}><option value="">Select task type</option>{taskTypes.map(type => <option key={type}>{type}</option>)}</select></label>
        <label>Task title<input value={draft.taskTitle} onChange={event => setDraft({ ...draft, taskTitle: event.target.value })} placeholder="Optional description" /></label>
        <div className="request-schedule">
          <label>{draft.isAllDay ? "Start date" : "Start date & time"}<input type={draft.isAllDay ? "date" : "datetime-local"} required min={draft.isAllDay ? dateMinimum : startMinimum} value={draft.isAllDay ? draft.start.slice(0, 10) : draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} /></label>
          <label>Duration ({draft.isAllDay ? "days" : "hours"})<input type="number" min="1" step="1" required value={draft.duration} onChange={event => setDraft({ ...draft, duration: event.target.value })} /></label>
          <label className="request-all-day"><input type="checkbox" checked={draft.isAllDay} onChange={event => {
            const enabled = event.target.checked;
            const date = draft.start.slice(0, 10);
            setDraft({ ...draft, isAllDay: enabled, start: enabled ? date : `${date}T09:00`, duration: "1" });
          }} />All-day request</label>
        </div>
        <label className="request-notes-field">Notes<textarea rows={2} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="Additional context for the reviewer" /></label>
        <div className="request-submit-row"><span>Requests do not block the calendar until assigned and approved.</span><button className="primary-btn" disabled={submitting}>{submitting ? "Submitting..." : "Submit work request"}</button></div>
      </form>
    </section>}
    {isReviewer && <section className="requests-section">
      <div className="requests-section-heading"><div><h2>Awaiting review</h2><span>{pending.length} pending</span></div></div>
      {loading ? <RequestSkeleton /> : pending.length ? <div className="request-list">{pending.map(request => <BookingRequestCard key={request.id} request={request} allowReview resources={resources} resourceId={assignments[request.id] ?? ""} onResourceChange={value => setAssignments(current => ({ ...current, [request.id]: value }))} reviewing={reviewingId === request.id} onApprove={() => void review(request, "approve", assignments[request.id])} onReject={() => void review(request, "reject")} />)}</div> : <div className="request-empty"><ClipboardList size={23} /><strong>No pending requests</strong><span>New Project Manager requests will appear here.</span></div>}
    </section>}
    {isRequester && <section className="requests-section">
      <div className="requests-section-heading"><div><h2>My requests</h2><span>{myRequests.length} total</span></div></div>
      {loading ? <RequestSkeleton /> : myRequests.length ? <div className="request-list">{myRequests.map(request => <BookingRequestCard key={request.id} request={request} allowReview={false} resources={[]} resourceId="" onResourceChange={() => undefined} reviewing={false} onApprove={() => undefined} onReject={() => undefined} />)}</div> : <div className="request-empty"><ClipboardList size={23} /><strong>No requests yet</strong><span>Your submitted requests and their approval status will appear here.</span></div>}
    </section>}
    {!isRequester && !isReviewer && <div className="request-empty"><ClipboardList size={23} /><strong>Requests unavailable</strong></div>}
  </section>;
}

function RequestSkeleton() {
  return <div className="request-skeleton" aria-label="Loading requests"><i /><i /><i /></div>;
}
