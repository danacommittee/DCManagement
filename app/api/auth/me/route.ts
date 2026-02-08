import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "No email in token" }, { status: 403 });
    }
    let membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();

    if (membersSnap.empty) {
      const totalMembersSnap = await db.collection("members").limit(1).get();
      const firstSuperAdminEmail = process.env.FIRST_SUPER_ADMIN_EMAIL?.toLowerCase()?.trim();
      if (totalMembersSnap.empty && firstSuperAdminEmail && email === firstSuperAdminEmail) {
        const now = Date.now();
        const name = (decoded.name as string) || email.split("@")[0] || "Super Admin";
        const ref = await db.collection("members").add({
          title: "",
          firstName: "",
          lastName: "",
          itsNumber: "",
          email,
          name,
          phone: "",
          role: "super_admin",
          teamIds: [],
          createdAt: now,
          updatedAt: now,
        });
        const member = {
          id: ref.id,
          title: "",
          firstName: "",
          lastName: "",
          itsNumber: "",
          email,
          name,
          phone: "",
          role: "super_admin" as const,
          teamIds: [] as string[],
        };
        return NextResponse.json({ member });
      }
      return NextResponse.json(
        { error: "Your email is not in the member list. Contact an administrator." },
        { status: 403 }
      );
    }

    const doc = membersSnap.docs[0];
    const data = doc.data();
    const computedName = [data.title, data.firstName, data.lastName].filter(Boolean).join(" ") || data.email || "";
    const name = data.name != null ? data.name : computedName;
    const member = {
      id: doc.id,
      title: data.title != null ? data.title : "",
      firstName: data.firstName != null ? data.firstName : "",
      lastName: data.lastName != null ? data.lastName : "",
      itsNumber: data.itsNumber != null ? data.itsNumber : "",
      email: data.email,
      name,
      phone: data.phone != null ? data.phone : "",
      role: data.role != null ? data.role : "member",
      teamIds: Array.isArray(data.teamIds) ? data.teamIds : [],
    };
    return NextResponse.json({ member });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
