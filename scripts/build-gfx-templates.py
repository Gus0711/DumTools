#!/usr/bin/env python3
"""Génère les gabarits GFX (squelettes) + prototypes de ressources E/S.

Entrée  : projets .gfx de référence dans gfx/ (un par modèle d'automate).
Sortie  : public/gfx-templates/<ref>.gfx      squelette vide (sans E/S ni logique)
          src/tools/liste-points/gfx-export/prototypes.generated.ts

Un .gfx est un ZIP de XML. Main.xml est un graphe d'objets .NET « à plat » :
chaque ressource / forme est un enfant direct de <Root>, référencée par id via
les <Items> des collections et les attributs ref=. On réduit ce graphe à un
squelette (scaffold + ressources système + module IDX 0), puis on extrait un
prototype de ressource d'entrée et de sortie par famille de format.

NE PAS ÉDITER les fichiers générés à la main — relancer ce script.
"""
import xml.etree.ElementTree as ET
import json
import os
import re
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GFX = os.path.join(ROOT, "gfx")
OUT_GFX = os.path.join(ROOT, "public", "gfx-templates")
OUT_TS = os.path.join(ROOT, "src", "tools", "liste-points", "gfx-export", "prototypes.generated.ts")

# ref -> (fichier source, famille de format)
MODELS = [
    ("ECY-PTU-207", "PTU207_MC_CAIN_V17_03.gfx", "IP"),
    ("ECY-303", "ECY303_SALLE POLY_SOUCHEZ.gfx", "IP"),
    ("ECY-400", "ECY400_SANEF_TECHNI_CO.gfx", "IP2"),
    ("ECY-600", "ECY600_8UI_EIFFAGE_CRECHE.gfx", "IP2"),
    ("ECY-S1000E", "S1000-ECLYPSE-STO_Cerville_Mag.gfx", "IP2"),
]


def read_main(zpath):
    with zipfile.ZipFile(zpath) as z:
        name = next(n for n in z.namelist() if n.replace("\\", "/").split("/")[-1].lower() == "main.xml")
        raw = z.read(name)
    return raw.decode("utf-8-sig")


def keep_tag(t):
    """Enfants de <Root> conservés dans le squelette (scaffold + système)."""
    if t in ("Namespaces", "Project", "ResourceManager", "DrawingDocument",
             "CustomPropertyInfo", "Enumeration", "IPDeviceInfo"):
        return True
    if t.endswith("DeviceResource") or t.endswith("IOModuleResource"):
        return True
    return any(k in t for k in (
        "LogicalTree", "SmartSenseCommon", "LcdScreen", "RealTimeClock",
        "NetworkPolicy", "BindingManagement"))


def rewrite_collections(root):
    """Recale les <Items>/<Cnt>/dim des collections sur les ids survivants."""
    ids = {e.attrib["id"] for e in root.iter() if "id" in e.attrib}
    for coll in list(root.iter()):
        items = cnt = None
        for c in coll:
            if c.tag == "Items":
                items = c
            elif c.tag == "Cnt":
                cnt = c
        if items is not None and items.text and re.fullmatch(r"[\d,\s]*", items.text):
            kept = [x for x in re.findall(r"\d+", items.text) if x in ids]
            items.text = ",".join(kept)
            if "dim" in items.attrib:
                items.attrib["dim"] = str(len(kept))
            if cnt is not None:
                cnt.text = str(len(kept))
    return ids


def strip(root):
    # 1. ne garder que scaffold + ressources système
    for ch in list(root):
        if not keep_tag(ch.tag):
            root.remove(ch)
    # 2. un seul document de dessin (vide)
    docs = [c for c in root if c.tag == "DrawingDocument"]
    for d in docs[1:]:
        root.remove(d)
    # 3. un seul module E/S : IDX 0 (module intégré / premier module de la pile)
    mods = [c for c in root if c.tag.endswith("IOModuleResource")]
    for m in mods:
        idx = m.find("IDX")
        if idx is not None and idx.text not in ("0", None):
            root.remove(m)
    # 4. purge des relations module<->ressource
    rm = root.find("ResourceManager")
    for c in list(rm):
        if c.tag.startswith("REL") and c.tag != "REL_COUNT":
            rm.remove(c)
    if rm.find("REL_COUNT") is not None:
        rm.find("REL_COUNT").text = "0"
    # 5. convergence : retirer tout enfant de Root porteur d'un ref= orphelin
    for _ in range(8):
        ids = rewrite_collections(root)
        parent = {c: p for p in root.iter() for c in p}
        offenders = set()
        for e in root.iter():
            for k, v in e.attrib.items():
                if k == "ref" and v.isdigit() and v not in ids:
                    cur = e
                    while cur in parent and parent[cur] is not root:
                        cur = parent[cur]
                    offenders.add(cur)
        if not offenders:
            break
        for o in offenders:
            if o in list(root):
                root.remove(o)
    rewrite_collections(root)
    return root


