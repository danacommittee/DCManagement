export type Role = "member" | "admin" | "super_admin";

/** Title: Mulla, Shaikh, Bhai, Bhen */
export type MemberTitle = "Mulla" | "Shaikh" | "Bhai" | "Bhen" | "";

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
  notifyEmail?: boolean;
  notifySms?: boolean;
  notifyPush?: boolean;
  /** Display name (e.g. "Title First Last"); may be computed from title + firstName + lastName */
  name: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Team {
  id: string;
  name: string;
  leaderId: string | null;
  /** Optional second leader for this team */
  leader2Id: string | null;
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
  /** Per-team overrides for this event only: memberIds and/or leaders */
  teamOverrides?: Record<string, { memberIds?: string[]; leaderId?: string; leader2Id?: string }>;
  /** Per-day start/end times (super admin only). Key is date YYYY-MM-DD, value has startTime/endTime as HH:mm strings */
  dailyTimes?: Record<string, { startTime?: string; endTime?: string }>;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export type TemplateCategory = "daily" | "weekly" | "special_event" | "custom";

export interface TemplateAttachment {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size?: number;
  inline: boolean;
  cidKey?: string;
  createdAt: number;
}

export interface Template {
  id: string;
  name: string;
  body: string;
  category: TemplateCategory;
  attachments?: TemplateAttachment[];
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  templateId: string;
  audienceType: "individual" | "sub_team" | "entire_team";
  audienceId?: string;
  channel: "whatsapp" | "sms" | "email" | "push";
  recipientIds: string[];
  sentAt: number;
  createdBy: string;
}

export interface ScheduledMessage {
  id: string;
  templateId: string;
  eventId?: string;
  audienceType: "individual" | "sub_team" | "entire_team";
  audienceId?: string;
  audienceIds?: string[];
  bodyOverride?: string;
  subjectOverride?: string;
  /** If false, always use bodyOverride; otherwise use latest template body. */
  useTemplateBody?: boolean;
  channels: ("email" | "sms" | "whatsapp" | "push")[];
  scheduledAt: number; // Unix timestamp in milliseconds
  status: "pending" | "sending" | "sent" | "failed";
  createdAt: number;
  createdBy: string;
  sentAt?: number; // When it was actually sent
  error?: string;
  /** Recurrence: "daily" = every day at recurrenceTime; "weekly" = every recurrenceDayOfWeek at recurrenceTime */
  recurrence?: "daily" | "weekly" | null;
  recurrenceTime?: string; // "HH:mm" 24h
  recurrenceDayOfWeek?: number; // 0=Sun .. 6=Sat, for weekly
  /** Optional end date for recurrence (YYYY-MM-DD). No next run is created after this date. */
  recurrenceEndDate?: string | null;
  /** Per-recipient, per-channel results for this run (stored after send). */
  sendDetails?: {
    recipientId: string;
    recipientName: string;
    channels: { channel: string; ok: boolean; error?: string | null }[];
  }[];
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

export type LeftoverContainerType =
  | "full_aluminum_tray"
  | "half_aluminum_tray"
  | "bucket_5gal"
  | "container_16oz"
  | "container_24oz"
  | "container_32oz"
  | "crate";

export interface LeftoverItem {
  id: string;
  containerType: LeftoverContainerType;
  contents: string;
  count: number;
}

export interface LeftoverRecord {
  id: string;
  eventId: string;
  date: string;
  items: LeftoverItem[];
  submittedBy: string;
  submittedByName?: string;
  createdAt: number;
  updatedAt: number;
}
