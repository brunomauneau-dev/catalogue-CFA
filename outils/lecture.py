# Lecture du catalogue PDF 2026 -> fiches structurées (JSON).
# Règle d'or : aucune valeur n'est affichée ; seuls des comptes et des numéros de page sortent du script.
# Usage : python3 -I lecture.py catalogue.pdf sortie.json
import sys, re, json, collections, pdfplumber

DEPS = [((8, 9), "Tous départements"), ((11, 24), "Dordogne"), ((26, 51), "Gironde"),
        ((53, 67), "Landes"), ((69, 78), "Lot-et-Garonne"), ((80, 90), "Pyrénées-Atlantiques")]
TITRE_CONTACT = re.compile(r"^\W*CONTACTS?\b", re.I)
TITRE_FORM = re.compile(r"^\W*(FORMATIONS?\s+PROPOS|FILI[ÈE]RES?\s+DE\s+FORMATION)", re.I)
TITRE_MOD = re.compile(r"^\W*MODALIT", re.I)
MAIL = re.compile(r"[\w.+'-]+@[\w-]+(\.[\w-]+)+")
TEL = re.compile(r"(\+33\s?|\b0)[1-9]([\s.\-]?\d{2}){4}")
CP = re.compile(r"(?<![\w])(\d{2}\s?\d{3})(?![\d])")
BOITE = re.compile(r"\b(CS|BP|TSA|C\.S\.|B\.P\.)\s*$", re.I)

def code_postal(t):
    """(adresse avant, code postal, ville) ou None ; ignore les numéros de boîte postale."""
    for m in reversed(list(CP.finditer(t))):
        if BOITE.search(t[:m.start()]): continue
        ville = t[m.end():].strip(" ,-–")
        if ville and not re.match(r"[A-Za-zÀ-ÿ]", ville): continue
        return t[:m.start()].strip(" ,-–"), m.group(1).replace(" ", ""), ville
    return None
WEB = re.compile(r"(https?://\S+|www\.\S+)", re.I)
DIPL = re.compile(r"^(CAP\s*A\b|CAPA\b|CAP\b|C\.A\.P\.?|BAC\s*PRO|Bac\s*Pro(fessionnel)?|Baccalaur[ée]at\s+professionnel|BPA?\b|BTSA?\b|BTM\b|BM\b|MC\b|Mention\s+compl|CS\b|Certificat\s+de\s+sp|Titre\s+pro|TP\b|CQP\b|Brevet)", re.I)
PUCES = "•▪●◦‣∙·➢➤►▶■□-–—*o"

def nettoie(t):
    return re.sub(r"\s+", " ", t.replace("", "").replace("", "").replace("", "").replace("", "")).strip()

def sans_puce(t):
    return t.lstrip(PUCES + "  \t").strip()

