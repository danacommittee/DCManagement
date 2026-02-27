import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const myId = membersSnap.docs[0].id;
    const myRole = membersSnap.docs[0].data().role as string | undefined;
    const isSuperAdmin =
      typeof myRole === "string" &&
      myRole.trim().toLowerCase().replace(/\s+/g, "_") === "super_admin";
    const isSelf = id === myId;

    // Only Super Admin can edit other users; everyone can edit their own safe fields
    if (!isSelf && !isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    // Only Super Admin can change roles/teamIds; members/admins can edit their own profile fields + notification prefs
    if (isSuperAdmin && typeof body.role === "string" && ["member", "admin", "super_admin"].includes(body.role)) {
      updates.role = body.role;
    }
    if (typeof body.title === "string") updates.title = body.title;
    if (typeof body.firstName === "string") updates.firstName = body.firstName;
    if (typeof body.lastName === "string") updates.lastName = body.lastName;
    if (typeof body.itsNumber === "string") updates.itsNumber = body.itsNumber;
    if (typeof body.phone === "string") updates.phone = body.phone;
    if (isSuperAdmin && typeof body.email === "string") {
      updates.email = body.email.trim().toLowerCase();
    }
    if (typeof body.name === "string") updates.name = body.name;
    if (isSuperAdmin && Array.isArray(body.teamIds)) updates.teamIds = body.teamIds;
    if (typeof body.notifyPush === "boolean") updates.notifyPush = body.notifyPush;
    if (typeof body.notifyEmail === "boolean") updates.notifyEmail = body.notifyEmail;
    if (typeof body.notifySms === "boolean") updates.notifySms = body.notifySms;

    if (updates.title !== undefined || updates.firstName !== undefined || updates.lastName !== undefined) {
      const snap = await db.collection("members").doc(id).get();
      const data = snap.data() != null ? snap.data()! : {};
      const title = (updates.title as string) != null && (updates.title as string) !== "" ? (updates.title as string) : (data.title != null ? data.title : "");
      const firstName = (updates.firstName as string) != null && (updates.firstName as string) !== "" ? (updates.firstName as string) : (data.firstName != null ? data.firstName : "");
      const lastName = (updates.lastName as string) != null && (updates.lastName as string) !== "" ? (updates.lastName as string) : (data.lastName != null ? data.lastName : "");
      updates.name = [title, firstName, lastName].filter(Boolean).join(" ") || data.email || "";
    }

    await db.collection("members").doc(id).update(updates);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = _req.headers.get("Authorization");
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
    const { id } = await params;
    await db.collection("members").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
