# Design Document
## Dana Committee Management System (DCMS)
### Functional Design

*Prepared for Dana Committee Volunteer Operations during Shahr-e-Lillah al-Muazzam and year-round management.*

---

## 1. Overview

This document describes the functional design of DCMS: modules, screens, and user flows. The design aims for clarity and role-based workflows so Super Admins and Team Leaders can perform their tasks efficiently.

---

## 2. Modules & Functional Design

### 2.1 Dashboard
- **Purpose:** High-level overview for Super Admins.
- **Content:**
  - Total members
  - Total sub-teams
  - Attendance rate (e.g. percentage or trend)
  - Recent activity (e.g. recent messages, attendance submissions)

### 2.2 Team Management Interface
- **Purpose:** Configure sub-teams, members, and leaders.
- **Functionality:**
  - Create, edit, and delete sub-teams
  - Assign and reassign members to sub-teams
  - Configure and change team leaders per sub-team
  - View member list and sub-team membership

### 2.3 Template Manager
- **Purpose:** Create and maintain reusable message templates.
- **Functionality:**
  - Create and edit templates
  - Support placeholders (e.g. `{{Name}}`, `{{Team}}`)
  - **Categories:** Daily, Weekly, Special Event, Custom

### 2.4 Message Engine
- **Purpose:** Send communications to the right audience via the right channel.
- **Functionality:**
  - **Audience selection:** Individual, Sub-team, Entire Team
  - **Delivery channel:** WhatsApp, SMS, Email (via Twilio)
  - Select template and optionally customize before send
  - Send and track (as per product scope)

### 2.5 Attendance Module
- **Purpose:** Collect attendance from team leaders.
- **Functionality:**
  - Team leaders receive a **secure link** to mark attendance
  - Leaders submit attendance for their sub-team (e.g. present/absent or custom options)
  - Data stored for reporting

### 2.6 Reporting Module
- **Purpose:** On-demand reports for Super Admins.
- **Functionality:**
  - Generate **downloadable reports** (CSV and/or PDF)
  - **Filtering options:** e.g. date range, sub-team, full organization
  - Reports reflect attendance and other metrics as defined in the PRD

---

## 3. User Flows (High-Level)

### 3.1 Super Admin: Initial Setup
1. Configure sub-teams and assign leaders.
2. Upload members via CSV and assign to sub-teams.
3. Create message templates as needed.

### 3.2 Super Admin: Send Broadcast
1. Open Message Engine.
2. Select audience (Individual / Sub-team / Entire Team).
3. Select template and channel (WhatsApp / SMS / Email).
4. Send.

### 3.3 Team Leader: Submit Attendance
1. Receive secure survey/link (e.g. via message).
2. Open link and mark attendance for assigned sub-team.
3. Submit; data is stored for reporting.

### 3.4 Super Admin: View Report
1. Open Reporting Module.
2. Set filters (e.g. date range, sub-team).
3. Generate and download report (CSV/PDF).

---

## 4. Data / Entity Relationships (Conceptual)

- **Members** – belong to one or more **Sub-teams**; have Name, Phone, Email.
- **Sub-teams** – have one **Team Leader**; contain many **Members**.
- **Templates** – used by **Message Engine**; have category and placeholder definitions.
- **Messages** – sent via Message Engine; link to template, audience, channel, timestamp.
- **Attendance records** – linked to sub-team, date, and (as needed) member or leader; used for **Reports**.

No database schema is defined here; this is for product/design alignment only.
