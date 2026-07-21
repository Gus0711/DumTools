import "server-only";
import { prisma } from "@/lib/db";
import type { ModemInfo } from "./model";

/** Une ligne de scan telle qu'affichée dans le tableau (infos + méta). */
export interface ModemScanRow extends ModemInfo {
  id: string;
  raw: string;
  format: string | null;
  note: string;
  /** Rattachement affaire (regroupement). */
  chantierId: string | null;
  chantierNom: string | null;
  chantierWhy: string | null;
  /** Groupe libre. */
  groupe: string | null;
  auteur: string | null;
  createdAt: Date;
}

/** Tous les scans, du plus récent au plus ancien (liste partagée à toute l'équipe). */
export async function listerScansModem(): Promise<ModemScanRow[]> {
  const rows = await prisma.modemScan.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { nom: true } },
      chantier: { select: { id: true, nom: true, numeroWhy: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    raw: r.raw,
    format: r.format,
    chantierId: r.chantierId,
    chantierNom: r.chantier?.nom ?? null,
    chantierWhy: r.chantier?.numeroWhy ?? null,
    groupe: r.groupe,
    ssid: r.ssid,
    serie: r.serie,
    imei: r.imei,
    mac: r.mac,
    wifiPass: r.wifiPass,
    adminUser: r.adminUser,
    adminPass: r.adminPass,
    lot: r.lot,
    wifiType: r.wifiType,
    note: r.note,
    auteur: r.createdBy?.nom ?? null,
    createdAt: r.createdAt,
  }));
}
