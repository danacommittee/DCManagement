# DCMS Implementation To-Do List
## Dana Committee Management System

Actionable checklist for implementation and rollout. Derived from the PRD, Design Doc, and TechStack.

---

## Setup & infra
- [x] Initialize repo and ensure `.gitignore` / `.env.local` in place
- [ ] Create Vercel project and link to repo
- [ ] Firebase project configured (Firestore, Auth) – use existing project
- [ ] Twilio account and API credentials *(ask later)*
- [x] Environment variables set (local: Firebase in `.env.local`; Vercel: set in dashboard)

---

## Auth & RBAC
- [x] Integrate Firebase Authentication (Google Sign-In)
- [x] Email allowlist: only members in Firestore can log in; role per member (member, admin, super_admin)
- [x] Protect routes and API by role (dashboard layout + API checks)

---

## Data model & backend
- [x] Firestore collections: members, teams, templates, messages, attendance, attendance_links
- [x] CRUD APIs for members, teams, templates; send message; attendance; reports
- [x] Firestore security rules (client denied; server uses Admin SDK)

---

## Member & team management
- [x] CSV upload for members (Name, Phone, Email, Role)
- [x] Sub-teams CRUD (create, edit, delete)
- [x] Assign and reassign members to sub-teams
- [x] Assign and reassign team leaders per sub-team
- [x] Edit member role (Super Admin) in Members UI

---

## Templates & messaging
- [x] Template CRUD with categories (Daily, Weekly, Special Event, Custom)
- [x] Placeholder support (e.g. `{{Name}}`, `{{Team}}`) – parsing ready for Twilio
- [ ] Twilio integration (WhatsApp, SMS, Email) – *add credentials when provided*
- [x] Message Engine UI: audience (Individual, Sub-team, Entire Team), channel, template, send (logged until Twilio added)

---

## Attendance
- [x] Generate secure survey/link for team leaders (Super Admin / Admin)
- [x] Leader flow: submit attendance for sub-team (in dashboard)
- [x] Public link flow: open link, mark present/absent, submit (no login)
- [x] Store attendance in Firestore; date-range filtering in reports

---

## Reporting
- [x] Report generation (CSV download)
- [x] Filters: date range, sub-team, full organization
- [x] On-demand run from Reporting Module UI

---

## Dashboard
- [x] KPIs: total members, sub-teams, attendance rate
- [x] Recent attendance and recent messages
- [x] Role-based nav: Member (dashboard only), Admin/Super Admin (full nav)

---

## Testing & launch
- [ ] UAT with Super Admin, Admin, Member flows
- [ ] Add Twilio credentials when provided
- [ ] Deploy to Vercel and set env vars
- [ ] Rollout plan and go-live
