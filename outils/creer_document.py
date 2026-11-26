# Crée le document Grist de production « Fiches CFA » et y importe le catalogue 2026 (campagne 2026, fiches finalisées).
# Règle d'or : aucune valeur n'est affichée ; seuls des comptes sortent du script.
# Usage : python3 -I creer_document.py fiches-pretes.json pages.json intitules.json <id de l'espace Grist>
import sys, json, uuid, time, urllib.request

SERVEUR = "https://grist.numerique.gouv.fr/api"  # la clé d'API est ajoutée par l'environnement (sinon : en-tête Authorization)
ESPACE = int(sys.argv[4])  # dossier Grist où créer le document (identifiant numérique)

def req(m, url, body=None):
    r = urllib.request.Request(url, method=m, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r).read() or "null")

fiches = json.load(open(sys.argv[1], encoding="utf8"))
pages = json.load(open(sys.argv[2], encoding="utf8"))
ref = json.load(open(sys.argv[3], encoding="utf8"))["intitules"]

doc = req("POST", f"{SERVEUR}/workspaces/{ESPACE}/docs", {"name": "Fiches CFA"})
B = f"{SERVEUR}/docs/{doc}"
apply = lambda a: req("POST", B + "/apply", a)
T = lambda i, t, **k: {"id": i, "fields": {"label": i, "type": t, **k}}
F = lambda i, f, t="Any": {"id": i, "fields": {"label": i, "type": t, "isFormula": True, "formula": f}}
DT = "DateTime:Europe/Paris"
choix = lambda *c: json.dumps({"choices": list(c)})

# ---------- Structure ----------
req("POST", B + "/tables", {"tables": [
    {"id": "Campagnes", "columns": [T("Annee", "Text"), T("Date_limite", "Date"), T("Active", "Bool"), T("URL_formulaire", "Text")]},
    {"id": "Fiches", "columns": [T("Code", "Text"), T("Etablissement", "Text"), T("Site", "Text"), T("Departement", "Text"),
        T("Adresse", "Text"), T("Code_postal", "Text"), T("Ville", "Text"), T("Telephone", "Text"), T("Mail", "Text"), T("Site_internet", "Text"),
        T("Presentation_accompagnement", "Text"), T("Soumise_le", DT), T("Ouverte_le", DT)]},
]})
req("POST", B + "/tables/Fiches/columns", {"columns": [T("Campagne", "Ref:Campagnes"), T("Fiche_precedente", "Ref:Fiches"),
    T("Lien_envoye_le", DT), T("Finalisee_le", DT),
    T("Prochaine_action", "Text"), T("A_verifier", "Text"), T("Page_catalogue_2026", "Int"),
    F("Code_actif", "$Code if $Campagne and $Campagne.Active else \"\"", "Text")]})
req("POST", B + "/tables", {"tables": [
    {"id": "Formations", "columns": [T("Fiche", "Ref:Fiches"), T("Intitule", "Text"), T("Filiere", "Text"),
        T("Statut", "Choice", widgetOptions=choix("Maintenue", "Fermée", "Nouvelle")), T("Remarque", "Text"), F("CodeFiche", "$Fiche.Code_actif")]},
    {"id": "Contacts", "columns": [T("Fiche", "Ref:Fiches"), T("Fonction", "Text"), T("Nom", "Text"), T("Telephone", "Text"), T("Mail", "Text"), F("CodeFiche", "$Fiche.Code_actif")]},
    {"id": "Accompagnement", "columns": [T("Fiche", "Ref:Fiches"), T("Groupe", "Text"), T("Action", "Text"), T("Cochee", "Bool"), F("CodeFiche", "$Fiche.Code_actif")]},
    {"id": "Referentiel", "columns": [T("Diplome", "Text"), T("Intitule", "Text"), T("Filiere", "Text")]},
    {"id": "Correspondances", "columns": [T("Fiche", "Ref:Fiches"), T("Date", "Date"), T("Type", "Choice", widgetOptions=choix("Mail envoyé", "Mail reçu", "Appel", "Note")),
        T("Objet", "Text"), T("Resume", "Text")]},
    {"id": "Pages_catalogue", "columns": [T("Ordre", "Numeric"), T("Titre", "Text"), T("Texte", "Text"), T("Afficher", "Bool")]},
]})
try: apply([["RemoveTable", "Table1"]])
except Exception: pass

