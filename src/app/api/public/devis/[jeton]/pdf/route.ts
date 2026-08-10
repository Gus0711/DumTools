import { NextResponse } from "next/server";
import { NavigateurIndisponible, imprimerEnPdf } from "@/lib/pdf-navigateur";
import { getDevisPublic } from "@/tools/devis/queries";
import { libelleDevis, mentionsLegales } from "@/tools/devis/model";

export const runtime = "nodejs";
// Un rendu de navigateur prend quelques secondes : au-delà du défaut.
export const maxDuration = 60;

/* Le PDF du devis, imprimé par un Chromium sans interface depuis la page
 * publique elle-même (`/d/{jeton}?pdf=1`).
 *
 * Pourquoi passer par la page publique et non par un rendu interne : parce
 * qu'elle est joignable SANS session. Imprimer un écran authentifié
 * demanderait de fabriquer un cookie de session et de le confier au
 * navigateur — beaucoup de mécanique, et une identité de plus qui circule, pour
 * obtenir exactement la même page.
 *
 * Conséquence assumée : pas de PDF avant publication. L'aperçu interne
 * (`/perso/gus/devis/[id]/apercu`) rend le MÊME document et s'imprime au
 * navigateur — ce qui couvre le besoin d'avant-envoi.
 */

/** Racine à donner au navigateur. On reste sur la boucle locale : le rendu ne
 *  doit pas ressortir par le tunnel Cloudflare pour y revenir (plus lent, et ça
 *  casserait dès que le tunnel tombe alors que l'app tourne). */
function racineLocale(req: Request): string {
  if (process.env.PDF_BASE_URL) return process.env.PDF_BASE_URL.replace(/\/$/, "");
  const port = process.env.PORT || "3000";
  // Le protocole et l'hôte de la requête ne servent qu'en dernier recours : sous
  // le tunnel, ils désignent le domaine public.
  try {
    const u = new URL(req.url);
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return u.origin;
  } catch {
    /* URL relative improbable : on retombe sur la boucle locale. */
  }
  return `http://127.0.0.1:${port}`;
}

/** Le pied que Chromium pose sur CHAQUE page : mentions légales et pagination.
 *  Styles en ligne obligatoires — le gabarit est rendu hors de la page, il
 *  n'hérite d'aucune feuille de style. */
function piedHtml(mentions: string[]): string {
  const echapper = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lignes = mentions.map(echapper).join("<br/>");
  return `
    <div style="width:100%;padding:0 12mm;font-family:'IBM Plex Sans',Arial,sans-serif;
                font-size:6.6pt;line-height:1.45;color:#6b7785;display:flex;
                align-items:flex-end;gap:6mm;">
      <div style="flex:1;text-align:center;">${lignes}</div>
      <div style="white-space:nowrap;color:#8a95a1;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>
    </div>`;
}

export async function GET(req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  if (!jeton || jeton.length < 16) {
    return NextResponse.json({ error: "Jeton invalide" }, { status: 404 });
  }

  // La même garde que la page : jeton connu, non révoqué, non échu.
  const pub = await getDevisPublic(jeton);
  if (!pub) return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });

  const { entete } = pub.devis;
  const numero = libelleDevis(entete.numero, entete.revision);
  const url = `${racineLocale(req)}/d/${encodeURIComponent(jeton)}?pdf=1`;

  let pdf: Uint8Array;
  try {
    pdf = await imprimerEnPdf(url, {
      piedHtml: piedHtml(mentionsLegales(pub.societe)),
      margeHaut: 10,
      margeBas: 20,
      margeCote: 12,
    });
  } catch (e) {
    if (e instanceof NavigateurIndisponible) {
      // 503 et un message en clair : le bouton du lecteur peut alors renvoyer
      // vers « Imprimer », au lieu de laisser croire à une erreur du devis.
      return NextResponse.json(
        {
          error:
            "Génération de PDF indisponible sur ce serveur. Utilisez « Imprimer » puis « Enregistrer en PDF ».",
        },
        { status: 503 },
      );
    }
    console.error("[devis/pdf] échec du rendu", e);
    return NextResponse.json({ error: "Le PDF n'a pas pu être produit" }, { status: 500 });
  }

  const nomFichier = `Devis ${numero}${entete.clientNom ? ` - ${entete.clientNom}` : ""}.pdf`
    // Un nom de fichier ne porte ni séparateur de chemin ni guillemet : l'en-tête
    // Content-Disposition s'y perdrait.
    .replace(/[/\\"]/g, "-");

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomFichier)}`,
      // Le devis est vivant : un PDF mis en cache montrerait un prix d'hier.
      "Cache-Control": "no-store",
    },
  });
}
