import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";
import { DEFAULT_REGULAR_TEAM_NAMES, WRAP_UP_DAY_NAMES } from "@/lib/default-teams";

/** POST /api/teams/seed – create default teams if missing (super_admin only). */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (membersSnap.docs[0].data().role !== "super_admin") {
      return NextResponse.json({ error: "Only Super Admin can seed teams" }, { status: 403 });
    }

    const existing = await db.collection("teams").get();
    const existingNames = new Set(existing.docs.map((d) => (d.data().name as string).toLowerCase().trim()));
    const now = Date.now();
    let created = 0;

    for (const name of DEFAULT_REGULAR_TEAM_NAMES) {
      const key = name.toLowerCase().trim();
      if (existingNames.has(key)) continue;
      await db.collection("teams").add({
        name,
        leaderId: null,
        memberIds: [],
        createdAt: now,
        updatedAt: now,
      });
      existingNames.add(key);
      created++;
    }
    for (const { dayOfWeek, name } of WRAP_UP_DAY_NAMES) {
      const key = name.toLowerCase().trim();
      if (existingNames.has(key)) continue;
      await db.collection("teams").add({
        name,
        leaderId: null,
        memberIds: [],
        dayOfWeek,
        isWrapUp: true,
        createdAt: now,
        updatedAt: now,
      });
      existingNames.add(key);
      created++;
    }

    return NextResponse.json({ ok: true, created });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
