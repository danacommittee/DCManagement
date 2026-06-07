import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";
import type { LeftoverContainerType, LeftoverItem } from "@/types";

const VALID_CONTAINER_TYPES = new Set<LeftoverContainerType>([
  "full_aluminum_tray",
  "half_aluminum_tray",
  "bucket_5gal",
  "container_16oz",
  "container_24oz",
  "container_32oz",
  "crate",
]);

async function requireAdmin(token: string | undefined) {
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const decoded = await authAdmin.verifyIdToken(token);
  const email = decoded.email?.toLowerCase();
  const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
  if (membersSnap.empty) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const meDoc = membersSnap.docs[0];
  const meData = meDoc.data();
  const role = meData.role;
  if (role !== "super_admin" && role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const myDisplayName =
    (meData.name && String(meData.name).trim()) ||
    [meData.title, meData.firstName, meData.lastName].filter(Boolean).join(" ") ||
    meData.email ||
    "";
  return { myId: meDoc.id, myDisplayName };
}

function parseItems(raw: unknown): LeftoverItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items: LeftoverItem[] = [];
  for (const x of raw) {
    if (typeof x !== "object" || x == null) return null;
    const row = x as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const containerType = row.containerType;
    const contents = typeof row.contents === "string" ? row.contents.trim() : "";
    const count = typeof row.count === "number" ? row.count : parseInt(String(row.count ?? ""), 10);
    if (!id || !VALID_CONTAINER_TYPES.has(containerType as LeftoverContainerType)) return null;
    if (!contents) return null;
    if (!Number.isFinite(count) || count < 1) return null;
    items.push({
      id,
      containerType: containerType as LeftoverContainerType,
      contents,
      count: Math.floor(count),
    });
  }
  return items;
}

function docIdFor(eventId: string, date: string) {
  return `${eventId}_${date}`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  try {
    const auth = await requireAdmin(token);
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");
    const date = searchParams.get("date");

    if (!eventId || !date) {
      return NextResponse.json({ error: "eventId and date required" }, { status: 400 });
    }

    const snap = await db.collection("leftovers").doc(docIdFor(eventId, date)).get();
    if (!snap.exists) {
      return NextResponse.json({ record: null });
    }

    const x = snap.data()!;
    const items = Array.isArray(x.items) ? x.items : [];
    return NextResponse.json({
      record: {
        id: snap.id,
        eventId: x.eventId,
        date: x.date,
        items,
        submittedBy: x.submittedBy,
        submittedByName: x.submittedByName,
        createdAt: x.createdAt,
        updatedAt: x.updatedAt,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  try {
    const auth = await requireAdmin(token);
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim().slice(0, 10) : "";
    const items = parseItems(body.items);

    if (!eventId || !date) {
      return NextResponse.json({ error: "eventId and date required" }, { status: 400 });
    }
    if (items === null) {
      return NextResponse.json({ error: "Invalid items" }, { status: 400 });
    }

    const eventSnap = await db.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const ev = eventSnap.data()!;
    const fromStr = String(ev.dateFrom).slice(0, 10);
    const toStr = String(ev.dateTo).slice(0, 10);
    if (date < fromStr || date > toStr) {
      return NextResponse.json({ error: "Date not in event range" }, { status: 400 });
    }

    const now = Date.now();
    const ref = db.collection("leftovers").doc(docIdFor(eventId, date));
    const existing = await ref.get();

    const payload = {
      eventId,
      date,
      items,
      submittedBy: auth.myId,
      submittedByName: auth.myDisplayName,
      updatedAt: now,
      ...(existing.exists ? {} : { createdAt: now }),
    };

    if (existing.exists) {
      await ref.update(payload);
    } else {
      await ref.set({ ...payload, createdAt: now });
    }

    return NextResponse.json({ ok: true, id: ref.id, itemCount: items.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  try {
    const auth = await requireAdmin(token);
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");
    const date = searchParams.get("date");

    if (!eventId || !date) {
      return NextResponse.json({ error: "eventId and date required" }, { status: 400 });
    }

    const ref = db.collection("leftovers").doc(docIdFor(eventId, date));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: true });
    }

    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