def assert_closed(root, label):
    ids = {e.attrib["id"] for e in root.iter() if "id" in e.attrib}
    bad = []
    for e in root.iter():
        for k, v in e.attrib.items():
            if k == "ref" and v.isdigit() and v not in ids:
                bad.append(v)
        if e.tag == "Items" and e.text:
            bad += [x for x in re.findall(r"\d+", e.text) if x not in ids]
    if bad:
        raise SystemExit(f"[{label}] références orphelines: {sorted(set(bad))[:20]}")


def serialize_main(root):
    body = ET.tostring(root, encoding="unicode")
    return '<?xml version="1.0" encoding="utf-8"?>\n' + body


def module_id_of(root):
    m = next(c for c in root if c.tag.endswith("IOModuleResource"))
    return m.find("ModuleId").text


# ---- Espaces de noms : remise en correspondance (remap) --------------------
# EC-gfxProgram réordonne la table <Namespaces> à chaque sauvegarde. Les blocs
# extraits d'un fichier source portent des index ns= propres à CE fichier ; on
# les retraduit vers la table du squelette cible en faisant correspondre les
# VALEURS de namespace (et non les index).

# Source de prototypes par famille (fichier de référence complet et correct).
FAMILY_SRC = {
    "IP2": "ECY400_SANEF_TECHNI_CO.gfx",
    "IP": "ECY303_SALLE POLY_SOUCHEZ.gfx",
}
FAMILY_INFO = {
    "IP2": {"prefix": "IP2Bacnet", "asm": "DC.Gpl.Model.IP2", "nsmod": "Distech.Gpl.Model.Configuration.IP2"},
    "IP": {"prefix": "BacnetIP", "asm": "DC.Gpl.Model.IP", "nsmod": "Distech.Gpl.Model.Configuration.IP"},
}


def ns_table(xml):
    """index -> (value, asm). Une même value peut exister sous 2 asm (ex.
    « Distech.Gpl.Model » en DC.Gpl.Model ET DC.Gpl.Model.IP) : la clé de
    correspondance doit donc être le COUPLE (value, asm), pas la value seule."""
    tab = {}
    for m in re.finditer(r'<Namespace(\d+)\b([^>]*?)/?>', xml):
        idx, attrs = int(m.group(1)), m.group(2)
        v = re.search(r'value="([^"]*)"', attrs)
        a = re.search(r'asm="([^"]*)"', attrs)
        tab[idx] = (v.group(1) if v else "", a.group(1) if a else "")
    return tab


def remap_ns(block, src_tab, dst_pair2idx):
    def rep(m):
        attr, idx = m.group(1), int(m.group(2))
        pair = src_tab.get(idx)
        if pair is None:
            return m.group(0)
        if pair not in dst_pair2idx:
            raise SystemExit(f"remap_ns: namespace {pair} absent de la cible")
        return f'{attr}="{dst_pair2idx[pair]}"'
    return re.sub(r'\b(ns|gns)="(\d+)"', rep, block)


# ---- Extraction / tokenisation des prototypes ------------------------------

def tok_ids(block):
    """id="N" -> id="__IDk__" (ordre du document). __ID0__ = id primaire."""
    ids = re.findall(r'id="(\d+)"', block)
    for i, old in enumerate(ids):
        block = block.replace(f'id="{old}"', f'id="__ID{i}__"', 1)
    return block, len(ids)


def find_blocks(xml, tag):
    return [m.group(0) for m in re.finditer(r'<' + tag + r'\b[^>]*>.*?</' + tag + r'>', xml, re.S)]


def named(b):
    m = re.search(r'<(NAME|Name)>([^<]+)</\1>', b)
    return bool(m and m.group(2).strip())


def find_input(xml, prefix, si):
    tag = prefix + "HardwareInputResource"
    cand = [b for b in find_blocks(xml, tag)
            if named(b) and re.search(rf'<SignalInterpretation>{si}</SignalInterpretation>', b)]
    return min(cand, key=len) if cand else None


