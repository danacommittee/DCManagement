# Product Requirements Document (PRD)
## Dana Committee Management System (DCMS)

*Prepared for Dana Committee Volunteer Operations during Shahr-e-Lillah al-Muazzam and year-round management.*

---

## 1. Introduction & Context

The Dana Committee Management System (DCMS) is a dynamic web-based management system prepared for **Dana Committee Volunteer Operations** during **Shahr-e-Lillah al-Muazzam** and year-round management. The system coordinates volunteers, manages sub-teams, sends personalized communications, tracks attendance, and generates performance reports on demand.

---

## 2. Objectives

- Build a **dynamic web-based management system** to:
  - Coordinate volunteers
  - Manage sub-teams
  - Send personalized communications
  - Track attendance
  - Generate performance reports on demand

---

## 3. User Roles & Permissions

| Role | Description | Permissions |
|------|-------------|-------------|
| **Super Admin** | Full system control | CSV upload, team configuration, messaging, attendance links, reporting, assign roles |
| **Admin** | Team leader / admin | Manage assigned sub-teams, submit attendance, templates, send messages, view reports for own teams |
| **Member** | Volunteer member | Login to view dashboard; receives communications; no management access |

All members have login (Google Sign-In). Only emails present in the member list (uploaded via CSV) can sign in. Super Admin pre-assigns access level (member, admin, super_admin) per member in the CSV or in the Members UI.

---

## 4. Core Functional Requirements

### 4.1 Member Management
- Upload members via **CSV** with fields: **Name**, **Phone**, **Email**, **Role** (optional; default: member). Roles: `member`, `admin`, `super_admin`.
- Only these emails can sign in (Google); Firebase Auth is restricted to this allowlist via the app (member document in Firestore).

### 4.2 Team Management
- Create **unlimited dynamic sub-teams**.
- Assign and reassign **members** and **leaders** at any time.

### 4.3 Messaging & Templates
- Create **reusable message templates** with placeholders (e.g. `{{Name}}`, `{{Team}}`).
- Send communications via **Twilio** (WhatsApp, SMS, Email).

### 4.4 Attendance
- **Attendance surveys** automatically sent to team leaders.
- **On-demand attendance reports** for sub-teams and full organization.
- **Custom date-range filtering** for reports.

---

## 5. Out of Scope / Assumptions

- **Twilio:** Credentials are requested later; messaging is implemented with send logged until Twilio is configured.
- Scope is limited to the features above; additional modules may be considered for future versions.
