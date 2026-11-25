export type Role = "ADMIN" | "TEAM_LEAD" | "PROJECT_MANAGER";
export type ResourceType = "Person" | "Equipment" | "Room";
export type TaskType = "Banner" | "Emailer" | "IVA" | "Website" | "Screenshot";
export interface User {
  id: string; name: string; username: string; roles: Role[]; isActive?: boolean;
}
export interface Resource {
  id: string; name: string; type: ResourceType; description: string; isActive: boolean;
}
export interface Booking {
  id: string; resourceId: string; taskNumber: string; taskType?: TaskType | null; taskTitle?: string | null;
  startDateTime: string; endDateTime: string; isAllDay: boolean; notes: string;
  createdBy: string; resource?: Resource; creator?: { id: string; name: string };
}
export type BookingRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export interface BookingRequest {
  id: string;
  resourceId: string | null;
  taskNumber: string;
  taskType: TaskType;
  taskTitle?: string | null;
  startDateTime: string;
  endDateTime: string;
  isAllDay: boolean;
  notes: string;
  status: BookingRequestStatus;
  createdBy: string;
  createdAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  resource?: Resource | null;
  requester?: { id: string; name: string; username: string };
  reviewer?: { id: string; name: string } | null;
}
