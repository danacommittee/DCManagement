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
    if (myRole !== "super_admin" && myRole !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snap = await db.collection("members").orderBy("name").get();
    const members = snap.docs.map((d) => {
      const x = d.data();
      const parts = [x.title, x.firstName, x.lastName].filter(Boolean).join(" ");
      const name = (x.name && String(x.name).trim()) || parts || x.email || "";
      return {
        id: d.id,
        title: (x.title != null && x.title !== "") ? x.title : "",
        firstName: (x.firstName != null && x.firstName !== "") ? x.firstName : "",
        lastName: (x.lastName != null && x.lastName !== "") ? x.lastName : "",
        itsNumber: (x.itsNumber != null && x.itsNumber !== "") ? x.itsNumber : "",
        phone: (x.phone != null && x.phone !== "") ? x.phone : "",
        email: x.email,
        role: x.role,
        name,
        teamIds: Array.isArray(x.teamIds) ? x.teamIds : [],
      };
    });
    return NextResponse.json({ members });
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
      return NextResponse.json({ error: "Only Super Admin can add members" }, { status: 403 });
    }

    const body = await req.json();
    const emailVal = (body.email as string)?.toLowerCase()?.trim();
    if (!emailVal) return NextResponse.json({ error: "email required" }, { status: 400 });

    const existing = await db.collection("members").where("email", "==", emailVal).limit(1).get();
    if (!existing.empty) return NextResponse.json({ error: "A member with this email already exists" }, { status: 400 });

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const itsNumber = typeof body.itsNumber === "string" ? body.itsNumber.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    let role: "member" | "admin" | "super_admin" = "member";
    if (typeof body.role === "string" && ["member", "admin", "super_admin"].includes(body.role)) role = body.role;

    const name = [title, firstName, lastName].filter(Boolean).join(" ") || emailVal;
    const now = Date.now();
    const ref = await db.collection("members").add({
      title,
      firstName,
      lastName,
      itsNumber,
      phone,
      email: emailVal,
      role,
      name,
      teamIds: [],
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ id: ref.id, email: emailVal, name });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (membersSnap.docs[0].data().role !== "super_admin") {
      return NextResponse.json({ error: "Only Super Admin can delete members" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? (body.ids as string[]).filter((id) => typeof id === "string") : [];
    if (ids.length === 0) return NextResponse.json({ error: "ids array required" }, { status: 400 });

    const batch = db.batch();
    for (const id of ids) {
      const ref = db.collection("members").doc(id);
      batch.delete(ref);
    }
    await batch.commit();
    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
