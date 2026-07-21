import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getPage, listerRubriquesMenu, listerTags } from "@/tools/wiki/queries";
import { WikiEditeur } from "@/tools/wiki/editeur";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ rubrique: string; pageId: string }>;
}): Promise<Metadata> {
  const { pageId } = await params;
  const page = await getPage(pageId);
  return { title: page ? `Wiki · ${page.titre}` : "Wiki" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ rubrique: string; pageId: string }>;
}) {
  const { pageId } = await params;
  const [page, rubriques, tags, session] = await Promise.all([
    getPage(pageId),
    listerRubriquesMenu(),
    listerTags(),
    auth(),
  ]);
  if (!page) notFound();

  const estAdmin = session?.user?.role === "ADMIN";

  return (
    <WikiEditeur
      page={{
        id: page.id,
        titre: page.titre,
        resume: page.resume,
        contenu: page.contenu,
        version: page.version,
        rubriqueId: page.rubriqueId,
        rubriqueSlug: page.rubriqueSlug,
        rubriqueNom: page.rubriqueNom,
        parentId: page.parentId,
        ancetres: page.ancetres,
        tags: page.tags,
        auteur: page.auteur,
        updatedAt: page.updatedAt.toISOString(),
      }}
      rubriques={rubriques}
      tousLesTags={tags.map((t) => ({ nom: t.nom, couleur: t.couleur }))}
      estAdmin={estAdmin}
    />
  );
}