def find_output(xml, prefix, st):
    tag = prefix + "HardwareOutputResource"
    cand = []
    for b in find_blocks(xml, tag):
        m = re.search(r'<SignalType>(\d+)</SignalType>', b)
        if named(b) and m and m.group(1) == str(st):
            cand.append(b)
    return min(cand, key=len) if cand else None


def find_shape(xml, tag):
    # tag = HardwareInput / HardwareOutput SHAPE (exclut ...Resource)
    cand = [m.group(0) for m in re.finditer(r'<' + tag + r'(?=[ >])[^>]*>.*?</' + tag + r'>', xml, re.S)
            if "Resource" not in m.group(0)[:len(tag) + 20]]
    return min(cand, key=len) if cand else None


def tok_resource(b):
    b = re.sub(r"<IDX>[^<]*</IDX>", "<IDX>__IDX__</IDX>", b, count=1)
    b = re.sub(r"<NAME>[^<]*</NAME>", "<NAME>__NAME__</NAME>", b, count=1)
    return tok_ids(b)


def tok_trend(b):
    b = re.sub(r"<IDX>[^<]*</IDX>", "<IDX>__TLIDX__</IDX>", b, count=1)
    b = re.sub(r"<NAME>[^<]*</NAME>", "<NAME>__NAME__ Trend Log</NAME>", b, count=1)
    b = re.sub(r"<ObjectType>\d+</ObjectType>", "<ObjectType>__OBJTYPE__</ObjectType>", b, count=1)
    b = re.sub(r"<ObjectInstance>\d+</ObjectInstance>", "<ObjectInstance>__OBJINST__</ObjectInstance>", b, count=1)
    b = re.sub(r"<LoggingType>\d+</LoggingType>", "<LoggingType>__LOGTYPE__</LoggingType>", b, count=1)
    b = re.sub(r"<BufferSize>\d+</BufferSize>", "<BufferSize>__BUFSIZE__</BufferSize>", b, count=1)
    return tok_ids(b)


def tok_shape(b):
    # IL/OL (liens de câblage) vidés : bloc posé mais non câblé.
    b = re.sub(r"(<(?:IL|OL)\b[^>]*>)\s*<Cnt>\d+</Cnt>\s*<Items[^>]*>[^<]*</Items>", r"\1<Cnt>0</Cnt>", b, flags=re.S)
    b = re.sub(r"<Name>[^<]*</Name>", "<Name>__NAME__</Name>", b, count=1)
    b = re.sub(r'<Doc ref="\d+"\s*/>', '<Doc ref="__DOC__" />', b, count=1)
    b = re.sub(r"<Bds>[^<]*</Bds>", "<Bds>__BDS__</Bds>", b, count=1)
    b = re.sub(r"<Index>[^<]*</Index>", "<Index>__PIDX__</Index>", b, count=1)
    return tok_ids(b)


def tok_doc(b):
    # Document de dessin vide (gabarit de page) : Shps vidé, Name tokenisé.
    b = re.sub(r"(<Shps\b[^>]*>)\s*<Cnt>\d+</Cnt>(\s*<Items[^>]*>[^<]*</Items>)?", r"\1<Cnt>0</Cnt>", b, flags=re.S)
    b = re.sub(r"<Name>[^<]*</Name>", "<Name>__NAME__</Name>", b, count=1)
    return tok_ids(b)


# ---- Page d'accueil (cartouche « Présentation / DUMORTIER ») ---------------
# Extraite de My Project_home_page.gfx : le document + ses 96 TextShapes
# statiques (les afficheurs dynamiques et leurs bindings, non isolables, sont
# écartés). Cuisson hors-ligne dans chaque squelette (remap ns + renumérotation
# d'ids), avec tokens de pré-remplissage remplis par le writer.
HOME_SRC = "My Project_home_page.gfx"
HOME_DOC_ID = "388"


