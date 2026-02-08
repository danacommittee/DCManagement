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
  teamId: string;
  date: string;
  submittedBy: string;
  presentIds: string[];
  absentIds: string[];
  createdAt: number;
}
