import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { partageActif } from "@/lib/partage/model";

export const runtime = "nodejs";

/* Journal de consultation d'un devis publié : « le client a-t-il ouvert le
 * lien ? » — la question qui décide d'un coup de téléphone.
 *
 * Appelée par la barre du lecteur (côté navigateur) et non pendant le rendu de
 * la page : un aspirateur de liens n'exécute pas de JavaScript, et une page
 * ouverte par l'antivirus de la boîte mail du client n'est pas une lecture.
 *
 * Ce qui est enregistré : la date, une IP TRONQUÉE et le navigateur. On veut
 * distinguer deux lecteurs, pas identifier une personne — c'est aussi ce qui
 * garde ce journal proportionné à son objet.
 */

/** Une IP réduite à son voisinage : `82.65.x.x` en v4, préfixe /32 en v6. */
function tronquer(ip: string): string {
  const brut = ip.trim();
  if (!brut) return "";
  if (brut.includes(":")) {
    const morceaux = brut.split(":").filter(Boolean);
    return morceaux.length >= 2 ? `${morceaux[0]}:${morceaux[1]}:…` : "…";
  }
  const o = brut.split(".");
  return o.length === 4 ? `${o[0]}.${o[1]}.x.x` : "";
}

/** Deux ouvertures du même lecteur à moins d'une demi-heure = une seule visite.
 *  Sans ça, trois rafraîchissements de page feraient « consulté 3 fois ». */
const FENETRE_MS = 30 * 60 * 1000;

export async function POST(req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  if (!jeton || jeton.length < 16) {
    return NextResponse.json({ error: "Jeton invalide" }, { status: 404 });
  }

  const devis = await prisma.devis.findUnique({
    where: { jetonPartage: jeton },
    select: { id: true, jetonPartage: true, partageExpireLe: true },
  });
  if (!devis || !partageActif(devis)) {
    return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });
  }

  // Derrière le tunnel Cloudflare, l'IP du client est dans un en-tête ; la
  // connexion, elle, vient toujours de la passerelle.
  const ip = tronquer(
    req.headers.get("cf-connecting-ip") ||
      (req.headers.get("x-forwarded-for") || "").split(",")[0] ||
      "",
  );
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 200);

  const recente = await prisma.devisConsultation.findFirst({
    where: { devisId: devis.id, jeton, ip, vuLe: { gt: new Date(Date.now() - FENETRE_MS) } },
    select: { id: true },
  });
  if (!recente) {
    await prisma.devisConsultation.create({
      data: { devisId: devis.id, jeton, ip, userAgent },
    });
  }

  // Le lecteur n'a rien à faire de la réponse : elle ne dit ni ce qui a été
  // enregistré, ni combien de fois le document a été ouvert.
  return new NextResponse(null, { status: 204 });
}
