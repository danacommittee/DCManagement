import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const myRole = membersSnap.docs[0].data().role;
    const myId = membersSnap.docs[0].id;

    const snap = await db.collection("teams").orderBy("name").get();
    let teams = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        name: x.name,
        leaderId: x.leaderId != null ? x.leaderId : null,
        memberIds: Array.isArray(x.memberIds) ? x.memberIds : [],
        createdAt: x.createdAt,
        updatedAt: x.updatedAt,
      };
    });
    if (myRole === "admin") {
      teams = teams.filter((t) => t.leaderId === myId);
    }
    return NextResponse.json({ teams });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

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
      return NextResponse.json({ error: "Only Super Admin can create teams" }, { status: 403 });
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const now = Date.now();
    const ref = await db.collection("teams").add({
      name,
      leaderId: null,
      memberIds: [],
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ id: ref.id, name });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