def frontiere(pg, yh):
    # bande verticale la plus large sans caractère, entre x=100 et x=400 (corps de page)
    occ = [0] * int(pg.width + 1)
    for c in pg.chars:
        if yh < c["top"] < 780 and c["text"].strip():
            for x in range(int(c["x0"]), int(c["x1"]) + 1): occ[min(x, len(occ) - 1)] += 1
    best, cur, deb = (0, 230), 0, 0
    for x in range(100, 400):
        if occ[x] == 0:
            if cur == 0: deb = x
            cur += 1
            if cur > best[0]: best = (cur, deb + cur // 2)
        else: cur = 0
    return best[1] if best[0] >= 4 else None

def colonne(pg, x0, x1, y0, y1):
    # garde les caractères dont le centre est dans [x0, x1[, puis limite la hauteur
    z = pg.filter(lambda o: o.get("object_type") != "char" or x0 <= (o["x0"] + o["x1"]) / 2 < x1)
    return z.crop((0, y0, pg.width, y1))

def lignes(zone):
    out = []
    for l in zone.extract_text_lines(x_tolerance=1.5, y_tolerance=3, return_chars=True):
        ch = [c for c in l["chars"] if c["text"].strip()]
        if not ch: continue
        f0 = ch[0]["fontname"]
        corps = [c for c in ch if "Wingdings" not in c["fontname"] and "Symbol" not in c["fontname"]]
        gras = bool(corps) and sum("Bold" in c["fontname"] for c in corps) > len(corps) / 2
        ital = bool(corps) and sum("Italic" in c["fontname"] for c in corps) > len(corps) / 2
        brut = l["text"]
        puce = "Wingdings" in f0 or "Symbol" in f0 or brut.lstrip()[:1] in PUCES
        t = nettoie(brut)
        if t: out.append({"t": t, "x": l["x0"], "y": l["top"], "taille": ch[0]["size"], "gras": gras, "ital": ital, "puce": puce})
    return out

def lire_page(pg, n):
    fiche = {"page": n, "Departement": next((d for (a, b), d in DEPS if a <= n <= b), ""), "Etablissement": "", "Site": "",
             "Adresse": [], "Code_postal": "", "Ville": "", "Telephone": "", "Mail": "", "Site_internet": "",
             "contacts": [], "formations": [], "presentation": [], "actions": [], "non_classees": 0, "image": False}
    mots = pg.extract_words()
    tf = [w for w in mots if re.match(r"FORMATIONS?$|FILI[ÈE]RES?$", w["text"], re.I)]
    tc = [w for w in mots if re.match(r"CONTACTS?", w["text"], re.I)]
    yh = min([w["top"] for w in tf + tc] or [90]) - 3
    # en-tête : nom de l'établissement (grand corps)
    ent = lignes(pg.crop((0, 0, pg.width, max(yh, 1))))
    grands = [l for l in ent if l["taille"] >= 15]
    fiche["Etablissement"] = " ".join(l["t"] for l in grands)
    xb = frontiere(pg, yh) or 230
    zones = lignes(colonne(pg, 0, xb, yh, 780)) + lignes(colonne(pg, xb, pg.width + 1, yh, 780))
    if len("".join(l["t"] for l in zones)) < 120: fiche["image"] = True
    etat, groupe, fil, attente = "admin", "", "", ""
    contact = None
    for l in zones:
        t = l["t"]
        if TITRE_CONTACT.match(t):
            etat = "contacts"; reste = re.sub(r"^\W*CONTACTS?\s*(\(s\))?\s*:?\s*", "", t, flags=re.I)
            if not reste: continue
            t = reste
        elif TITRE_FORM.match(t):
            etat = "formations"
            m = re.search(r"sur\s+le\s+site\s+d[e'’]\s*(.+?)\s*:?$", t, re.I)
            if m: fiche["Site"] = m.group(1).strip(" :")
            continue
        elif TITRE_MOD.match(t):
            etat = "modalites"; continue
        if etat == "admin":
            # lettres isolées (texte décoratif ou débordement de l'autre colonne) : ignorées
            if len(re.sub(r"[^A-Za-zÀ-ÿ0-9]", "", t)) <= 2: continue
            # adresse mail coupée en fin de ligne : on la recolle avec la ligne suivante
            if attente: t = attente + t; attente = ""
            if "@" in t and not MAIL.search(t): attente = t; continue
            if MAIL.search(t) and not fiche["Mail"]: fiche["Mail"] = MAIL.search(t).group(0)
            elif TEL.search(t) and not fiche["Telephone"]: fiche["Telephone"] = TEL.search(t).group(0)
            elif WEB.search(t) and not fiche["Site_internet"]: fiche["Site_internet"] = WEB.search(t).group(0)
            elif not fiche["Code_postal"] and len(t) < 70 and code_postal(t):
                avant, fiche["Code_postal"], fiche["Ville"] = code_postal(t)
                if avant: fiche["Adresse"].append(avant)
            elif (l["gras"] or l["taille"] >= 12) and not fiche["Adresse"]: pass  # rappel du nom de l'établissement
            elif TEL.search(t) or MAIL.search(t): fiche["non_classees"] += 1
            else: fiche["Adresse"].append(t)
        elif etat == "contacts":
            # Un contact = des lignes de texte (fonction, nom) suivies de ses téléphones / mails.
            # Une ligne de texte qui suit un téléphone ou un mail ouvre le contact suivant.
            sp = sans_puce(t)
            mail, tel = MAIL.search(sp), TEL.search(sp)
            if contact is not None and contact["Mail"] and re.fullmatch(r"[\w.-]+\.[a-z]{2,}", sp) and not (mail or tel):
                contact["Mail"] += sp; continue
            if contact is None or (not (mail or tel) and contact["_coord"]):
                contact = {"_txt": [], "_coord": False, "Telephone": "", "Mail": ""}; fiche["contacts"].append(contact)
            if mail: contact["Mail"] = (contact["Mail"] + " / " if contact["Mail"] else "") + mail.group(0)
            if tel: contact["Telephone"] = " / ".join(([contact["Telephone"]] if contact["Telephone"] else []) + [m.group(0) for m in TEL.finditer(sp)])
            if mail or tel: contact["_coord"] = True; continue
            contact["_txt"].append((sp, l["gras"]))
        elif etat == "formations":
            sp = sans_puce(t)
            if l["ital"] and not fiche["formations"]: continue  # phrase d'introduction
            if DIPL.match(sp):
                m = re.match(r"(.*?)\s*\((.+)\)\s*$", sp)
                intit, rem = (m.group(1), m.group(2)) if m else (sp, "")
                fiche["formations"].append({"Intitule": intit, "Remarque": rem, "Filiere": fil})
            elif (l["gras"] or (l["puce"] and not fiche["formations"]) or (l["puce"] and len(sp) < 60 and not sp[:1].islower())) and not sp.startswith("("):
                fil = sp.rstrip(" :")
            elif fiche["formations"]:
                f = fiche["formations"][-1]
                if f["Remarque"] or sp.startswith("("):
                    f["Remarque"] = (f["Remarque"] + " " + sp).strip()
                else:
                    f["Intitule"] = (f["Intitule"] + " " + sp).strip()
                m = re.match(r"(.*?)\s*\((.+)\)\s*$", f["Intitule"])
                if m and not f["Remarque"]: f["Intitule"], f["Remarque"] = m.group(1), m.group(2)
                if f["Remarque"].startswith("(") : f["Remarque"] = f["Remarque"].strip("() ")
            else: fiche["non_classees"] += 1
        elif etat == "modalites":
            sp = sans_puce(t)
            if l["puce"]: fiche["actions"].append({"Groupe": groupe, "Action": sp})
            elif l["gras"] and len(sp) < 70: groupe = sp.rstrip(" :")
            elif fiche["actions"] and (sp[:1].islower() or l["x"] > 0 and fiche["actions"]): fiche["actions"][-1]["Action"] += " " + sp
            else: fiche["presentation"].append(sp)
    for c in fiche["contacts"]:
        txt = c.pop("_txt"); c.pop("_coord")
        gras = [i for i, (_, g) in enumerate(txt) if g]
        civ = [i for i, (x, _) in enumerate(txt) if re.match(r"^(M\.|Mme|Mlle|Madame|Monsieur)\b", x)]
        i_nom = civ[-1] if civ else gras[-1] if gras else (len(txt) - 1 if len(txt) >= 2 else None)
        c["Nom"] = txt[i_nom][0] if i_nom is not None else ""
        c["Fonction"] = " ".join(x for i, (x, _) in enumerate(txt) if i != i_nom)
        c["Pole"] = ""
    fiche["contacts"] = [c for c in fiche["contacts"] if c["Nom"] or c["Fonction"] or c["Telephone"] or c["Mail"]]
    fiche["Adresse"] = ", ".join(fiche["Adresse"])
    fiche["presentation"] = " ".join(fiche["presentation"])
    return fiche

def noms_separateurs(pdf):
    # pages de séparation : liste des établissements par département (pour nommer les fiches en image)
    res = {}
    for (a, b), dep in DEPS:
        p = a - 1
        if p < 1: continue
        res[dep] = [l["t"] for l in lignes(pdf.pages[p - 1]) if l["t"] and not re.search(r"ACCOMPAGNEMENT|CATALOGUE|D[ÉE]PARTEMENT", l["t"], re.I)]
    return res

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    fiches = []
    with pdfplumber.open(src) as pdf:
        for (a, b), dep in DEPS:
            for n in range(a, b + 1): fiches.append(lire_page(pdf.pages[n - 1], n))
    json.dump(fiches, open(dst, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    # ---- bilan (comptes uniquement) ----
    img = [f["page"] for f in fiches if f["image"]]
    txt = [f for f in fiches if not f["image"]]
    print(f"{len(fiches)} pages lues : {len(txt)} fiches texte, {len(img)} fiches image (pages {img})")
    print(f"formations {sum(len(f['formations']) for f in txt)}, contacts {sum(len(f['contacts']) for f in txt)}, actions {sum(len(f['actions']) for f in txt)}")
    champs = ["Etablissement", "Site", "Adresse", "Code_postal", "Ville", "Telephone", "Mail", "Site_internet"]
    print("champs remplis :", {c: sum(1 for f in txt if f[c]) for c in champs}, "présentation :", sum(1 for f in txt if f["presentation"]))
    alerte = collections.defaultdict(list)
    for f in txt:
        if not f["Etablissement"]: alerte["sans nom"].append(f["page"])
        if not f["formations"]: alerte["0 formation"].append(f["page"])
        if not f["contacts"]: alerte["0 contact"].append(f["page"])
        if any(not (c["Telephone"] or c["Mail"]) for c in f["contacts"]): alerte["contact sans tél ni mail"].append(f["page"])
        if any(not c["Nom"] for c in f["contacts"]): alerte["contact sans nom"].append(f["page"])
        if not f["actions"]: alerte["0 action"].append(f["page"])
        if any(not x["Filiere"] for x in f["formations"]): alerte["formation sans filière"].append(f["page"])
        if any(len(x["Intitule"]) > 110 for x in f["formations"]): alerte["intitulé très long"].append(f["page"])
        if f["non_classees"]: alerte["lignes non classées"].append(f["page"])
    for k, v in alerte.items(): print(f"  à vérifier – {k} : pages {v}")
