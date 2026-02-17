# DCMS Super Admin Guide

This guide explains how to use the DC Management System (DCMS) web app as a **Super Admin**. It covers managing members, teams, events, sending messages, attendance, and reports.

---

## How to use this guide

- **Screenshots:** Place screenshot images in the `docs/screenshots/` folder using the filenames shown below. Then regenerate the PDF so the images appear in the guide.
- **Generate PDF:** From the project root, run:  
  `npx md-to-pdf docs/SUPER-ADMIN-GUIDE.md -o docs/SUPER-ADMIN-GUIDE.pdf`  
  (Requires: `npm install -g md-to-pdf`). Alternatively, open the Markdown file in VS Code and use the "Markdown PDF" extension to export to PDF.

---

## 1. Log in and dashboard

1. Open the app and sign in with Google (Super Admin account).
2. After login you’ll see the **sidebar** with: Dashboard, Events, Members, Teams, Templates, Send Message, Attendance, Reports.
3. The **Dashboard** shows a high-level overview (e.g. upcoming events, recent activity).

*Screenshot: Capture the main dashboard after login (sidebar + main content).*  
![Dashboard](screenshots/01-dashboard.png)

---

## 2. Managing Members

**Path:** **Members** in the sidebar.

### 2.1 Viewing members

- The Members page lists all members with name, email, role, and other details.
- Use the **search** box to filter by name, email, phone, ITS number, or role.
- Use the **Sort** dropdown to sort by name (A–Z, Z–A) or role.

*Screenshot: Members list with search and a few members visible.*  
![Members list](screenshots/02-members-list.png)

### 2.2 Adding a member

1. Click **Add member**.
2. Fill in: Title (optional), First name, Last name, ITS number, Phone, Email, and **Role** (member, admin, or super_admin).
3. Click **Create**. The new member appears in the list.

*Screenshot: Add member form (with fields visible).*  
![Add member](screenshots/03-members-add.png)

### 2.3 Editing a member

1. Find the member in the list and click **Edit** (or the edit action).
2. Update any fields (name, phone, email, role, team assignments, etc.).
3. Click **Save**.

### 2.4 Deleting a member

1. Select one or more members using the checkboxes.
2. Click **Delete selected** (or the delete action).
3. Confirm. The member(s) are removed.

### 2.5 CSV upload (bulk add)

1. Click **Upload CSV** (or similar).
2. Use a CSV with columns matching the member fields (e.g. name, email, phone, role).
3. Upload the file. The app creates or updates members from the CSV.

*Screenshot: Upload CSV area or modal.*  
![Members CSV](screenshots/04-members-csv.png)

---

## 3. Managing Teams

**Path:** **Teams** in the sidebar.

### 3.1 Viewing teams

- The Teams page lists all teams with name, leaders, and member count.
- Super Admin sees every team.

*Screenshot: Teams list with at least one team expanded or visible.*  
![Teams list](screenshots/05-teams-list.png)

### 3.2 Creating a team

1. Enter a **team name** in the “New team name” field.
2. Click **Create** (or **Add team**). The new team appears in the list.

### 3.3 Editing a team

1. Click **Edit** on the team card (or row).
2. You can:
   - Change the **team name**.
   - Set **Leader** and **Leader 2** (dropdown of members).
   - Add or remove **members** (checkboxes or multi-select).
3. Click **Save**.

*Screenshot: Team edit form showing leaders and member list.*  
![Teams edit](screenshots/06-teams-edit.png)

### 3.4 Seed default teams

- If no teams exist, use **Seed default teams** (Events or Teams page) to create the default set of teams in one go.

---

## 4. Managing Events

**Path:** **Events** in the sidebar.

### 4.1 Viewing events

- The Events page shows a **calendar** and list of events.
- Click an event to open its **detail page**.

*Screenshot: Events calendar or list with at least one event.*  
![Events list](screenshots/07-events-list.png)

### 4.2 Creating an event

1. Click **Create event**.
2. Fill in:
   - **Event name** (e.g. “Ramadan 2025”).
   - **From (date)** and **To (date)** — events are all-day (date only).
   - **Teams:** Select which teams participate (checkboxes for regular and wrap-up teams).
3. Click **Create**. The event appears on the calendar.

*Screenshot: New event form with name, dates, and team checkboxes.*  
![Events create](screenshots/08-events-create.png)

### 4.3 Editing an event

1. Open the event (click it from the calendar or list).
2. Click **Edit event**.
3. Change name, dates, or team selection.
4. Click **Save**.

### 4.4 Event detail: per-day times (single-day and multi-day)

- On the **event detail** page, Super Admin can set **start** and **end times**:
  - **Single-day event:** One set of “Start time” and “End time” (time only, no date).
  - **Multi-day event:** One set of “Start time” and “End time” **per day** (only for today and past days, not future).
1. Enter times for the relevant day(s).
2. Click **Save** (or **Save all times** for multi-day).

*Screenshot: Event detail page showing the “Event times” section with time inputs.*  
![Events times](screenshots/09-events-times.png)

