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
  /** Photos rattachées, de la plus ancienne à la plus récente. */
  photos: PhotoScan[];
  /** Horodatage du scan sur l'appareil — fait foi pour le classement temporel. */
  scanneLe: Date;
  /** Écriture en base. Diffère de `scanneLe` après un échec puis un « Réessayer ». */
  createdAt: Date;
}

/** Métadonnée d'une photo côté client — le binaire est servi par
 *  /api/scans/media/[id] (route authentifiée), jamais inclus ici. */
export interface PhotoScan {
  id: string;
  mimeType: string;
}

const INCLURE = {
  createdBy: { select: { nom: true } },
  chantier: { select: { id: true, nom: true, numeroWhy: true } },
  photos: {
    select: { id: true, mimeType: true },
    orderBy: { createdAt: "asc" },
  },
} as const;

type LigneBrute = Awaited<
  ReturnType<typeof prisma.modemScan.findMany<{ include: typeof INCLURE }>>
>[number];

function versRow(r: LigneBrute): ModemScanRow {
  return {
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
    photos: r.photos.map((p) => ({ id: p.id, mimeType: p.mimeType })),
    scanneLe: r.scanneLe,
    createdAt: r.createdAt,
  };
}

/** Tous les scans, du plus récent au plus ancien (liste partagée à toute l'équipe). */
export async function listerScansModem(): Promise<ModemScanRow[]> {
  const rows = await prisma.modemScan.findMany({
    orderBy: { scanneLe: "desc" },
    include: INCLURE,
  });
  return rows.map(versRow);
}

/** Scans rattachés à une affaire (bloc « Scans » de la fiche affaire). */
export async function listerScansAffaire(
  chantierId: string,
): Promise<ModemScanRow[]> {
  const rows = await prisma.modemScan.findMany({
    where: { chantierId },
    orderBy: { scanneLe: "desc" },
    include: INCLURE,
  });
  return rows.map(versRow);
}
