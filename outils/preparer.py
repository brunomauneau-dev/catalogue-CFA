# Usage : python3 -I preparer.py fiches.json ../referentiel/intitules.json fiches-pretes.json
# Complète les fiches lues : nom provisoire si absent, filière d'après le référentiel si absente, alertes de vérification.
# Aucun affichage de valeur : seulement des comptes.
import sys, json, re, unicodedata
fiches = json.load(open(sys.argv[1], encoding="utf8"))
ref = json.load(open(sys.argv[2], encoding="utf8"))["intitules"]
STOP = {"agricole", "option", "opt", "les", "des", "aux", "avec", "ans", "apprentissage", "possible", "aussi", "sur", "uniquement", "site", "cap", "bac", "pro", "capa", "professionnel"}
def mots(s):
    s = unicodedata.normalize("NFD", s.lower()); s = "".join(c for c in s if not unicodedata.combining(c))
    return {w for w in re.findall(r"[a-z]+", s) if len(w) > 2 and w not in STOP}
cands = [(r["filiere"], [mots(r["intitule"])] + [mots(v) for v in r["variantes"]]) for r in ref]
def filiere(intit):
    w = mots(intit); best, fil = 0, ""
    for f, cs in cands:
        for c in cs:
            if c:
                sc = len(w & c) / len(c)
                if sc > best: best, fil = sc, f
    return fil if best >= 0.6 else ""
n_fil = n_nom = 0
for f in fiches:
    alertes = []
    # pages « Tous départements » du catalogue 2026 : les GRETA-CFA, rangés à part
    if f["Departement"] == "Tous départements":
        f["Departement"] = "Autre (Greta)"
    if f["image"]: alertes.append("fiche en image dans le catalogue 2026 : tout est à saisir")
    if not f["Etablissement"]:
        f["Etablissement"] = f"[À compléter – page {f['page']} du catalogue 2026]"; n_nom += 1
        if not f["image"]: alertes.append("nom de l'établissement à compléter")
    for x in f["formations"]:
        if not x["Filiere"]:
            x["Filiere"] = filiere(x["Intitule"]) or "Autres formations"; n_fil += 1
    if not f["image"]:
        if not f["formations"]: alertes.append("aucune formation lue")
        if not f["actions"]: alertes.append("aucune action d'accompagnement lue")
        if any(not (c["Telephone"] or c["Mail"]) for c in f["contacts"]): alertes.append("contact sans téléphone ni mail")
        if any(not c["Nom"] for c in f["contacts"]): alertes.append("contact sans nom")
        if f["non_classees"]: alertes.append(f"{f['non_classees']} ligne(s) non classée(s)")
        if any(len(x["Intitule"]) > 110 for x in f["formations"]): alertes.append("intitulé de formation très long (deux formations collées ?)")
    f["A_verifier"] = " ; ".join(alertes)
json.dump(fiches, open(sys.argv[3], "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(f"{len(fiches)} fiches ; noms provisoires : {n_nom} ; filières déduites du référentiel : {n_fil} ; fiches avec alerte : {sum(1 for f in fiches if f['A_verifier'])} ; sans alerte : {sum(1 for f in fiches if not f['A_verifier'])}")
