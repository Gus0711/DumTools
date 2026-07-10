-- Nouvelle liste d'états : Devis, Commande, En cours, Livrée, Clôturée.
-- Mapping des anciennes valeurs : PROSPECT -> DEVIS, GAGNE -> COMMANDE.
ALTER TYPE "EtatAffaire" RENAME TO "EtatAffaire_old";
CREATE TYPE "EtatAffaire" AS ENUM ('DEVIS', 'COMMANDE', 'EN_COURS', 'LIVRE', 'CLOTURE');
ALTER TABLE "Chantier" ALTER COLUMN "etat" DROP DEFAULT;
ALTER TABLE "Chantier" ALTER COLUMN "etat" TYPE "EtatAffaire" USING (
  CASE "etat"::text
    WHEN 'PROSPECT' THEN 'DEVIS'
    WHEN 'GAGNE' THEN 'COMMANDE'
    ELSE "etat"::text
  END::"EtatAffaire"
);
ALTER TABLE "Chantier" ALTER COLUMN "etat" SET DEFAULT 'DEVIS';
DROP TYPE "EtatAffaire_old";