def extract_home():
    xml = read_main(os.path.join(GFX, HOME_SRC))
    src_ns = ns_table(xml)
    doc = re.search(r'<DrawingDocument id="' + HOME_DOC_ID + r'".*?</DrawingDocument>', xml, re.S).group(0)
    # ids des TextShapes uniquement
    text_blocks = re.findall(r'<TextShape\b[^>]*>.*?</TextShape>', xml, re.S)
    text_ids = [re.search(r'id="(\d+)"', b).group(1) for b in text_blocks]
    # Shps du document réduit aux TextShapes
    doc = re.sub(r'(<Shps\b[^>]*>)\s*<Cnt>\d+</Cnt>\s*<Items([^>]*?)dim="\d+"([^>]*>)[^<]*</Items>',
                 lambda m: f'{m.group(1)}<Cnt>{len(text_ids)}</Cnt><Items{m.group(2)}dim="{len(text_ids)}"{m.group(3)}{",".join(text_ids)}</Items>',
                 doc, count=1, flags=re.S)
    doc = re.sub(r'<Name>[^<]*</Name>', '<Name>Présentation</Name>', doc, count=1)
    frag = doc + "\n" + "\n".join(text_blocks)
    # Pré-remplissage (tokens)
    frag = frag.replace("Mise en service le :", "Chantier : __CHANTIER__\nMise en service le :")
    frag = frag.replace("XX / XX / 2026", "__MES_DATE__")
    return frag, src_ns


def bake_home(main_xml, home_frag, home_src_ns, dst_v2i, base_id):
    frag = remap_ns(home_frag, home_src_ns, dst_v2i)
    old_ids = re.findall(r'id="(\d+)"', frag)
    id_map = {old: str(base_id + i + 1) for i, old in enumerate(old_ids)}

    def sub_id(m):
        return f'id="{id_map[m.group(1)]}"'

    def sub_ref(m):
        return f'ref="{id_map[m.group(1)]}"' if m.group(1) in id_map else m.group(0)

    frag = re.sub(r'id="(\d+)"', sub_id, frag)
    frag = re.sub(r'ref="(\d+)"', sub_ref, frag)
    # ids de Items internes (Shps) : remapper ceux du fragment
    frag = re.sub(r'(<Items[^>]*>)([\d,]+)(</Items>)',
                  lambda m: m.group(1) + ",".join(id_map.get(x, x) for x in m.group(2).split(",")) + m.group(3), frag)
    new_doc_id = id_map[HOME_DOC_ID]
    # Insérer avant </Root>
    main_xml = re.sub(r'</Root>\s*$', frag + "\n</Root>", main_xml)
    # Déclarer le document dans Project/Docs
    main_xml = re.sub(
        r'(<Docs\b[^>]*>)([\s\S]*?)(<Items\b[^>]*?)dim="(\d+)"([^>]*>)([^<]*)(</Items>)',
        lambda m: (m.group(1) + re.sub(r'<Cnt>\d+</Cnt>', f'<Cnt>{len(m.group(6).split(",")) + 1}</Cnt>', m.group(2))
                   + m.group(3) + f'dim="{len(m.group(6).split(",")) + 1}"' + m.group(5)
                   + ",".join(filter(None, [m.group(6), new_doc_id])) + m.group(7)),
        main_xml, count=1)
    return main_xml


