import "server-only";
import { access, readdir } from "node:fs/promises";
import { join } from "node:path";

/* Impression d'une page de l'application en PDF, par un Chromium sans interface.
 *
 * POURQUOI un vrai navigateur plutôt qu'une bibliothèque PDF ? Parce que le
 * document existe déjà : c'est la page HTML que le client voit. Le composer une
 * seconde fois dans un moteur PDF (pdfmake, jsPDF…) reviendrait à tenir DEUX
 * mises en page qui divergeraient à la première retouche — et l'autre famille
 * d'export du dépôt (`pdf-note.ts`, `apercu-pdf.ts`) rasterise l'écran : texte
 * non sélectionnable, non copiable, illisible à la loupe. Un devis se lit, se
 * recherche et s'archive : il lui faut du vrai texte.
 *
 * ⚠️ CE N'EST PAS DISPONIBLE PARTOUT. Il faut un binaire Chromium sur la
 * machine. Sur le poste et sur la VM, celui de playwright suffit (il est déjà
 * là pour les vérifications de rendu) ; dans l'image Docker `node:alpine` il
 * faut `apk add chromium` (voir Dockerfile). Quand il n'y en a pas, on le DIT
 * clairement à l'appelant, qui retombe sur « Imprimer » côté navigateur — un
 * bouton qui échoue sans expliquer pourquoi est pire que pas de bouton.
 */

export class NavigateurIndisponible extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NavigateurIndisponible";
  }
}

async function existe(chemin: string): Promise<boolean> {
  try {
    await access(chemin);
    return true;
  } catch {
    return false;
  }
}

/** Les noms qu'un exécutable Chromium porte selon la version de playwright. On
 *  cherche les FICHIERS par leur nom plutôt que de composer un chemin : le
 *  dossier intermédiaire a changé de nom en cours de route
 *  (`chrome-linux` → `chrome-linux64`, `chrome-headless-shell-linux64`), et un
 *  chemin composé en dur se serait tu au prochain renommage. */
const NOMS_EXECUTABLE = ["chrome-headless-shell", "headless_shell", "chrome"];

/** Les Chromium de playwright installés dans le cache du poste (le nom du
 *  dossier porte la révision : `chromium-1228`, `chromium_headless_shell-1228`). */
async function chromiumsDePlaywright(): Promise<string[]> {
  const racine =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    join(process.env.HOME || "/root", ".cache", "ms-playwright");
  let entrees: string[];
  try {
    entrees = await readdir(racine);
  } catch {
    return [];
  }

  // Le « headless shell » d'abord : c'est exactement notre usage, et il démarre
  // plus vite que le Chromium complet.
  const dossiers = entrees
    .filter((e) => e.startsWith("chromium"))
    .sort((a, b) => Number(b.includes("headless")) - Number(a.includes("headless")));

  const candidats: string[] = [];
  for (const d of dossiers) {
    let sous: string[];
    try {
      sous = await readdir(join(racine, d));
    } catch {
      continue;
    }
    for (const s of sous) {
      for (const nom of NOMS_EXECUTABLE) candidats.push(join(racine, d, s, nom));
    }
  }
  return candidats;
}

let cheminMemorise: string | null = null;

/** Le premier Chromium utilisable, ou `null`. Mémorisé : la recherche touche le
 *  disque, et la réponse ne change pas en cours de vie du processus. */
export async function trouverChromium(): Promise<string | null> {
  if (cheminMemorise) return cheminMemorise;

  const candidats = [
    process.env.CHROMIUM_PATH,
    ...(await chromiumsDePlaywright()),
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter((c): c is string => !!c);

  for (const c of candidats) {
    if (await existe(c)) {
      cheminMemorise = c;
      return c;
    }
  }
  return null;
}

export interface OptionsImpression {
  /** Gabarit HTML du pied de page (Chromium y substitue `pageNumber` /
   *  `totalPages`). Posé sur CHAQUE page — c'est tout l'intérêt. */
  piedHtml?: string;
  /** Marges, en millimètres. */
  margeHaut?: number;
  margeBas?: number;
  margeCote?: number;
}

/**
 * Rend `url` en PDF A4 portrait.
 *
 * L'URL doit être joignable SANS session : c'est pour ça que le PDF d'un devis
 * s'imprime depuis son lien public (`/d/{jeton}`) et non depuis l'écran interne
 * — sinon il faudrait faire porter un cookie de session au navigateur, c'est-à-dire
 * fabriquer et transporter une identité pour imprimer une page.
 */
export async function imprimerEnPdf(
  url: string,
  options: OptionsImpression = {},
): Promise<Uint8Array> {
  const executable = await trouverChromium();
  if (!executable) {
    throw new NavigateurIndisponible(
      "Aucun Chromium trouvé sur ce serveur (essayé CHROMIUM_PATH, le cache playwright et /usr/bin).",
    );
  }

  const { chromium } = await import("playwright-core");
  const navigateur = await chromium.launch({ executablePath: executable });
  try {
    const page = await navigateur.newPage();
    // `domcontentloaded` suffirait pour du HTML statique, mais le document porte
    // des images (logo, photos collées dans les textes libres) : sans attendre le
    // réseau, elles manquent une fois sur trois dans le PDF.
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    // La page est un document imprimé : c'est le média « print » qui la décrit,
    // pas « screen » (la barre d'actions du lecteur disparaît, les couleurs sont
    // forcées). Sans ça on imprimerait la version écran.
    await page.emulateMedia({ media: "print" });

    const mm = (v: number | undefined, defaut: number) => `${v ?? defaut}mm`;
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: !!options.piedHtml,
      headerTemplate: "<span></span>",
      footerTemplate: options.piedHtml ?? "<span></span>",
      margin: {
        top: mm(options.margeHaut, 12),
        bottom: mm(options.margeBas, options.piedHtml ? 18 : 12),
        left: mm(options.margeCote, 12),
        right: mm(options.margeCote, 12),
      },
    });
  } finally {
    await navigateur.close();
  }
}
