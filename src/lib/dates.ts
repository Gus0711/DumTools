// Formatage de dates partagé (client-safe).

/** « à l'instant », « il y a 12 min », « hier », puis la date courte. */
export function fmtRelatif(d: Date | string): string {
  const date = new Date(d);
  const min = Math.round((Date.now() - date.getTime()) / 60_000);
  if (min < 1) return "à l’instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j === 1) return "hier";
  if (j < 7) return `il y a ${j} j`;
  return date.toLocaleDateString("fr-FR");
}

/** Date + heure en toutes lettres courtes : « 21/07/2026 à 14:05 ». */
export function fmtDateHeure(d: Date | string): string {
  const date = new Date(d);
  return `${date.toLocaleDateString("fr-FR")} à ${date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
