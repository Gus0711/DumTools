-- « Ce point ne demande aucun matériel » : décision posée À LA MAIN, point par
-- point. Jamais déduite du type d'E/S — une DO peut parfaitement appeler du
-- matériel. Sert à distinguer « rien à fournir » de « nomenclature pas encore
-- renseignée » dans la BOM d'affaire (docs/MAGASIN.md §5).
--
-- NOTE : Prisma a de nouveau généré ici un `DROP INDEX "WikiPage_recherche_idx"`
-- + un `ALTER … "recherche" DROP DEFAULT` sur la colonne tsvector GÉNÉRÉE du
-- wiki. Dérive connue (voir CLAUDE.md) : ces deux lignes ont été RETIRÉES —
-- les appliquer casse la recherche plein-texte du wiki.

-- AlterTable
ALTER TABLE "PointCatalog" ADD COLUMN     "sansMateriel" BOOLEAN NOT NULL DEFAULT false;
