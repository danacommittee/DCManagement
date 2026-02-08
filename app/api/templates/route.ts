import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await authAdmin.verifyIdToken(token);
    const snap = await db.collection("templates").orderBy("createdAt", "desc").get();
    const templates = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        name: x.name,
        body: x.body,
        category: x.category != null ? x.category : "custom",
        createdAt: x.createdAt,
        updatedAt: x.updatedAt,
      };
    });
    return NextResponse.json({ templates });
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
    const role = membersSnap.docs[0].data().role;
    if (role !== "super_admin" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const bodyText = typeof body.body === "string" ? body.body : "";
    const category = ["daily", "weekly", "special_event", "custom"].includes(body.category) ? body.category : "custom";
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const now = Date.now();
    const ref = await db.collection("templates").add({
      name,
      body: bodyText,
      category,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ id: ref.id, name, category });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
