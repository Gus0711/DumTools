import { NextResponse } from "next/server";
import { drain } from "@/lib/kdrive/drain";

// Appelée par le service cron du docker-compose (hors session utilisateur) —
// exclue de l'auth du proxy, protégée par DOCUMENTS_DRAIN_SECRET.
export const runtime = "nodejs";
export const maxDuration = 300;

function autorise(req: Request): boolean {
  const secret = process.env.DOCUMENTS_DRAIN_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!autorise(req)) {
    return NextResponse.json({ error: "Interdit" }, { status: 401 });
  }
  const bilan = await drain();
  return NextResponse.json({ ok: true, ...bilan });
}
