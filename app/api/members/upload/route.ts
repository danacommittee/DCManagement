import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";

type Role = "member" | "admin" | "super_admin";

/** Parse a single CSV line; supports quoted fields and tab or comma separator */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  const sep = line.includes("\t") ? "\t" : ",";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === sep) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): {
  title: string;
  firstName: string;
  lastName: string;
  itsNumber: string;
  phone: string;
  email: string;
  role: Role;
}[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map((h) => h.toLowerCase().trim());
  const getIdx = (names: string[]) => {
    const i = headers.findIndex((h) => names.some((n) => h.includes(n) || n.includes(h)));
    return i >= 0 ? i : -1;
  };
  const titleIdx = getIdx(["title"]);
  const firstIdx = getIdx(["first name", "firstname", "first"]);
  const lastIdx = getIdx(["last name", "lastname", "last"]);
  const itsIdx = getIdx(["its number", "its", "itsnumber"]);
  const phoneIdx = getIdx(["phone", "phone number"]);
  const emailIdx = getIdx(["email"]);
  const roleIdx = getIdx(["role"]);

  const rows: {
    title: string;
    firstName: string;
    lastName: string;
    itsNumber: string;
    phone: string;
    email: string;
    role: Role;
  }[] = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const parts = parseCSVLine(lines[i]);
      const get = (idx: number) => (idx >= 0 && parts[idx] !== undefined ? String(parts[idx]).trim() : "");
      const email = get(emailIdx).toLowerCase();
      if (!email) continue;
      let role: Role = "member";
      const r = get(roleIdx).toLowerCase().replace(/\s+/g, "_");
      if (r === "super_admin" || r === "super admin") role = "super_admin";
      else if (r === "admin") role = "admin";
      const title = get(titleIdx);
      const firstName = get(firstIdx);
      const lastName = get(lastIdx);
      const name = [title, firstName, lastName].filter(Boolean).join(" ") || email;
      rows.push({
        title,
        firstName,
        lastName,
        itsNumber: get(itsIdx),
        phone: get(phoneIdx),
        email,
        role,
      });
    } catch {
      continue;
    }
  }
  return rows;
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
    if (role !== "super_admin") return NextResponse.json({ error: "Only Super Admin can upload CSV" }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) return NextResponse.json({ error: "No valid rows (need Email; other fields optional). Columns: Title, First name, Last name, ITS Number, Phone number, Email, Role" }, { status: 400 });

    const now = Date.now();
    const batch = db.batch();
    for (const row of rows) {
      try {
        const name = [row.title, row.firstName, row.lastName].filter(Boolean).join(" ") || row.email;
        const existing = await db.collection("members").where("email", "==", row.email).limit(1).get();
        const data = {
          title: row.title != null ? row.title : "",
          firstName: row.firstName != null ? row.firstName : "",
          lastName: row.lastName != null ? row.lastName : "",
          itsNumber: row.itsNumber != null ? row.itsNumber : "",
          phone: row.phone != null ? row.phone : "",
          email: row.email,
          role: row.role,
          name,
          teamIds: existing.empty ? [] : (Array.isArray(existing.docs[0].data().teamIds) ? existing.docs[0].data().teamIds : []),
          updatedAt: now,
        };
        if (existing.empty) {
          const ref = db.collection("members").doc();
          batch.set(ref, { ...data, createdAt: now });
        } else {
          batch.update(existing.docs[0].ref, data);
        }
      } catch {
        continue;
      }
    }
    await batch.commit();
    return NextResponse.json({ ok: true, count: rows.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
