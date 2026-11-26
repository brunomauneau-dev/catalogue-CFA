// Génération du catalogue « Accompagnement apprentissage » en PDF (widget Grist réservé au SAIO).
// Couverture, pages d'information (table Pages_catalogue, modifiables ici), sommaire par département,
// page de séparation par département, puis une fiche par établissement (formations fermées exclues).
// Bibliothèque jsPDF (lib/, licence MIT), chargée au moment de la génération.
// Hors de Grist, la page s'affiche avec des données fictives (démonstration).
// Intégré au tableau de suivi (window.CATALOGUE_INTEGRE = { app }) : troisième onglet du suivi,
// affiché par CatalogueOnglet.afficher().
(function () {
"use strict";

const INTEGRE = window.CATALOGUE_INTEGRE || null;
const DANS_GRIST = window.parent !== window;
let D = { fiches: [], formations: [], contacts: [], accomp: [], campagnes: [], pages: [] };
let CAMP = null, MODE = "derniere", MSG = null, OUVERTES = new Set();

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lignes = t => !t || !t.id ? [] : t.id.map((id, i) => { const r = { id }; for (const k in t) r[k] = t[k][i]; return r; });
const app = INTEGRE ? INTEGRE.app : document.getElementById("app");
const racine = INTEGRE ? INTEGRE.app : document; // écouteurs limités au catalogue quand il est intégré

// ---------- Chargement ----------
async function charger() {
  if (!DANS_GRIST) return demo();
  const lire = n => grist.docApi.fetchTable(n).then(lignes).catch(() => []);
  const [fi, fo, co, ac, ca, pa] = await Promise.all(["Fiches", "Formations", "Contacts", "Accompagnement", "Campagnes", "Pages_catalogue"].map(lire));
  D = { fiches: fi, formations: fo, contacts: co, accomp: ac, campagnes: ca, pages: pa };
  CAMP = (CAMP && ca.find(c => c.id === CAMP.id)) || ca.find(c => c.Active) || ca[ca.length - 1] || null;
  afficher();
}

function demo() {
  const f = (id, Etablissement, Departement, extra) => ({ id, Campagne: 1, Etablissement, Site: "Site principal", Departement, Adresse: "1 rue Imaginaire", Code_postal: "00000", Ville: "Villeneuve", Telephone: "05 00 00 00 00", Mail: "contact@exemple.fr", Site_internet: "www.exemple.fr", Finalisee_le: 1, Presentation_accompagnement: "Le service accompagne les candidats dans leur recherche d'entreprise (texte fictif).", ...extra });
  D = {
    campagnes: [{ id: 1, Annee: "2027", Active: true }],
    fiches: [f(1, "CFA Démo du Bâtiment", "Gironde"), f(2, "CFA Démo Hôtellerie", "Landes"), f(3, "CFA Démo Multisites", TOUS), f(4, "CFA Démo Commerce", "Gironde", { Finalisee_le: null })],
    formations: [["CAP Maçon", "Bâtiment, Travaux publics", 1], ["CAP Couvreur", "Bâtiment, Travaux publics", 1], ["CAP Ébéniste", "Bois, Ameublement", 1], ["CAP Cuisine", "Hôtellerie, Restauration", 2], ["Bac pro Métiers de l'accueil", "Commerce, Vente, Logistique", 3], ["CAP Équipier polyvalent du commerce", "Commerce, Vente, Logistique", 4]]
      .map(([Intitule, Filiere, Fiche], i) => ({ id: i + 1, Fiche, Intitule, Filiere, Statut: "Maintenue", Remarque: i === 0 ? "Possible aussi sur un autre site" : "" })),
    contacts: [1, 2, 3, 4].map(n => ({ id: n, Fiche: n, Fonction: "Accueil des candidats", Nom: "Prénom NOM", Telephone: "05 00 00 00 0" + n, Mail: "contact" + n + "@exemple.fr" })),
    accomp: [1, 2, 3].flatMap(n => ["Entretien individuel", "Mise en relation avec des entreprises", "Job dating"].map((Action, i) => ({ id: n * 10 + i, Fiche: n, Groupe: "", Action, Cochee: i !== 2 }))),
    pages: [{ id: 1, Ordre: 1, Titre: "Quels sont mes droits et mes obligations ?", Afficher: true, Texte: "Texte de démonstration.\n\n- **Gras** entre doubles astérisques\n- Lien : [Parcoursup](https://www.parcoursup.fr)\n\n## Intertitre\nParagraphe ordinaire." }],
  };
  CAMP = D.campagnes[0];
  afficher();
}

// ---------- Choix des fiches ----------
// « derniere » : la fiche si finalisée, sinon sa dernière version finalisée, sinon exclue ; « actuelle » : toutes, telles quelles.
function fichesRetenues() {
  if (!CAMP) return [];
  const res = [];
  for (const f of D.fiches.filter(x => x.Campagne === CAMP.id)) {
    if (MODE === "actuelle" || f.Finalisee_le) { res.push(f); continue; }
    let p = D.fiches.find(x => x.id === f.Fiche_precedente);
    while (p && !p.Finalisee_le) p = D.fiches.find(x => x.id === p.Fiche_precedente);
    if (p) res.push(p);
  }
  return res;
}
function parDepartement(fiches) {
  const g = new Map();
  for (const f of fiches) { if (!g.has(nomDep(f))) g.set(nomDep(f), []); g.get(nomDep(f)).push(f); }
  const ordre = [...g.keys()].sort((a, b) => (a === TOUS ? -1 : b === TOUS ? 1 : a.localeCompare(b, "fr")));
  return ordre.map(d => [d, g.get(d).sort((a, b) => String(a.Etablissement).localeCompare(b.Etablissement, "fr", { numeric: true }) || String(a.Site).localeCompare(b.Site, "fr", { numeric: true }))]);
}

// ---------- Écran ----------
function afficher() {
  const selCampagne = `<select id="choixCampagne" aria-label="Campagne" style="width:auto">${D.campagnes.map(c => `<option value="${c.id}"${CAMP && c.id === CAMP.id ? " selected" : ""}>Campagne ${esc(c.Annee)}${c.Active ? " (active)" : ""}</option>`).join("")}</select>`;
  if (!INTEGRE) document.getElementById("campagne").innerHTML = selCampagne;
  if (!CAMP) { app.innerHTML = `<p class="alerte">Aucune campagne.</p>`; return; }
  const enTeteIntegre = INTEGRE ? `<div class="filtres"><span class="etat">Catalogue de la campagne</span>${selCampagne}</div>` : "";
  const toutes = D.fiches.filter(f => f.Campagne === CAMP.id), ret = fichesRetenues();
  const groupes = parDepartement(ret);
  const lignesDep = groupes.map(([d, l]) => `<div class="diff"><span class="nomgrp">${esc(d)}</span><span class="pill">${l.length} fiche${l.length > 1 ? "s" : ""}</span></div>`).join("");
  const pages = [...D.pages].sort((a, b) => (a.Ordre || 0) - (b.Ordre || 0));
  const blocPages = pages.map(p => `<details class="pli" data-pli="${p.id}"${OUVERTES.has(p.id) ? " open" : ""}>
      <summary><span class="nomgrp">${esc(p.Titre || "Sans titre")}</span>${p.Afficher ? "" : `<span class="pill">masquée</span>`}</summary>
      <div class="corps">
        <div class="form-ech"><label class="champ">Titre<input data-p="${p.id}" data-c="Titre" value="${esc(p.Titre)}"></label>
          <label class="champ">Ordre<input type="number" data-p="${p.id}" data-c="Ordre" value="${esc(p.Ordre)}"></label></div>
        <label class="coche"><input type="checkbox" data-p="${p.id}" data-c="Afficher"${p.Afficher ? " checked" : ""}>Afficher dans le catalogue</label>
        <label class="champ">Texte<textarea rows="10" data-p="${p.id}" data-c="Texte">${esc(p.Texte)}</textarea></label>
        <div class="boutons"><button class="mini prim" data-enregistrer="${p.id}">Enregistrer cette page</button><button class="mini" data-supprimer="${p.id}">Supprimer</button></div>
      </div></details>`).join("");
  const bandeau = MSG ? `<div class="bandeau ${MSG.cl}" role="status" style="margin-bottom:12px">${esc(MSG.txt)}</div>` : "";
  app.innerHTML = `${enTeteIntegre}${bandeau}<div class="colonnes">
    <div class="principal">
      <section class="carte"><h2>Fiches du catalogue ${esc(CAMP.Annee)}</h2>
        <p class="etat">${toutes.length} fiche(s) dans la campagne, dont ${toutes.filter(f => f.Finalisee_le).length} finalisée(s). ${ret.length} retenue(s) pour le catalogue.</p>
        <label class="coche"><input type="radio" name="mode" value="derniere"${MODE === "derniere" ? " checked" : ""}>Fiches non finalisées : reprendre leur dernière version finalisée (sinon les laisser hors du catalogue)</label>
        <label class="coche"><input type="radio" name="mode" value="actuelle"${MODE === "actuelle" ? " checked" : ""}>Prendre toutes les fiches telles quelles, même non finalisées (version de travail)</label>
        ${lignesDep || `<p class="etat">Aucune fiche retenue.</p>`}
        <p class="etat">Ordre : par département, puis par établissement (ordre alphabétique). Les formations « Fermée » n'apparaissent pas.</p>
      </section>
      <section class="carte"><div class="entete"><h2>Pages d'information</h2><button class="mini" id="ajoutPage">+ Ajouter une page</button></div>
        <p class="etat">Placées après la couverture. Mise en forme : <b>**gras**</b>, liste avec « - » en début de ligne, intertitre avec « ## », lien avec [texte](adresse).</p>
        ${blocPages || `<p class="etat">Aucune page.</p>`}</section>
    </div>
    <div class="cote">
      <section class="carte"><h2>Couverture</h2>
        <label class="champ">Titre<input id="cTitre" value="${esc("Accompagnement - apprentissage " + CAMP.Annee)}"></label>
        <label class="champ">Sous-titre<input id="cSous" value="Catalogue des CFA partenaires"></label>
        <label class="champ">Mention en bas de couverture<input id="cBas" value="SAIO"></label></section>
      <section class="carte"><button class="btn" id="generer"${ret.length ? "" : " disabled"}>Générer le PDF</button>
        <p class="etat">Le fichier est téléchargé par votre navigateur.</p></section>
    </div></div>`;
}


async function generer() {
  try {
    await chargerPdf();
    const opts = {
      titre: document.getElementById("cTitre").value.trim(), sousTitre: document.getElementById("cSous").value.trim(), bas: document.getElementById("cBas").value.trim(),
      pages: [...D.pages].filter(p => p.Afficher).sort((a, b) => (a.Ordre || 0) - (b.Ordre || 0)),
      groupes: parDepartement(fichesRetenues()),
    };
    const doc = genererPdf(opts, D);
    doc.save(`catalogue-accompagnement-apprentissage-${CAMP.Annee}.pdf`);
    MSG = { cl: "ok", txt: `Catalogue généré : ${doc.getNumberOfPages()} pages, ${opts.groupes.reduce((n, [, l]) => n + l.length, 0)} fiches.` };
  } catch (err) { MSG = { cl: "err", txt: "Génération impossible : " + (err && err.message ? err.message : err) }; }
  afficher();
}

// ---------- Interactions ----------
async function appliquer(actions, txt) {
  if (!DANS_GRIST) { MSG = { cl: "ok", txt: "Démonstration : " + txt }; return afficher(); }
  try { await grist.docApi.applyUserActions(actions); MSG = { cl: "ok", txt }; await charger(); }
  catch (err) { MSG = { cl: "err", txt: "Refusé : " + (err && err.message ? err.message : err) }; afficher(); }
}
app.addEventListener("toggle", e => { const d = e.target; if (d.dataset && d.dataset.pli) d.open ? OUVERTES.add(+d.dataset.pli) : OUVERTES.delete(+d.dataset.pli); }, true);
racine.addEventListener("change", e => {
  const el = e.target;
  if (el.id === "choixCampagne") { CAMP = D.campagnes.find(c => c.id === +el.value); MSG = null; return afficher(); }
  if (el.name === "mode") { MODE = el.value; return afficher(); }
});
racine.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = b.dataset;
  if (b.id === "generer") { b.disabled = true; b.textContent = "Génération…"; return generer(); }
  if (b.id === "ajoutPage") {
    const ordre = Math.max(0, ...D.pages.map(p => p.Ordre || 0)) + 1;
    if (!DANS_GRIST) { D.pages.push({ id: Date.now(), Ordre: ordre, Titre: "Nouvelle page", Texte: "", Afficher: true }); return afficher(); }
    return appliquer([["AddRecord", "Pages_catalogue", null, { Ordre: ordre, Titre: "Nouvelle page", Texte: "", Afficher: true }]], "Page ajoutée.");
  }
  if (d.enregistrer) {
    const id = +d.enregistrer, champs = {};
    document.querySelectorAll(`[data-p="${id}"]`).forEach(el => { champs[el.dataset.c] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value; });
    if (!DANS_GRIST) { Object.assign(D.pages.find(p => p.id === id), champs); MSG = { cl: "ok", txt: "Démonstration : page enregistrée." }; return afficher(); }
    return appliquer([["UpdateRecord", "Pages_catalogue", id, champs]], "Page enregistrée.");
  }
  if (d.supprimer) {
    if (b.dataset.confirme !== "1") { b.dataset.confirme = "1"; b.textContent = "Confirmer la suppression"; return; }
    if (!DANS_GRIST) { D.pages = D.pages.filter(p => p.id !== +d.supprimer); return afficher(); }
    return appliquer([["RemoveRecord", "Pages_catalogue", +d.supprimer]], "Page supprimée.");
  }
});

if (INTEGRE) {
  window.CatalogueOnglet = { afficher: () => charger(), rafraichir: () => charger() };
} else {
  if (DANS_GRIST) {
    grist.ready({ requiredAccess: "full" });
    grist.onRecords(() => charger());
  }
  charger();
}
})();