# ---------- Règles d'accès (tout fermé par défaut ; un lien ?Code_= n'ouvre que sa fiche de la campagne active) ----------
res = [("*", "*"), ("Fiches", "*"), ("Fiches", "Code"),
       ("Fiches", "Campagne,Fiche_precedente,Lien_envoye_le,Finalisee_le,Prochaine_action,A_verifier,Page_catalogue_2026"),
       ("Formations", "*"), ("Contacts", "*"), ("Accompagnement", "*"), ("Referentiel", "*"), ("Campagnes", "*"), ("*SPECIAL", "SchemaEdit")]
a = [["AddRecord", "_grist_ACLResources", -(i + 1), {"tableId": t, "colIds": c}] for i, (t, c) in enumerate(res)]
M = "user.LinkKey.Code and "
regles = [(-1, "user.Access == OWNER", "all"), (-1, "", "none"),
          (-2, M + "rec.Code_actif == user.LinkKey.Code", "+RU"),
          (-3, "user.Access != OWNER", "-U"), (-4, "user.Access != OWNER", "-RU")]
for k in (-5, -6, -7):
    regles += [(k, M + "newRec.CodeFiche == user.LinkKey.Code", "+CU"), (k, M + "rec.CodeFiche == user.LinkKey.Code", "+RD")]
regles += [(-8, "user.LinkKey.Code", "+R"), (-9, "user.LinkKey.Code", "+R"), (-10, "user.Access != OWNER", "-S")]
a += [["AddRecord", "_grist_ACLRules", None, {"resource": r, "aclFormula": f, "permissionsText": p, "rulePos": j + 1}] for j, (r, f, p) in enumerate(regles)]
apply(a)

# ---------- Données ----------
def bulk(table, rows):
    if not rows: return []
    cols = sorted({k for r in rows for k in r})
    out = []
    for i in range(0, len(rows), 400):
        part = rows[i:i + 400]
        out += apply([["BulkAddRecord", table, [None] * len(part), {c: [r.get(c) for r in part] for c in cols}]])["retValues"][0]
    return out

bulk("Referentiel", [{"Diplome": r["diplome"], "Intitule": r["intitule"], "Filiere": r["filiere"]} for r in ref])
bulk("Pages_catalogue", pages)
[camp] = bulk("Campagnes", [{"Annee": "2026", "Active": False}])
maintenant = time.time()
CH = ["Etablissement", "Site", "Departement", "Adresse", "Code_postal", "Ville", "Telephone", "Mail", "Site_internet", "A_verifier"]
ids = bulk("Fiches", [{**{c: f.get(c, "") for c in CH}, "Presentation_accompagnement": f.get("presentation", ""), "Code": str(uuid.uuid4()),
                       "Campagne": camp, "Finalisee_le": maintenant, "Page_catalogue_2026": f["page"]} for f in fiches])
fo, co, ac = [], [], []
for f, i in zip(fiches, ids):
    fo += [{"Fiche": i, "Intitule": x["Intitule"], "Filiere": x["Filiere"], "Remarque": x["Remarque"], "Statut": "Maintenue"} for x in f["formations"]]
    co += [{"Fiche": i, "Fonction": " ".join(x for x in (c.get("Pole", ""), c.get("Fonction", "")) if x), "Nom": c["Nom"], "Telephone": c["Telephone"], "Mail": c["Mail"]} for c in f["contacts"]]
    ac += [{"Fiche": i, "Groupe": x["Groupe"], "Action": x["Action"], "Cochee": True} for x in f["actions"]]
n = (len(bulk("Formations", fo)), len(bulk("Contacts", co)), len(bulk("Accompagnement", ac)))
print(f"document créé : {doc}")
print(f"importé : {len(ids)} fiches, {n[0]} formations, {n[1]} contacts, {n[2]} actions, {len(ref)} intitulés au référentiel, {len(pages)} pages d'information")
regl = req("GET", B + "/tables/_grist_ACLRules/records")["records"]
print("règles d'accès :", len(regl) - 1, "dont non analysées :", sum(1 for r in regl if r["fields"]["aclFormula"] and not r["fields"]["aclFormulaParsed"]))
print("accès public :", [u.get("access") for u in req("GET", f"{SERVEUR}/docs/{doc}/access")["users"] if u["email"] == "everyone@getgrist.com"] or "désactivé")
