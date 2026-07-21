// Types & parsing de l'outil ToolGus « Scan modems ».
// Client-safe : PAS de "server-only" ni de Prisma ici — importé par l'UI ET le
// serveur (action de save). Le QR d'un modem Teltonika (RUT…) est au format
// « WIFI: » standard, enrichi par Teltonika de champs matériel :
//   WIFI:T:WPA;S:RUT241_8763;P:xxxx;SN:6008788429;I:8644...;M:2097...;U:admin;PW:xxxx;B:048;
//   T=type WiFi · S=SSID · P=mot de passe WiFi · SN=série · I=IMEI · M=MAC
//   U=identifiant admin · PW=mot de passe admin · B=lot

/** Infos matériel extraites d'un QR modem (tous champs optionnels : QR partiel). */
export interface ModemInfo {
  ssid: string | null;
  serie: string | null;
  imei: string | null;
  mac: string | null;
  wifiPass: string | null;
  adminUser: string | null;
  adminPass: string | null;
  lot: string | null;
  wifiType: string | null;
}

const VIDE: ModemInfo = {
  ssid: null,
  serie: null,
  imei: null,
  mac: null,
  wifiPass: null,
  adminUser: null,
  adminPass: null,
  lot: null,
  wifiType: null,
};

/** Découpe `s` sur `sep` en respectant l'échappement `\` (format MECARD/WIFI),
 *  SANS déséchapper (on garde les `\` pour un déséchappement ultérieur par champ).
 *  `limit` borne le nombre de morceaux (le reste s'accumule dans le dernier). */
function couperEchappe(s: string, sep: string, limit = Infinity): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      cur += c + s[i + 1];
      i++;
      continue;
    }
    if (c === sep && out.length + 1 < limit) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function desechapper(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

/** Parse le contenu brut d'un QR modem en infos matériel. Tolérant : préfixe
 *  « WIFI: » optionnel, clés dans n'importe quel ordre, valeurs échappées. */
export function parseModemQr(raw: string): ModemInfo {
  let corps = raw.trim();
  const pref = /^wifi:/i.exec(corps);
  if (pref) corps = corps.slice(pref[0].length);

  const map: Record<string, string> = {};
  for (const entree of couperEchappe(corps, ";")) {
    if (!entree.trim()) continue;
    const [cle, valeur = ""] = couperEchappe(entree, ":", 2);
    const k = cle.trim().toUpperCase();
    if (!k) continue;
    map[k] = desechapper(valeur).trim();
  }

  const g = (k: string) => (map[k] ? map[k] : null);
  return {
    wifiType: g("T"),
    ssid: g("S"),
    wifiPass: g("P"),
    serie: g("SN"),
    imei: g("I"),
    mac: g("M"),
    adminUser: g("U"),
    adminPass: g("PW"),
    lot: g("B"),
  };
}

/** Vrai si le QR a livré au moins une info exploitable. */
export function modemInfoNonVide(info: ModemInfo): boolean {
  return Object.values(info).some((v) => v != null);
}

/** Vrai si le scan est un VRAI modem (porte un identifiant matériel), par
 *  opposition à un code générique (QR d'URL, code-barres produit…). Un simple
 *  QR WiFi (SSID + mot de passe, sans série) n'est pas considéré comme modem. */
export function estModem(info: ModemInfo): boolean {
  return Boolean(info.serie || info.imei || info.mac);
}

/** Libellés des symbologies (BarcodeDetector / ZXing, normalisés en minuscules). */
export const FORMAT_LABEL: Record<string, string> = {
  qr_code: "QR",
  data_matrix: "DataMatrix",
  aztec: "Aztec",
  pdf417: "PDF417",
  ean_13: "EAN-13",
  ean_8: "EAN-8",
  upc_a: "UPC-A",
  upc_e: "UPC-E",
  code_128: "Code 128",
  code_39: "Code 39",
  code_93: "Code 93",
  codabar: "Codabar",
  itf: "ITF",
};

/** Libellé lisible d'un type de code (ou « Modem » si c'est un modem). */
export function formatLabel(format: string | null, info?: ModemInfo): string {
  if (info && estModem(info)) return "Modem";
  if (!format) return "Saisi";
  return FORMAT_LABEL[format] ?? format;
}

/** Libellé court d'un modem pour les confirmations (SSID, sinon série, sinon MAC). */
export function resumeModem(info: ModemInfo): string {
  return info.ssid || info.serie || info.mac || info.imei || "Modem";
}

/** Colonnes matériel — source unique pour le tableau ET l'export CSV. */
export const CHAMPS_MODEM: { cle: keyof ModemInfo; libelle: string }[] = [
  { cle: "ssid", libelle: "Réseau (SSID)" },
  { cle: "serie", libelle: "N° série" },
  { cle: "imei", libelle: "IMEI" },
  { cle: "mac", libelle: "MAC" },
  { cle: "wifiPass", libelle: "Mot de passe WiFi" },
  { cle: "adminUser", libelle: "Admin (identifiant)" },
  { cle: "adminPass", libelle: "Admin (mot de passe)" },
  { cle: "lot", libelle: "Lot" },
  { cle: "wifiType", libelle: "Type WiFi" },
];

export { VIDE as MODEM_INFO_VIDE };
