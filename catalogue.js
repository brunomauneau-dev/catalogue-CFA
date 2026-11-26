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
const STYLE = "guide"; // habillage du PDF (les autres restent disponibles dans pdf-fiches.js)

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
    fiches: [f(1, "CFA Démo du Bâtiment", "Gironde"), f(2, "CFA Démo Hôtellerie", "Landes"), f(3, "GRETA Démo", "Autre (Greta)"), f(4, "CFA Démo Commerce", "Gironde", { Finalisee_le: null })],
    formations: [["CAP Maçon", "Bâtiment, Travaux publics", 1], ["CAP Couvreur", "Bâtiment, Travaux publics", 1], ["CAP Ébéniste", "Bois, Ameublement", 1], ["CAP Cuisine", "Hôtellerie, Restauration", 2], ["Bac pro Métiers de l'accueil", "Commerce, Vente, Logistique", 3], ["CAP Équipier polyvalent du commerce", "Commerce, Vente, Logistique", 4]]
      .map(([Intitule, Filiere, Fiche], i) => ({ id: i + 1, Fiche, Intitule, Filiere, Statut: "Maintenue", Remarque: i === 0 ? "Possible aussi sur un autre site" : "" })),
    contacts: [1, 2, 3, 4].map(n => ({ id: n, Fiche: n, Fonction: "Accueil des candidats", Nom: "Prénom NOM", Telephone: "05 00 00 00 0" + n, Mail: "contact" + n + "@exemple.fr" })),
    accomp: [1, 2, 3].flatMap(n => ["Entretien individuel", "Mise en relation avec des entreprises", "Job dating"].map((Action, i) => ({ id: n * 10 + i, Fiche: n, Groupe: "", Action, Cochee: i !== 2 }))),
    pages: [{ id: 1, Ordre: 1, Titre: "Quels sont mes droits et mes obligations ?", Afficher: true, Texte: "Texte de démonstration.\n\n- **Gras** entre doubles astérisques\n- Lien : [Parcoursup](https://www.parcoursup.fr)\n\n## Intertitre\nParagraphe ordinaire." }],
  };
  CAMP = D.campagnes[0];
  window.CATALOGUE_DEMO = D; // données fictives, pour les essais hors de Grist
  afficher();
}

// ---------- Choix des fiches ----------
// « derniere » : la fiche si elle a été reçue, sinon sa dernière version reçue (an dernier), sinon exclue ; « actuelle » : toutes, telles quelles.
function fichesRetenues() {
  if (!CAMP) return [];
  const res = [];
  for (const f of D.fiches.filter(x => x.Campagne === CAMP.id)) {
    if (MODE === "actuelle" || f.Soumise_le || f.Finalisee_le) { res.push(f); continue; }
    let p = D.fiches.find(x => x.id === f.Fiche_precedente);
    while (p && !(p.Soumise_le || p.Finalisee_le)) p = D.fiches.find(x => x.id === p.Fiche_precedente);
    if (p) res.push(p);
  }
  return res;
}
function parDepartement(fiches) {
  const g = new Map();
  for (const f of fiches) { if (!g.has(nomDep(f))) g.set(nomDep(f), []); g.get(nomDep(f)).push(f); }
  const ordre = [...g.keys()].sort(ordreDep);
  return ordre.map(d => [d, g.get(d).sort((a, b) => String(a.Etablissement).localeCompare(b.Etablissement, "fr", { numeric: true }) || String(a.Site).localeCompare(b.Site, "fr", { numeric: true }))]);
}

