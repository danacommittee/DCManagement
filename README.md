# Dana Committee Management System (DCMS)

Web app for Dana Committee volunteer operations (Shahr-e-Lillah al-Muazzam and year-round): members, teams, messaging, attendance, and reports.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS
- **Backend:** Next.js API routes (serverless)
- **Database & Auth:** Firebase (Firestore, Authentication with Google Sign-In)
- **Messaging:** Twilio (WhatsApp, SMS, Email) – *credentials to be added later; send is stubbed*

## Roles

- **Super Admin:** CSV upload (members with Name, Phone, Email, Role), teams CRUD, assign leaders/members, templates, send messages, generate attendance links, reports.
- **Admin:** Manage teams they lead, submit attendance (team + date), templates, send messages, reports by day. Cannot access Members page (no add/edit/delete members).
- **Member:** Can only access **Attendance**: mark own attendance for today for their teams. If venue is configured, they must be within the radius to mark. Session expires after 20 minutes of inactivity.

Only emails that exist in the member list (from CSV) can sign in. Super Admin assigns role per member (member, admin, super_admin) in the CSV or in the Members UI.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment**
   - Copy `.env.local` (already present) and ensure Firebase client env vars are set.
   - Firebase Admin: place the service account JSON in `config/` and set `GOOGLE_APPLICATION_CREDENTIALS` in `.env.local` (see existing comment).
   - Optional: `NEXT_PUBLIC_APP_URL` for attendance link origin (e.g. `https://your-app.vercel.app`).
   - **Member attendance (location-gated):** To require members to be at a venue to mark attendance, set:
     - `ATTENDANCE_VENUE_LAT` – venue centre latitude (e.g. `29.7604`)
     - `ATTENDANCE_VENUE_LNG` – venue centre longitude (e.g. `-95.3698`)
     - `ATTENDANCE_VENUE_RADIUS_METERS` – allowed radius in metres (e.g. `200`). You can use [Google Maps](https://www.google.com/maps) to get coordinates (right‑click a place → coordinates).

3. **Firebase**
   - Enable **Authentication** → **Google** in Firebase Console.
   - Create **Firestore** database.
   - Deploy rules: `firebase deploy --only firestore:rules` (use `firestore.rules` from repo).
   - Indexes: deploy via Firebase Console or `firestore.indexes.json` if using Firebase CLI.

4. **First Super Admin**
   - Set `FIRST_SUPER_ADMIN_EMAIL=your@email.com` in `.env.local` (default in this repo: `danacommittee@houstonjamaat.com`).
   - When there are **no members** in Firestore, only that email can sign in. The first sign-in with Google **creates** that user as Super Admin automatically. After that, only members in the list (e.g. from CSV upload) can sign in.
   - Optional: use `POST /api/bootstrap` with `BOOTSTRAP_SECRET` if you prefer to pre-create the first member instead.

5. **Run**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000). Sign in with Google (your email must be in `members`).

## Twilio (later)

When you have Twilio credentials, add to `.env.local` (and Vercel env):

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- (Optional) WhatsApp / SMS / Email from numbers and config as needed.

Then update `app/api/messages/send/route.ts` to call Twilio instead of only logging the message.

## Docs

- [PRD](docs/PRD.md)
- [Design](docs/DESIGN.md)
- [Tech Stack](docs/TECHSTACK.md)
- [To-do](docs/TODO.md)