### 4.5 Editing team members for an event

- On the event detail page, each team has an **Edit members** option.
- Use it to override which members are in that team **for this event only** (event-specific overrides).

### 4.6 Deleting an event

- On the event detail page, click **Delete event** and confirm.

---

## 5. Send Message

**Path:** **Send Message** in the sidebar.

### 5.1 Sending a message immediately

1. **Template:** Select a template from the dropdown.
2. **Event (optional):** Choose an event to use event teams and context, or “No event” for default teams.
3. **Audience:**
   - **Entire team** — all members (and leaders) from selected event teams or all members if no event.
   - **Sub-team** — pick one team.
   - **Individual (select multiple)** — select one or more members from the list.
4. **Channels:** Check **Email** and/or **SMS** (WhatsApp is disabled for now).
5. **Email subject (optional):** Shown when Email is selected; defaults to template name if left blank.
6. **Message preview (right panel):** The preview shows the resolved message. You can edit this text; edits apply only to this send and do not change the template. Placeholders like `{{Name}}` and `{{TeamsList}}` are replaced per recipient when you send.
7. Click **Send**.

*Screenshot: Send Message page with template, event, audience, channels, and preview visible.*  
![Send message](screenshots/10-send-message.png)

### 5.2 Scheduling a message

1. Set template, event, audience, channels (and optional email subject and preview text) as above.
2. Click **Schedule Send**.
3. Choose **date and time** (must be in the future).
4. Click **Confirm Schedule**. The message appears under **Scheduled Messages** and is sent at the chosen time (via cron or external cron job).

### 5.3 Managing scheduled messages

- In the **Scheduled Messages** section you can:
  - **Refresh** to reload the list.
  - **Edit** — change the scheduled date/time for a pending message.
  - **Delete** — remove a pending scheduled message.

*Screenshot: Scheduled Messages section with at least one scheduled item.*  
![Scheduled messages](screenshots/11-scheduled-messages.png)

---

## 6. Attendance

**Path:** **Attendance** in the sidebar.

### 6.1 Recording attendance (Super Admin)

1. **Event (optional):** Select an event or “No event (ad-hoc)”.
2. **Team:** Select the team.
3. **Date:** Pick a date (today or past only).
4. Optionally set **Start time**, **End time**, and **Notes** for that team/day.
5. In the list, **check** members who are **present** and leave **absent** unchecked (or vice versa depending on UI). Team **leads** are included in the list.
6. Click **Save attendance**.

*Screenshot: Attendance page with Event, Team, Date, and the present/absent member list.*  
![Attendance form](screenshots/12-attendance-form.png)

### 6.2 Event-based vs ad-hoc

- **With event:** Event dropdown filters teams to that event’s teams; date can be limited to event dates.
- **Ad-hoc (no event):** Any team and any past/today date can be used.

---

## 7. Reports

**Path:** **Reports** in the sidebar.

### 7.1 Viewing a report

1. Optionally filter by **Event** and/or **Team**.
2. Set **From** and **To** dates (or a single date, depending on UI).
3. Click **View report** (or similar). The report shows attendance records (date, team, start/end time, notes, present/absent counts and names).

*Screenshot: Reports page with filters and report table visible.*  
![Reports view](screenshots/13-reports-view.png)

### 7.2 Downloading CSV

1. Set the same filters (event, team, date range).
2. Click **Download CSV**. The file `attendance-report.csv` is downloaded for the selected criteria.

*Screenshot: Reports page with “Download CSV” button visible.*  
![Reports CSV](screenshots/14-reports-csv.png)

---

## 8. Templates (for Send Message)

**Path:** **Templates** in the sidebar.

- Create and edit **message templates** used in Send Message.
- Use placeholders: `{{Name}}`, `{{Team}}`, `{{EventName}}`, `{{YourName}}`, `{{TeamMembers}}`, `{{TeamLeaders}}`, `{{TeamsList}}` (each recipient gets their own values; `{{TeamsList}}` lists all their teams and members with leads).
- You can add attachments and use “Quick create” options for common templates.

*Screenshot: Templates page with at least one template.*  
![Templates](screenshots/15-templates.png)

---

## 9. Quick reference

| Task              | Where to go      | Main action(s)                                      |
|-------------------|------------------|-----------------------------------------------------|
| Add/edit members  | Members          | Add member, Edit, Delete, Upload CSV                |
| Manage teams      | Teams            | Create team, Edit name/leaders/members               |
| Create event      | Events           | Create event, set name, dates, teams                |
| Event times       | Event detail     | Set start/end time per day (today and past only)    |
| Send message      | Send Message     | Pick template, audience, channels, Send or Schedule |
| Mark attendance   | Attendance       | Event → Team → Date → mark present/absent → Save    |
| View report       | Reports          | Filter by event/team/dates → View report            |
| Download report   | Reports          | Same filters → Download CSV                         |
| Edit templates    | Templates        | Create/edit templates and placeholders             |

---

*End of Super Admin Guide. Add the screenshots to `docs/screenshots/` with the filenames above, then generate the PDF.*
