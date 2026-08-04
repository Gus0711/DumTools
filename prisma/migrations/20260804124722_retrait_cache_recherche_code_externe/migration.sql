-- RETRAIT DU CACHE D'INTERROGATION D'UNE BASE DE CODES-BARRES EXTERNE
--
-- L'enrichissement d'un code scanné par UPCitemdb, branché le matin même, est
-- retiré le soir : testé sur du vrai matériel GTB, il ne répond pas. La table
-- ne contenait que le cache des interrogations — aucune donnée du magasin n'y
-- vivait, sa suppression n'emporte donc rien.
--
-- ⚠️ Comme toutes les migrations de ce dépôt : le DROP de "WikiPage_recherche_idx"
-- et le DROP DEFAULT de sa colonne tsvector générée, que le diff de Prisma
-- rajoute systématiquement, ont été retirés (cf. CLAUDE.md).

DROP TABLE "RechercheCodeExterne";
