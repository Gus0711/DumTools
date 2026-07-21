import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPage } from "@/tools/wiki/queries";
import { ApercuWiki } from "@/tools/wiki/apercu-wiki";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ rubrique: string; pageId: string }>;
}): Promise<Metadata> {
  const { pageId } = await params;
  const page = await getPage(pageId);
  return { title: page ? `Aperçu · ${page.titre}` : "Aperçu" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ rubrique: string; pageId: string }>;
}) {
  const { pageId } = await params;
  const page = await getPage(pageId);
  if (!page) notFound();

  return (
    <ApercuWiki
      page={{
        id: page.id,
        titre: page.titre,
        contenu: page.contenu,
        rubriqueSlug: page.rubriqueSlug,
        rubriqueNom: page.rubriqueNom,
        updatedAt: page.updatedAt.toISOString(),
      }}
    />
  );
}
