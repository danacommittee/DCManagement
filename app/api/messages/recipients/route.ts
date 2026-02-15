import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";

/**
 * GET /api/messages/recipients?eventId=&audienceType=&audienceId=
 * Returns the list of recipients (id, name) for the given audience options.
 * Same resolution logic as the send endpoint.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const role = membersSnap.docs[0].data().role;
    const myId = membersSnap.docs[0].id;
    if (role !== "super_admin" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId")?.trim() || null;
    const audienceType = searchParams.get("audienceType");
    const audienceId = searchParams.get("audienceId") || "";

    if (!["individual", "sub_team", "entire_team"].includes(audienceType || "")) {
      return NextResponse.json({ error: "Invalid audienceType" }, { status: 400 });
    }

    let recipientIds: string[] = [];
    if (audienceType === "entire_team") {
      const membersSnap2 = await db.collection("members").get();
      recipientIds = membersSnap2.docs.map((d) => d.id);
    } else if (audienceType === "sub_team" && audienceId) {
      const teamSnap = await db.collection("teams").doc(audienceId).get();
      if (!teamSnap.exists) return NextResponse.json({ error: "Team not found" }, { status: 400 });
      if (role === "admin") {
        const team = teamSnap.data();
        if (team?.leaderId !== myId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (eventId) {
        const eventSnap = await db.collection("events").doc(eventId).get();
        if (eventSnap.exists) {
          const ev = eventSnap.data()!;
          const teamIds = (ev.teamIds as string[]) || [];
          if (teamIds.includes(audienceId)) {
            const overrides = (ev.teamOverrides as Record<string, { memberIds?: string[] }> | undefined) ?? {};
            const override = overrides[audienceId];
            recipientIds = Array.isArray(override?.memberIds) ? override.memberIds : (Array.isArray(teamSnap.data()?.memberIds) ? (teamSnap.data()!.memberIds as string[]) : []);
          } else {
            recipientIds = Array.isArray(teamSnap.data()?.memberIds) ? (teamSnap.data()!.memberIds as string[]) : [];
          }
        } else {
          recipientIds = Array.isArray(teamSnap.data()?.memberIds) ? (teamSnap.data()!.memberIds as string[]) : [];
        }
      } else {
        recipientIds = Array.isArray(teamSnap.data()?.memberIds) ? (teamSnap.data()!.memberIds as string[]) : [];
      }
    } else if (audienceType === "individual" && audienceId) {
      recipientIds = [audienceId];
    }

    const membersSnap2 = await db.collection("members").get();
    const recipients = recipientIds.map((id) => {
      const doc = membersSnap2.docs.find((d) => d.id === id);
      const x = doc?.data();
      const name = (x?.name != null && String(x?.name).trim()) ? String(x?.name).trim() : [x?.title, x?.firstName, x?.lastName].filter(Boolean).join(" ") || x?.email || id;
      return { id, name };
    });

    return NextResponse.json({ recipients });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