def build():
    os.makedirs(OUT_GFX, exist_ok=True)
    home_frag, home_src_ns = extract_home()

    # 1. Prototypes par famille (tokenisés, dans la table ns du fichier source).
    fam_proto = {}
    for fam, src in FAMILY_SRC.items():
        xml = read_main(os.path.join(GFX, src))
        pre = FAMILY_INFO[fam]["prefix"]
        raw = {
            "inputAnalog": find_input(xml, pre, 5),
            "inputDigital": find_input(xml, pre, 3),
            "outputAnalog": find_output(xml, pre, 3),
            "outputDigital": find_output(xml, pre, 1),
            "trend": find_blocks(xml, pre + "TrendLogResource")[0] if find_blocks(xml, pre + "TrendLogResource") else None,
            "inputShape": find_shape(xml, pre + "HardwareInput"),
            "outputShape": find_shape(xml, pre + "HardwareOutput"),
        }
        missing = [k for k, v in raw.items() if not v]
        if missing:
            raise SystemExit(f"[{fam}] prototypes manquants dans {src}: {missing}")
        toks = {
            "inputAnalog": tok_resource(raw["inputAnalog"]),
            "inputDigital": tok_resource(raw["inputDigital"]),
            "outputAnalog": tok_resource(raw["outputAnalog"]),
            "outputDigital": tok_resource(raw["outputDigital"]),
            "trend": tok_trend(raw["trend"]),
            "inputShape": tok_shape(raw["inputShape"]),
            "outputShape": tok_shape(raw["outputShape"]),
        }
        fam_proto[fam] = {"src_ns": ns_table(xml), "toks": toks}
        print(f"[proto {fam}] " + " ".join(f"{k}={v[1]}id" for k, v in toks.items()))

    # 2. Squelettes + prototypes remappés par modèle.
    out_protos = {}
    models_meta = {}
    for ref, src, family in MODELS:
        zpath = os.path.join(GFX, src)
        skel = strip(ET.fromstring(read_main(zpath)))
        assert_closed(skel, ref)
        main_xml = serialize_main(skel)
        module_id = module_id_of(skel)
        dst_v2i = {pair: idx for idx, pair in ns_table(main_xml).items()}

        # Cuisson de la page d'accueil (cartouche) dans le squelette.
        base_max = max(int(x) for x in re.findall(r'id="(\d+)"', main_xml))
        main_xml = bake_home(main_xml, home_frag, home_src_ns, dst_v2i, base_max)
        max_id = max(int(x) for x in re.findall(r'id="(\d+)"', main_xml))

        fp = fam_proto[family]
        info = FAMILY_INFO[family]

        def R(key):
            b, n = fp["toks"][key]
            return {"xml": remap_ns(b, fp["src_ns"], dst_v2i), "idCount": n}

        # Gabarit de page (document de dessin vide du squelette, déjà en table ns cible).
        docm = re.search(r"<DrawingDocument\b.*?</DrawingDocument>", main_xml, re.S)
        doc_xml, doc_ids = tok_doc(docm.group(0))

        out_protos[ref] = {
            "family": family, "asm": info["asm"], "nsmod": info["nsmod"], "prefix": info["prefix"],
            "inputAnalog": R("inputAnalog"), "inputDigital": R("inputDigital"),
            "outputAnalog": R("outputAnalog"), "outputDigital": R("outputDigital"),
            "trend": R("trend"), "inputShape": R("inputShape"), "outputShape": R("outputShape"),
            "docTemplate": {"xml": doc_xml, "idCount": doc_ids},
        }

        # Réécriture du zip squelette.
        dst = os.path.join(OUT_GFX, ref + ".gfx")
        with zipfile.ZipFile(zpath) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
            for it in zin.infolist():
                low = it.filename.replace("\\", "/").lower()
                base = low.split("/")[-1]
                if base == "main.xml":
                    zout.writestr(it.filename, main_xml.encode("utf-8"))
                elif base == "internalpoints.xml":
                    zout.writestr(it.filename,
                                  '<?xml version="1.0" encoding="UTF-8"?>\n'
                                  '<Configuration version="3.0">\n  <Points measurement="SI" />\n'
                                  '  <Enumerations />\n</Configuration>')
                elif base == "favorites.xml":
                    zout.writestr(it.filename, '<?xml version="1.0" encoding="utf-16"?>\r\n<Root />'.encode("utf-16"))
                elif "/schedules/" in low or base.startswith("schedule"):
                    continue
                else:
                    zout.writestr(it, zin.read(it.filename))
        print(f"[skel {ref}] {os.path.getsize(dst)}o  maxId={max_id}  moduleId={module_id}  famille={family}")
        models_meta[ref] = {"family": family, "maxId": max_id, "moduleId": module_id}

    # 3. Émission TS.
    ts = [
        "// Généré par scripts/build-gfx-templates.py — NE PAS ÉDITER À LA MAIN.",
        "// Prototypes E/S (par modèle, table ns déjà remappée) + métadonnées des squelettes.",
        "",
        "export interface Proto { xml: string; idCount: number; }",
        "export interface ModelProtos {",
        "  family: string; asm: string; nsmod: string; prefix: string;",
        "  inputAnalog: Proto; inputDigital: Proto;",
        "  outputAnalog: Proto; outputDigital: Proto;",
        "  trend: Proto; inputShape: Proto; outputShape: Proto; docTemplate: Proto;",
        "}",
        "",
        f"export const PROTOS: Record<string, ModelProtos> = {json.dumps(out_protos, ensure_ascii=False, indent=2)};",
        "",
        "export interface SkeletonMeta { family: string; maxId: number; moduleId: string; }",
        f"export const SKELETON_META: Record<string, SkeletonMeta> = {json.dumps(models_meta, ensure_ascii=False, indent=2)};",
        "",
    ]
    with open(OUT_TS, "w", encoding="utf-8") as f:
        f.write("\n".join(ts))
    print(f"[ts] {OUT_TS}")


if __name__ == "__main__":
    build()
