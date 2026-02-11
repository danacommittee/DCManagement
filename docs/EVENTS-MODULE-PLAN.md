# Events Module – Implementation Plan

## Overview

- **Events** are the primary container. Each event has a name, date/time range (from–to), and selected **teams**.
- **Attendance** and **Reports** are scoped by event (and optionally team/date within the event).
- **Teams** are year-round with optional **wrap-up** day teams (Monday–Sunday) that recur by weekday.

---

## 1. Data model

### Event
- `id`, `name`, `dateFrom` (ISO string or timestamp), `dateTo`, `teamIds` (array of team ids), `teamOverrides` (optional: per-team member/leader overrides for this event), `createdBy`, `createdAt`, `updatedAt`.

### Team (extended)
- Existing: `id`, `name`, `leaderId`, `memberIds`, `createdAt`, `updatedAt`.
- New: `dayOfWeek` (number 0–6, Sun–Sat) for wrap-up day teams; `isWrapUp` (boolean). Only set for the 7 wrap-up teams.

### Attendance (extended)
- Existing: `teamId`, `date`, `presentIds`, `absentIds`, `submittedBy`.
- New: `eventId` (optional for backward compatibility). When set, date must be within event range and teamId must be in event.teamIds.

---

## 2. Pre-defined teams

**Regular (11):** Tafheem, Pre-collection, Thaal return 1st floor, Thaal return 2nd floor, To-go packing and mumineen distribution, Safra marado, Safra bairao, Saturday madrasah jaman, Friday namaz distribution, Sadaqa meals.  
(Note: “Wrap-up” as a single label is represented by the 7 day teams below.)

**Wrap-up by day (7):** Monday Wrap-up, Tuesday Wrap-up, Wednesday Wrap-up, Thursday Wrap-up, Friday Wrap-up, Saturday Wrap-up, Sunday Wrap-up.  
Each has `isWrapUp: true` and `dayOfWeek`: 1=Mon … 7=Sun (or 0=Sun, 1=Mon … 6=Sat to match `Date.getDay()`).

Super admin can **add**, **edit**, and **delete** teams (including these); the list above is the default/seed set.

---

## 3. Event create/edit form

- **Event name** (text).
- **Date & time from** (datetime).
- **Date & time to** (datetime).
- **Select teams:**  
  - All regular teams (checkboxes).  
  - For wrap-up: compute weekdays in the event’s date range; show only the matching “Day Wrap-up” teams (e.g. event Mon–Wed → Monday, Tuesday, Wednesday Wrap-up). If the event spans many days (e.g. 30-day Ramadan), all 7 wrap-up teams can be selected and will recur each week in the range.
- Optional later: per-event overrides for team members/leads (edit members per team for this event only).

---

## 4. Event list and dashboard

- **Events page:** List all events (upcoming first); super admin can create/edit/delete.
- **Dashboard:** “Upcoming events” section with cards; click card → event detail.
- **Event detail:** Shows event name, date range, and for the current user their **assigned team(s)** for that event (from year-round team membership or event overrides). Members/admins can open this to see where they’re assigned.

---

## 5. Attendance (event-based)

- **Super admin / Admin:**  
  - Choose **event** (dropdown).  
  - Choose **date** (dropdown: only dates within that event’s range).  
  - Choose **team** (dropdown: teams in that event) or show one table: one row per team with member checkboxes for that date.  
  - Save attendance: store `eventId`, `teamId`, `date`, `presentIds`, `absentIds`, `submittedBy`.
- **Member:** From “Attendance” or event card, see events that include today; for each event they’re in a team for, show “Mark present today” (location-gated as now). Only for **today** and only for events that include today.

---

## 6. Reports

- **Primary filter:** **Event** (required or default to “all” for backward compat).  
- Then: optional team, optional date range (within event).  
- Export CSV/PDF as now, scoped by event (and team/date).

---

## 7. Implementation order

1. Types + Team extensions (dayOfWeek, isWrapUp); Event type.
2. Events CRUD API; default teams seed (API or script).
3. Teams UI: show dayOfWeek/isWrapUp; allow add/edit/delete; seed default teams if empty.
4. Events page: list + create form (name, date from/to, team selection with wrap-up day logic).
5. Event detail page (assignments for current user).
6. Attendance: add eventId; UI event → date → team; member attendance for events containing today.
7. Reports: event filter.
8. Dashboard: upcoming events + event cards linking to detail.

---

## 8. File changes (summary)

- `types/index.ts`: Event, extend Team, extend AttendanceRecord.
- `app/api/events/route.ts`: GET (list), POST (create).
- `app/api/events/[id]/route.ts`: GET, PATCH, DELETE.
- `app/api/teams/route.ts`: support dayOfWeek, isWrapUp; optional seed.
- `app/api/attendance/route.ts`: eventId in GET/POST; validate date in range, team in event.
- `app/api/reports/route.ts`: eventId filter.
- `app/dashboard/events/page.tsx`: list + create form.
- `app/dashboard/events/[id]/page.tsx`: event detail.
- `app/dashboard/attendance/page.tsx`: event-based flow.
- `app/dashboard/reports/page.tsx`: event dropdown.
- `app/dashboard/page.tsx`: upcoming events.
- `components/DashboardLayout.tsx`: add “Events” nav for super_admin (and admin if desired).
- Firestore: `events` collection; `attendance` and `teams` schema extensions.
