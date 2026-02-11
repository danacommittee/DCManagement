export type Role = "member" | "admin" | "super_admin";

/** Title: Mulla, Shaikh, bhai, bhen */
export type MemberTitle = "Mulla" | "Shaikh" | "bhai" | "bhen" | "";

export interface Member {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  itsNumber: string;
  phone: string;
  email: string;
  role: Role;
  teamIds: string[];
  /** Display name (e.g. "Title First Last"); may be computed from title + firstName + lastName */
  name: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Team {
  id: string;
  name: string;
  leaderId: string | null;
  memberIds: string[];
  /** 0=Sun, 1=Mon, ... 6=Sat; only for wrap-up day teams */
  dayOfWeek?: number;
  /** True for Monday Wrap-up, Tuesday Wrap-up, etc. */
  isWrapUp?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Event {
  id: string;
  name: string;
  /** ISO date-time string (e.g. "2025-03-01T08:00:00") */
  dateFrom: string;
  dateTo: string;
  teamIds: string[];
  /** Per-team overrides for this event only: memberIds and/or leaderId */
  teamOverrides?: Record<string, { memberIds?: string[]; leaderId?: string }>;
  /** Overall event duration (super admin only) */
  overallStartTime?: string;
  overallEndTime?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export type TemplateCategory = "daily" | "weekly" | "special_event" | "custom";

export interface Template {
  id: string;
  name: string;
  body: string;
  category: TemplateCategory;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  templateId: string;
  audienceType: "individual" | "sub_team" | "entire_team";
  audienceId?: string;
  channel: "whatsapp" | "sms" | "email";
  recipientIds: string[];
  sentAt: number;
  createdBy: string;
}

export interface AttendanceRecord {
  id: string;
  eventId?: string;
  teamId: string;
  date: string;
  submittedBy: string;
  presentIds: string[];
  absentIds: string[];
  /** Per-team per-day tracking */
  startTime?: string;
  endTime?: string;
  notes?: string;
  createdAt: number;
}
