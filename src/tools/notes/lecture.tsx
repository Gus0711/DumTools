"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { NoteContenu } from "./model";

export interface NoteLectureProps {
  contenu: NoteContenu;
  /** Force un thème (ex. "light" pour l'aperçu avant impression) ; sinon suit
   *  le thème de l'app. */
  themeForce?: "light" | "dark";
}

const Impl = dynamic(() => import("./lecture-impl").then((m) => m.NoteLectureImpl), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center gap-2 py-16 text-muted">
      <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
    </div>
  ),
});

export function NoteLecture(props: NoteLectureProps) {
  return <Impl {...props} />;
}
