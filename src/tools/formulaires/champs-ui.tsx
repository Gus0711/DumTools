"use client";

// Métadonnées d'affichage des types de champ (icônes + palette). Séparé de
// model.ts (client-safe, importé aussi côté serveur) pour ne pas tirer lucide
// dans les bundles serveur.

import type { LucideIcon } from "lucide-react";
import {
  Type,
  AlignLeft,
  Hash,
  SlidersHorizontal,
  ChevronsUpDown,
  Calendar,
  CalendarClock,
  ToggleLeft,
  List,
  ChevronDown,
  Camera,
  PenLine,
  Paperclip,
  Mic,
  PenTool,
  PencilRuler,
  ScanLine,
  Briefcase,
  MapPin,
  SeparatorHorizontal,
  Pilcrow,
  Image,
  Calculator,
} from "lucide-react";
import type { TypeChamp } from "./model";

export const ICONE_CHAMP: Record<TypeChamp, LucideIcon> = {
  texte: Type,
  texteLong: AlignLeft,
  nombre: Hash,
  slider: SlidersHorizontal,
  compteur: ChevronsUpDown,
  date: Calendar,
  dateHeure: CalendarClock,
  case: ToggleLeft,
  choix: List,
  liste: ChevronDown,
  photo: Camera,
  signature: PenLine,
  pieceJointe: Paperclip,
  audio: Mic,
  dessin: PenTool,
  schema: PencilRuler,
  codeBarre: ScanLine,
  reference: Briefcase,
  gps: MapPin,
  separateur: SeparatorHorizontal,
  texteFixe: Pilcrow,
  imageFixe: Image,
  calcul: Calculator,
};

/** Sous-titre court par type — aide de la palette. */
export const TYPE_CHAMP_INDICE: Record<TypeChamp, string> = {
  texte: "Une ligne",
  texteLong: "Plusieurs lignes",
  nombre: "Une valeur chiffrée",
  slider: "Curseur borné",
  compteur: "Incrément −/+",
  date: "Jour, mois, année",
  dateHeure: "Jour + heure",
  case: "Oui / non",
  choix: "Options affichées",
  liste: "Menu déroulant",
  photo: "Une ou plusieurs photos",
  signature: "Signature manuscrite",
  pieceJointe: "Fichier joint",
  audio: "Note vocale",
  dessin: "Croquis libre",
  schema: "Annoter un plan",
  codeBarre: "Scanner un code",
  reference: "Lier une affaire",
  gps: "Position sur le terrain",
  separateur: "Titre de section",
  texteFixe: "Consigne affichée",
  imageFixe: "Image d'illustration",
  calcul: "Valeur calculée",
};

export interface GroupePalette {
  titre: string;
  types: TypeChamp[];
}

/** Palette regroupée par nature. */
export const GROUPES_PALETTE: GroupePalette[] = [
  {
    titre: "Saisie",
    types: ["texte", "texteLong", "nombre", "slider", "compteur", "date", "dateHeure"],
  },
  { titre: "Choix", types: ["case", "choix", "liste"] },
  {
    titre: "Terrain",
    types: [
      "photo",
      "signature",
      "audio",
      "dessin",
      "schema",
      "pieceJointe",
      "codeBarre",
      "reference",
      "gps",
    ],
  },
  { titre: "Présentation", types: ["separateur", "texteFixe", "imageFixe"] },
  { titre: "Automatique", types: ["calcul"] },
];
