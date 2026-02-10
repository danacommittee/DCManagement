import { NextResponse } from "next/server";

/**
 * GET /api/attendance/venue
 * Returns whether location is required for member self-attendance (no auth needed for client to show UI).
 */
export async function GET() {
  const lat = process.env.ATTENDANCE_VENUE_LAT;
  const lng = process.env.ATTENDANCE_VENUE_LNG;
  const radius = process.env.ATTENDANCE_VENUE_RADIUS_METERS;
  const required = !!(lat && lng && radius);
  return NextResponse.json({ required });
}
