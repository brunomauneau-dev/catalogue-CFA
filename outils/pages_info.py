# Pages d'information 2 à 5 du catalogue -> titre + texte (pour la table Pages_catalogue). Aucune valeur affichée.
# Usage : python3 -I pages_info.py catalogue.pdf pages.json <dossier de lecture.py>
import sys, json, re, pdfplumber
sys.path.insert(0, sys.argv[3]); import lecture as L
pages = []
with pdfplumber.open(sys.argv[1]) as pdf:
    for n in (2, 3, 4, 5):
        ls = L.lignes(pdf.pages[n - 1])
        ls = [l for l in ls if l["y"] < 780]
        if not ls: continue
        tmax = max(l["taille"] for l in ls)
        titre = " ".join(l["t"] for l in ls if l["taille"] >= tmax - 0.5)
        corps, prec = [], None
        for l in ls:
            if l["taille"] >= tmax - 0.5: continue
            t = l["t"]
            if prec is not None and l["y"] - prec["y"] > l["taille"] * 2.1: corps.append("")
            if l["puce"]: t = "- " + L.sans_puce(t)
            elif l["gras"] and len(t) < 80: t = "**" + t + "**"
            corps.append(t); prec = l
        pages.append({"Ordre": len(pages) + 1, "Titre": titre or f"Page {n}", "Texte": "\n".join(corps), "Afficher": True})
json.dump(pages, open(sys.argv[2], "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(f"{len(pages)} pages d'information ; lignes de texte : {[p['Texte'].count(chr(10)) + 1 for p in pages]}")