// ---------- Aperçu d'une page d'information (même mise en forme que le PDF) ----------
function enLigneHtml(t) {
  return esc(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<span class="lien">$1</span>');
}
function apercuHtml(titre, texte) {
  let html = `<div class="ap-titre">${esc(titre || "")}</div><div class="ap-filet"></div>`, liste = false;
  for (const brut of String(texte || "").split(/\r?\n/)) {
    const l = brut.trimEnd();
    if (/^\s*[-*]\s+/.test(l)) { if (!liste) { html += "<ul>"; liste = true; } html += `<li>${enLigneHtml(l.replace(/^\s*[-*]\s+/, ""))}</li>`; continue; }
    if (liste) { html += "</ul>"; liste = false; }
    if (!l.trim()) { html += '<div class="ap-vide"></div>'; continue; }
    if (/^##\s+/.test(l)) { html += `<div class="ap-inter">${enLigneHtml(l.replace(/^##\s+/, ""))}</div>`; continue; }
    html += `<p>${enLigneHtml(l)}</p>`;
  }
  return html + (liste ? "</ul>" : "");
}
function majApercu(id) {
  const v = c => { const el = racine.querySelector(`[data-p="${id}"][data-c="${c}"]`); return el ? el.value : ""; };
  const box = racine.querySelector(`[data-apercu="${id}"]`); if (box) box.innerHTML = apercuHtml(v("Titre"), v("Texte"));
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
        <div class="edition-page">
          <label class="champ">Texte<textarea rows="14" data-p="${p.id}" data-c="Texte">${esc(p.Texte)}</textarea></label>
          <div class="champ">Aperçu (mise à jour pendant la saisie)<div class="apercu-page style-guide" data-apercu="${p.id}">${apercuHtml(p.Titre, p.Texte)}</div></div>
        </div>
        <div class="boutons"><button class="mini prim" data-enregistrer="${p.id}">Enregistrer cette page</button><button class="mini" data-apercu-pdf="${p.id}">Aperçu PDF exact</button><button class="mini" data-supprimer="${p.id}">Supprimer</button></div>
      </div></details>`).join("");
  const bandeau = MSG ? `<div class="bandeau ${MSG.cl}" role="status" style="margin-bottom:12px">${esc(MSG.txt)}</div>` : "";
  app.innerHTML = `${enTeteIntegre}${bandeau}<div class="colonnes">
    <div class="principal">
      <section class="carte"><h2>Fiches du catalogue ${esc(CAMP.Annee)}</h2>
        <p class="etat">${toutes.length} fiche(s) dans la campagne, dont ${toutes.filter(f => f.Soumise_le || f.Finalisee_le).length} reçue(s). ${ret.length} retenue(s) pour le catalogue.</p>
        <label class="coche"><input type="radio" name="mode" value="derniere"${MODE === "derniere" ? " checked" : ""}>Fiches pas encore reçues : reprendre leur version de l'an dernier</label>
        <label class="coche"><input type="radio" name="mode" value="actuelle"${MODE === "actuelle" ? " checked" : ""}>Prendre toutes les fiches telles quelles, même non reçues (version de travail)</label>
        ${lignesDep || `<p class="etat">Aucune fiche retenue.</p>`}
        <p class="etat">Ordre (comme le catalogue 2026) : couverture, pages d'information, sommaire, « Autre (Greta) » (PDF fournis par les GRETA, repris tels quels), puis chaque département avec sa page de séparation ; établissements par ordre alphabétique. Les formations « Fermée » n'apparaissent pas.</p>
      </section>
      <section class="carte"><div class="entete"><h2>Pages d'information</h2><button class="mini" id="ajoutPage">+ Ajouter une page</button></div>
        <p class="etat">Placées après la couverture. Mise en forme : <b>**gras**</b>, liste avec « - » en début de ligne, intertitre avec « ## », lien avec [texte](adresse).</p>
        ${blocPages || `<p class="etat">Aucune page.</p>`}</section>
    </div>
    <div class="cote">
      <section class="carte"><h2>Page de garde</h2>
        <label class="champ">Déposer la page de garde (PDF, format A4)<input type="file" id="cImage" accept="application/pdf"></label>
        ${aCouvCampagne() ? `<p class="etat">Page de garde ${esc(CAMP.Annee)} déposée : elle ouvrira le catalogue. Déposer un autre PDF la remplace.</p><div class="boutons"><button class="mini prim" id="cApercu">Aperçu</button><button class="mini" id="cOublier">Retirer</button></div>`
          : `<p class="etat">Aucune page de garde : une couverture simple (titre, année, logo) sera composée.</p>`}</section>
      <section class="carte"><button class="btn" id="generer"${ret.length ? "" : " disabled"}>Générer le PDF</button>
        <p class="etat">Le fichier est téléchargé par votre navigateur.</p></section>
    </div></div>`;
}


// PDF de la seule page d'information, avec le texte en cours de saisie (même s'il n'est pas encore enregistré)
async function apercuPdf(id) {
  try {
    await chargerPdf();
    const v = c => { const el = racine.querySelector(`[data-p="${id}"][data-c="${c}"]`); return el ? el.value : ""; };
    const opts = { seulementPages: true, style: STYLE, annee: CAMP.Annee, groupes: [], pages: [{ Titre: v("Titre"), Texte: v("Texte") }] };
    const doc = genererPdf(opts, D);
    await afficherPdf(doc, opts, `Aperçu : ${v("Titre") || "page d'information"}`, `apercu-page-${id}.pdf`);
  } catch (err) { MSG = { cl: "err", txt: "Aperçu impossible : " + (err && err.message ? err.message : err) }; afficher(); }
}

// Page de garde enregistrée avec la campagne (colonne Campagnes.Couverture) : texte « data: » mémorisé depuis cet écran,
// ou pièce jointe Grist (PDF, PNG ou JPEG) -> data URL
const aCouvCampagne = () => !!CAMP && ((typeof CAMP.Couverture === "string" && CAMP.Couverture.startsWith("data:")) || idsPieces(CAMP.Couverture).length > 0);
async function couvertureCampagne() {
  if (CAMP && typeof CAMP.Couverture === "string" && CAMP.Couverture.startsWith("data:")) return CAMP.Couverture;
  const id = idsPieces(CAMP && CAMP.Couverture)[0];
  if (!id || !DANS_GRIST) return null;
  try {
    const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: true });
    const blob = await (await fetch(`${baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(token)}`)).blob();
    if (!/^(image\/(png|jpe?g)|application\/pdf)$/i.test(blob.type)) return null;
    return await new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(blob); });
  } catch (e) { return null; }
}

// Aperçu de la page de garde déposée, telle quelle, dans la visionneuse du widget
async function apercuCouverture() {
  const data = await couvertureCampagne();
  if (!data || !/^data:application\/pdf/i.test(data)) { MSG = { cl: "err", txt: "Aperçu impossible : la page de garde n'est pas un PDF lisible." }; return afficher(); }
  afficherOctets(new Uint8Array(dataVersOctets(data)), `Page de garde ${CAMP.Annee}`, `page-de-garde-${CAMP.Annee}.pdf`);
}

async function generer() {
  try {
    await chargerPdf();
    const opts = {
      titre: "Catalogue de l'accompagnement vers l'apprentissage", sousTitre: "", bas: "Service régional académique de l'information, de l'orientation et de la lutte contre le décrochage scolaire (SRAIOLDS)",
      style: STYLE, couverture: await couvertureCampagne(),
      pages: [...D.pages].filter(p => p.Afficher).sort((a, b) => (a.Ordre || 0) - (b.Ordre || 0)),
      groupes: parDepartement(fichesRetenues()), annee: CAMP.Annee,
    };
    opts.documents = await chargerDocuments(opts.groupes.flatMap(([, l]) => l)); // PDF fournis (GRETA)
    const doc = genererPdf(opts, D);
    await telechargerPdf(doc, opts, `catalogue-accompagnement-apprentissage-${CAMP.Annee}.pdf`);
    MSG = { cl: "ok", txt: `Catalogue généré : ${doc.getNumberOfPages()} pages, ${opts.groupes.reduce((n, [, l]) => n + l.length, 0)} fiches${opts.documents.size ? `, dont ${opts.documents.size} en PDF fourni` : ""}.` };
  } catch (err) { MSG = { cl: "err", txt: "Génération impossible : " + (err && err.message ? err.message : err) }; }
  afficher();
}

// ---------- Interactions ----------
async function appliquer(actions, txt) {
  if (!DANS_GRIST) {
    for (const a of actions) if (a[0] === "UpdateRecord" && a[1] === "Campagnes") Object.assign(D.campagnes.find(c => c.id === a[2]), a[3]);
    MSG = { cl: "ok", txt: "Démonstration : " + txt }; return afficher();
  }
  try { await grist.docApi.applyUserActions(actions); MSG = { cl: "ok", txt }; await charger(); }
  catch (err) { MSG = { cl: "err", txt: "Refusé : " + (err && err.message ? err.message : err) }; afficher(); }
}
app.addEventListener("toggle", e => { const d = e.target; if (d.dataset && d.dataset.pli) d.open ? OUVERTES.add(+d.dataset.pli) : OUVERTES.delete(+d.dataset.pli); }, true);
racine.addEventListener("input", e => { const el = e.target; if (el.dataset && el.dataset.p && (el.dataset.c === "Texte" || el.dataset.c === "Titre")) majApercu(el.dataset.p); });
racine.addEventListener("change", e => {
  const el = e.target;
  if (el.id === "choixCampagne") { CAMP = D.campagnes.find(c => c.id === +el.value); MSG = null; return afficher(); }
  if (el.name === "mode") { MODE = el.value; return afficher(); }
  if (el.id === "cImage" && el.files && el.files[0]) {
    const fic = el.files[0], lect = new FileReader();
    if (fic.size > 4e6) { MSG = { cl: "err", txt: "PDF trop lourd (4 Mo maximum) : allégez-le (export « qualité écran »)." }; return afficher(); }
    lect.onload = () => appliquer([["UpdateRecord", "Campagnes", CAMP.id, { Couverture: lect.result }]], `Page de garde déposée pour la campagne ${CAMP.Annee}.`);
    lect.readAsDataURL(fic);
  }

});
racine.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = b.dataset;
  if (d.apercuPdf) return apercuPdf(+d.apercuPdf);
  if (b.id === "cApercu") return apercuCouverture();
  if (b.id === "cOublier") return appliquer([["UpdateRecord", "Campagnes", CAMP.id, { Couverture: null }]], "La page de garde de la campagne n'est plus utilisée.");
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
