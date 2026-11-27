// Tableau de suivi des fiches CFA (widget Grist réservé au SAIO).
// Une ligne par fiche de la campagne choisie : étapes, changements par rapport à l'an dernier,
// correspondances, prochaine action. Le bouton « Envoyer » prépare le mail dans la messagerie
// (lien personnel vers le formulaire) puis coche l'étape ; rien n'est envoyé automatiquement.
// Hors de Grist, la page s'affiche avec des données fictives (démonstration).
"use strict";

const DANS_GRIST = window.parent !== window;
// Trois états seulement : à envoyer, envoyée (en attente de retour), reçue
const ETATS_FICHE = ["À envoyer", "Envoyée, en attente", "Reçue"];
const CHAMPS = [["Etablissement", "Établissement"], ["Site", "Site"], ["Adresse", "Adresse"], ["Code_postal", "Code postal"],
  ["Ville", "Ville"], ["Telephone", "Téléphone"], ["Mail", "Mail"], ["Site_internet", "Site internet"]];
const JOUR = 86400;

let D = { fiches: [], formations: [], contacts: [], accomp: [], corresp: [], campagnes: [] };
let CAMP = null, FILTRE = { etape: "", dep: "", texte: "", retard: false }, OUVERTE = null, MSG = null;
let REPLIES = new Set(); // départements repliés dans « Toutes les fiches »
let VUE = null, ONGLET = "encours", ARCH = null; // fiche affichée dans le formulaire lié ; onglet en cours / closes
let PANNEAU = null; // "nouvelle" (préparer la campagne suivante) ou "activer" (confirmation)

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lignes = t => !t || !t.id ? [] : t.id.map((id, i) => { const r = { id }; for (const k in t) r[k] = t[k][i]; return r; });
const maintenant = () => Date.now() / 1000;
const dateFr = s => { if (!s) return ""; const d = new Date(s * 1000); return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }); };
const norm = s => String(s ?? "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase(); // apostrophes et espaces indifférents
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const app = document.getElementById("app");

// ---------- Chargement ----------
async function charger() {
  if (!DANS_GRIST) return demo();
  const lire = n => grist.docApi.fetchTable(n).then(lignes).catch(() => []);
  const [fi, fo, co, ac, cr, ca] = await Promise.all(["Fiches", "Formations", "Contacts", "Accompagnement", "Correspondances", "Campagnes"].map(lire));
  D = { fiches: fi, formations: fo, contacts: co, accomp: ac, corresp: cr, campagnes: ca };
  choisirCampagne();
  afficher();
}

function demo() {
  const t = maintenant();
  D = {
    campagnes: [{ id: 1, Annee: "2026", Active: false }, { id: 2, Annee: "2027", Active: true, Date_limite: t + 20 * JOUR, URL_formulaire: "https://exemple/formulaire" }],
    fiches: [
      { id: 1, Campagne: 1, Etablissement: "CFA Démo A", Site: "Site de Villeneuve", Departement: "Gironde", Adresse: "9 avenue Ancienne", Mail: "a@exemple.fr", Finalisee_le: t - 300 * JOUR },
      { id: 2, Campagne: 2, Fiche_precedente: 1, Code: "demo-a", Etablissement: "CFA Démo A", Site: "Site de Villeneuve", Departement: "Gironde", Adresse: "1 rue Nouvelle", Mail: "a@exemple.fr", Lien_envoye_le: t - 12 * JOUR, Ouverte_le: t - 10 * JOUR, Soumise_le: t - 2 * JOUR },
      { id: 3, Campagne: 2, Code: "demo-b", Etablissement: "CFA Démo B", Site: "Site principal", Departement: "Landes", Mail: "b@exemple.fr", Lien_envoye_le: t - 15 * JOUR },
      { id: 4, Campagne: 2, Code: "demo-c", Etablissement: "CFA Démo C", Site: "Site principal", Departement: "Dordogne", Mail: "c@exemple.fr" }],
    formations: [{ id: 1, Fiche: 1, Intitule: "CAP Maçon", Statut: "Maintenue" }, { id: 2, Fiche: 1, Intitule: "CAP Métallier", Statut: "Maintenue" },
      { id: 3, Fiche: 2, Intitule: "CAP Maçon", Statut: "Maintenue" }, { id: 4, Fiche: 2, Intitule: "CAP Métallier", Statut: "Fermée" }, { id: 5, Fiche: 2, Intitule: "CAP Carreleur mosaïste", Statut: "Nouvelle" }],
    contacts: [{ id: 1, Fiche: 1, Fonction: "Bâtiment", Nom: "Ancien contact" }, { id: 2, Fiche: 2, Fonction: "Bâtiment", Nom: "Nouveau contact" }],
    accomp: [], corresp: [{ id: 1, Fiche: 3, Date: t - 5 * JOUR, Type: "Appel", Objet: "Question", Resume: "Échange fictif" }],
  };
  choisirCampagne();
  afficher();
}

function choisirCampagne() {
  const closes = D.campagnes.filter(c => !c.Active).sort((a, b) => String(b.Annee).localeCompare(String(a.Annee)));
  if (!ARCH || !closes.find(c => c.id === ARCH.id)) ARCH = closes[0] || null; else ARCH = closes.find(c => c.id === ARCH.id);
  CAMP = ONGLET === "closes" ? ARCH : D.campagnes.find(c => c.Active) || null;
}
const CAMP_DE = f => (D.campagnes.find(c => c.id === f.Campagne) || {}).Annee || "";
const suivante = f => D.fiches.find(x => x.Fiche_precedente === f.id && (D.campagnes.find(c => c.id === x.Campagne) || {}).Active);

// ---------- Calculs ----------
function etape(f) {
  if (f.Soumise_le || f.Finalisee_le) return 2; // reçue (ou version validée d'une campagne close)
  if (f.Lien_envoye_le) return 1;
  return 0;
}
const recue = f => !!(f.Soumise_le || f.Finalisee_le);
const libEtape = n => ETATS_FICHE[n] || "";

// Appariement un pour un : d'abord les éléments identiques, puis par clé (chaque élément 2026 ne sert qu'une fois).
// Évite les faux écarts quand une même formation est proposée sur plusieurs sites, ou deux contacts ont la même fonction.
function apparier(avant, apres, ...regles) { // règles de la plus stricte à la plus souple
  const libres = new Set(avant), paires = new Map();
  for (const regle of regles) for (const n of apres) {
    if (paires.has(n)) continue;
    const o = [...libres].find(x => regle(x, n));
    if (o) { paires.set(n, o); libres.delete(o); }
  }
  return { paires, restants: [...libres] };
}
function changements(f) {
  const prec = D.fiches.find(x => x.id === f.Fiche_precedente);
  if (!prec) return null;
  const out = [];
  for (const [c, lib] of CHAMPS) if (c in f && norm(f[c]) !== norm(prec[c])) out.push({ type: "Coordonnées", lib, avant: prec[c], apres: f[c] });
  const de = (t, id) => D[t].filter(r => r.Fiche === id);
  const fo0 = de("formations", prec.id), fo1 = de("formations", f.id);
  const memeFo = (a, b) => norm(a.Intitule) === norm(b.Intitule);
  const fo = apparier(fo0, fo1, (a, b) => memeFo(a, b) && norm(a.Lieu) === norm(b.Lieu) && norm(a.Filiere) === norm(b.Filiere) && norm(a.Remarque) === norm(b.Remarque),
    (a, b) => memeFo(a, b) && norm(a.Lieu) === norm(b.Lieu));
  for (const n of fo1) {
    const o = fo.paires.get(n);
    if (!o && fo.restants.some(x => memeFo(x, n))) continue; // traité plus bas (changement de site)
    if (!o) out.push({ type: "Formation", lib: "Nouvelle", apres: n.Intitule });
    else if (n.Statut === "Fermée" && o.Statut !== "Fermée") out.push({ type: "Formation", lib: "Fermée", avant: n.Intitule });
    else if (norm(n.Remarque) !== norm(o.Remarque)) out.push({ type: "Formation", lib: "Remarque · " + n.Intitule, avant: o.Remarque, apres: n.Remarque });
  }
  // formations non appariées sur le même site : même intitulé ailleurs = changement de site
  for (const n of fo1.filter(n => !fo.paires.has(n))) {
    const o = fo.restants.find(x => memeFo(x, n));
    if (o) { fo.paires.set(n, o); fo.restants.splice(fo.restants.indexOf(o), 1); out.push({ type: "Formation", lib: "Site · " + n.Intitule, avant: o.Lieu || "(sans site)", apres: n.Lieu || "(sans site)" }); }
  }
  for (const o of fo.restants) out.push({ type: "Formation", lib: "Retirée", avant: o.Intitule });
  const co0 = de("contacts", prec.id), co1 = de("contacts", f.id);
  // contacts rapprochés par nom, sinon par pôle / fonction
  const cle = c => norm(c.Nom) || norm(c.Fonction);
  const pareil = (a, b) => (norm(a.Nom) && norm(a.Nom) === norm(b.Nom)) || (!norm(a.Nom) && cle(a) === cle(b));
  const etiq = c => c.Fonction || "";
  const champsCt = ["Nom", "Fonction", "Telephone", "Mail"];
  const co = apparier(co0, co1, (a, b) => champsCt.every(c => norm(a[c]) === norm(b[c])), pareil);
  for (const n of co1) {
    const o = co.paires.get(n);
    if (!o) { out.push({ type: "Contact", lib: "Nouveau · " + etiq(n), apres: n.Nom }); continue; }
    for (const [c, lib] of [["Nom", "Nom"], ["Fonction", "Fonction"], ["Telephone", "Téléphone"], ["Mail", "Mail"]])
      if (norm(n[c]) !== norm(o[c])) out.push({ type: "Contact", lib: lib + " · " + etiq(n), avant: o[c], apres: n[c] });
  }
  for (const o of co.restants) out.push({ type: "Contact", lib: "Retiré · " + etiq(o), avant: o.Nom });
  const ac0 = de("accomp", prec.id), ac1 = de("accomp", f.id);
  // une action reprise ne peut être que cochée, décochée ou réécrite : une action restée sans correspondance
  // dans la même catégorie est donc une action réécrite (appariement dans l'ordre de la fiche)
  const ac = apparier(ac0, ac1, (a, b) => norm(a.Action) === norm(b.Action) && !!a.Cochee === !!b.Cochee, (a, b) => norm(a.Action) === norm(b.Action),
    (a, b) => b.id && norm(a.Groupe) === norm(b.Groupe));
  for (const n of ac1) {
    const o = ac.paires.get(n);
    if (!o) out.push({ type: "Accompagnement", lib: "Nouvelle action", apres: n.Action });
    else {
      if (norm(o.Action) !== norm(n.Action)) out.push({ type: "Accompagnement", lib: "Action modifiée", avant: o.Action, apres: n.Action });
      if (!!o.Cochee !== !!n.Cochee) out.push({ type: "Accompagnement", lib: n.Cochee ? "Cochée" : "Décochée", apres: n.Action });
    }
  }
  for (const o of ac.restants) out.push({ type: "Accompagnement", lib: "Retirée", avant: o.Action });
  return out;
}

const echanges = f => D.corresp.filter(c => c.Fiche === f.id).sort((a, b) => (b.Date || 0) - (a.Date || 0));
function derniereActivite(f) {
  return Math.max(f.Lien_envoye_le || 0, f.Ouverte_le || 0, f.Soumise_le || 0, ...echanges(f).map(e => e.Date || 0));
}
function enRetard(f) { // envoyée, pas reçue, rien depuis 7 jours
  return etape(f) === 1 && maintenant() - derniereActivite(f) > 7 * JOUR;
}

// ---------- Affichage ----------
function afficher() {
  const camp = CAMP;
  const active = D.campagnes.find(c => c.Active), closes = D.campagnes.filter(c => !c.Active).sort((a, b) => String(b.Annee).localeCompare(String(a.Annee)));
  // En-tête fixe : le titre et les onglets ne bougent pas d'un onglet à l'autre
  document.getElementById("titre").textContent = "Suivi des fiches";
  document.getElementById("campagne").innerHTML = `<div class="onglets-p" role="tablist">
      <button role="tab" data-onglet="encours" aria-selected="${ONGLET === "encours"}">Campagne en cours${active ? " " + esc(active.Annee) : ""}</button>
      <button role="tab" data-onglet="closes" aria-selected="${ONGLET === "closes"}">Campagnes closes${closes.length ? " (" + closes.map(c => esc(c.Annee)).join(", ") + ")" : ""}</button>
      <button role="tab" data-onglet="catalogue" aria-selected="${ONGLET === "catalogue"}">Catalogue</button>
      ${ONGLET === "closes" && closes.length > 1 ? `<select id="choixArchive" aria-label="Campagne close" style="width:auto;margin-left:auto">${closes.map(c => `<option value="${c.id}"${ARCH && c.id === ARCH.id ? " selected" : ""}>${esc(c.Annee)}</option>`).join("")}</select>` : ""}</div>`;
  document.getElementById("actionsCampagne").innerHTML = `<button class="mini" data-panneau="nouvelle" style="visibility:${ONGLET === "encours" ? "visible" : "hidden"}">Préparer une nouvelle campagne</button>`;
  // Onglet « Catalogue » : génération du PDF (catalogue.js intégré)
  const appCat = document.getElementById("appCatalogue");
  app.hidden = ONGLET === "catalogue"; appCat.hidden = ONGLET !== "catalogue";
  if (ONGLET === "catalogue") { if (!appCat.dataset.charge) { appCat.dataset.charge = "1"; window.CatalogueOnglet.afficher(); } return; }
  if (!camp) {
    app.innerHTML = ONGLET === "closes" ? `<p class="etat">Aucune campagne close.</p>`
      : `<p class="alerte">Aucune campagne en cours.</p>${closes.map(c => `<button class="mini prim" data-activer="${c.id}">Activer la campagne ${esc(c.Annee)}</button> `).join("")}`;
    return;
  }
  // Les deux onglets ont la même présentation. Onglet « closes » : une ligne par fiche de la campagne close,
  // avec l'étape, les changements et les échanges de sa fiche dans la campagne en cours.
  const close = ONGLET === "closes";
  const anCours = active ? String(active.Annee) : "en cours";
  const lignes = D.fiches.filter(f => f.Campagne === camp.id).map(f => ({ f, s: close ? suivante(f) : f }));
  const et = l => (l.s ? etape(l.s) : -1), chg = l => (l.s && !horsDep(nomDep(l.s)) ? (changements(l.s) || []).length : 0);
  const depDe = l => l.f.Departement || "Sans département";
  const dansDep = () => lignes.filter(l => !FILTRE.dep || depDe(l) === FILTRE.dep);
  const n = v => dansDep().filter(l => { const e = et(l); const [a, b] = v.split("-").map(Number); return e >= a && e <= (b ?? a); }).length;
  const ETATS = [["", "Toutes les fiches"], ["0", "À envoyer"], ["1", "Envoyées, en attente"], ["2", "Reçues"]];
  const nbRetard = () => dansDep().filter(l => l.s && enRetard(l.s)).length, nbChg = () => dansDep().filter(l => chg(l)).length;
  const deps = [...new Set(lignes.map(l => l.f.Departement || "Sans département"))].sort(ordreDep);
  if (FILTRE.dep && !deps.includes(FILTRE.dep)) FILTRE.dep = "";
  const nbDep = d => lignes.filter(l => (l.f.Departement || "Sans département") === d).length;
  const sousOnglets = `<div class="sous-onglets" role="tablist" aria-label="Départements">
    <button role="tab" data-dep="" aria-selected="${!FILTRE.dep}">Toutes les fiches <span>${lignes.length}</span></button>
    ${deps.map(d => `<button role="tab" data-dep="${esc(d)}" aria-selected="${FILTRE.dep === d}">${esc(d)} <span>${nbDep(d)}</span></button>`).join("")}</div>`;
  const filtres = `<div class="filtres">
    <input id="fTexte" placeholder="Rechercher un établissement ou une ville" aria-label="Rechercher" value="${esc(FILTRE.texte)}">

    ${FILTRE.dep ? "" : `<span class="boutons" style="margin-left:auto"><button class="mini" data-tout-dep="ouvrir">Tout déplier</button><button class="mini" data-tout-dep="replier">Tout replier</button></span>`}</div>`;
  // Récapitulatif de la campagne (marge de droite) : chaque compte est un filtre
  let recap = "";
  if (!close) {
    const tot = dansDep().length, recues = n("2");
    const jours = camp.Date_limite ? Math.ceil((camp.Date_limite * 1000 - Date.now()) / 86400000) : null;
    const actif = k => k === "ch" ? !!FILTRE.ch : k === "retard" ? FILTRE.retard : !FILTRE.ch && !FILTRE.retard && FILTRE.etape === k;
    const item = (k, lib, nb, cl) => `<li><button class="recap-filtre${cl ? " " + cl : ""}" data-recap="${k}" aria-pressed="${actif(k)}"><span>${lib}</span><b>${nb}</b></button></li>`;
    recap = `<aside class="recap" aria-label="Avancement de la campagne">
      <h3>Campagne ${esc(camp.Annee)}${FILTRE.dep ? ` · ${esc(FILTRE.dep)}` : ""}</h3>
      <div class="recap-total">${recues} fiche${recues > 1 ? "s" : ""} reçue${recues > 1 ? "s" : ""} sur ${tot}</div>
      <div class="barre" role="progressbar" aria-valuemin="0" aria-valuemax="${tot}" aria-valuenow="${recues}"><i style="width:${tot ? Math.round(100 * recues / tot) : 0}%"></i></div>
      <ul>${item("", "Toutes les fiches", tot)}${item("0", "À envoyer", n("0"))}${item("1", "Envoyées, en attente", n("1"))}${item("2", "Reçues", recues)}
        ${item("ch", "Avec changements", nbChg())}${item("retard", "Sans réponse depuis 7 j", nbRetard(), nbRetard() ? "alerte" : "")}</ul>
      ${!camp.Date_limite ? `<p class="recap-date"><b class="alerte-txt">Date limite non renseignée</b><br>Les mails partent sans échéance (colonne Date_limite de la campagne).</p>` : ""}
      ${camp.Date_limite ? `<p class="recap-date">Date limite : ${esc(new Date(camp.Date_limite * 1000).toLocaleDateString("fr-FR"))}<br><b>${jours > 0 ? "J-" + jours : jours === 0 ? "Aujourd'hui" : "Dépassée de " + -jours + " j"}</b></p>` : ""}
    </aside>`;
  }
  const garde = l => {
    const e = et(l);
    if (FILTRE.etape !== "") { const [a, b] = FILTRE.etape.split("-").map(Number); if (e < a || e > (b ?? a)) return false; }
    if (FILTRE.retard && !(l.s && enRetard(l.s))) return false;
    if (FILTRE.ch && !chg(l)) return false;
    if (FILTRE.dep && (l.f.Departement || "Sans département") !== FILTRE.dep) return false;
    if (FILTRE.texte && !norm([l.f.Etablissement, l.f.Site, l.f.Ville].join(" ")).includes(norm(FILTRE.texte))) return false;
    return true;
  };
  const vis = lignes.filter(garde).sort((a, b) => ordreDep(a.f.Departement || "Sans département", b.f.Departement || "Sans département") || String(a.f.Etablissement).localeCompare(b.f.Etablissement, "fr", { numeric: true }));
  let corps = "", depCourant = null;
  for (const l of vis) {
    const dep = l.f.Departement || "Sans département";
    if (!FILTRE.dep && dep !== depCourant) {
      depCourant = dep;
      const ouvert = !REPLIES.has(dep);
      corps += `<tr class="dep"><td colspan="${close ? 4 : 5}"><button class="dep-pli" data-replier="${esc(dep)}" aria-expanded="${ouvert}"><span class="chevron" aria-hidden="true"></span>${esc(dep)} <span class="nb">${vis.filter(x => (x.f.Departement || "Sans département") === dep).length}</span></button></td></tr>`;
    }
    if (!FILTRE.dep && REPLIES.has(dep)) continue;
    corps += ligne(l.f, l.s, close);
    if (l.s && OUVERTE === l.s.id) corps += `<tr class="detail"><td colspan="${close ? 4 : 5}">${detail(close ? l.f : l.s, close)}</td></tr>`;
  }
  const bandeau = MSG ? `<div class="bandeau ${MSG.cl}" role="status" style="margin-bottom:12px">${esc(MSG.txt)}</div>` : "";
  const contexte = close ? `Campagne ${esc(camp.Annee)} close, en consultation : les fiches telles que publiées en ${esc(camp.Annee)}. La comparaison avec ${esc(anCours)} se trouve dans l'onglet de la campagne en cours.` : "";
  app.innerHTML = `${bandeau}${panneau()}<div class="mise${recap ? " avec-recap" : ""}"><div class="principal">${contexte ? `<p class="contexte">${contexte}</p>` : ""}${sousOnglets}${filtres}<div class="boite"><table class="suivi">
    <thead>${close ? `<tr><th>Établissement · site</th><th>Contenu ${esc(camp.Annee)}</th><th>Statut ${esc(camp.Annee)}</th><th>Actions</th></tr>`
      : `<tr><th>Établissement · site</th><th>État ${esc(anCours)}</th><th>Changements depuis ${esc(String((parseInt(camp.Annee, 10) || 1) - 1))}</th><th>Dernier échange</th><th>Actions</th></tr>`}</thead>
    <tbody>${corps || `<tr><td colspan="${close ? 4 : 5}" class="etat">Aucune fiche pour ces filtres.</td></tr>`}</tbody></table></div></div>${recap}</div>`;
}

const ICONE_PDF = `<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"><path d="M6 2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#EB4A50"/><path d="M14.5 2v5.5H20" fill="#F9C2C4"/><text x="12" y="17.6" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="6.6" fill="#fff">PDF</text></svg>`;
const BOUTON_PDF = (f, an) => `<button class="ico-pdf" data-pdf="${f.id}" title="Télécharger la fiche${an ? " " + an : ""} en PDF" aria-label="Télécharger la fiche${an ? " " + an : ""} en PDF">${ICONE_PDF}</button>`;

// GRETA : le PDF de communication fourni par l'établissement, tel quel (jamais remis en page ni retouché)
async function pdfOriginal(f) {
  for (let x = f; x; x = D.fiches.find(y => y.id === x.Fiche_precedente)) {
    const doc = (await chargerDocuments([x])).get(x.id);
    if (doc) return { octets: new Uint8Array(doc.octets), annee: CAMP_DE(x) };
  }
  return null;
}
const nomFichier = f => String(f.Etablissement || "fiche").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
async function pdfGreta(f, voir) {
  try {
    const o = await pdfOriginal(f);
    if (!o) { const err = DOC_ERREURS.get(f.id); MSG = { cl: "err", txt: `Aucun PDF lisible pour ${f.Etablissement}${err ? " : " + err : ""}. Déposez-le avec « Déposer le PDF ».` }; return afficher(); }
    const nom = `${nomFichier(f)}-${o.annee}.pdf`;
    if (voir) afficherOctets(o.octets, `${f.Etablissement} · PDF ${o.annee} fourni par l'établissement`, nom);
    else enregistrerOctets(o.octets, nom);
  } catch (err) { MSG = { cl: "err", txt: "PDF illisible : " + (err && err.message ? err.message : err) }; afficher(); }
}

// Export PDF d'une fiche (même mise en page que dans le catalogue) ; GRETA : document fourni, tel quel
async function exporterPdf(f) {
  if (horsDep(nomDep(f))) return pdfGreta(f, false);
  try {
    await chargerPdf();
    const an = CAMP_DE(f);
    const opts = { seul: true, style: "guide", annee: an, titre: `Catalogue Accompagnement apprentissage ${an} - ${f.Etablissement || ""}`, pages: [], groupes: [[nomDep(f), [f]]] };
    const doc = genererPdf(opts, D);
    await telechargerPdf(doc, opts, `fiche-${nomFichier(f)}-${an}.pdf`);
  } catch (err) { MSG = { cl: "err", txt: "Export PDF impossible : " + (err && err.message ? err.message : err) }; afficher(); }
}

// Dépôt du PDF reçu d'un GRETA : enregistré dans la fiche (colonne PDF_depose, créée au besoin), fiche « reçue »
async function deposerPdf(id, fic) {
  if (fic.size > 4e6) { MSG = { cl: "err", txt: "PDF trop lourd (4 Mo maximum) : demandez une version allégée." }; return afficher(); }
  const data = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(fic); });
  const f = D.fiches.find(x => x.id === id);
  const champs = recue(f) ? { PDF_depose: data } : { PDF_depose: data, Soumise_le: maintenant() };
  if (!DANS_GRIST) { Object.assign(f, champs); MSG = { cl: "ok", txt: `Démonstration : PDF de ${f.Etablissement} déposé.` }; return afficher(); }
  const a = [];
  if (!("PDF_depose" in f)) a.push(["AddColumn", "Fiches", "PDF_depose", { type: "Any", isFormula: false, label: "PDF_depose" }]);
  a.push(["UpdateRecord", "Fiches", id, champs]);
  await appliquer(a, `PDF ${CAMP_DE(f)} de ${f.Etablissement} déposé${champs.Soumise_le ? " : la fiche est reçue" : ""}.`);
}

// Chevron de début de ligne : déplie changements, échanges et prochaine action (remplace l'ancien bouton « Détails »)
const pli = s => s ? `<button class="pli-ligne" data-ouvrir="${s.id}" aria-expanded="${OUVERTE === s.id}" title="${OUVERTE === s.id ? "Replier" : "Déplier : changements et échanges"}" aria-label="${OUVERTE === s.id ? "Replier" : "Déplier"} le suivi de ${esc(s.Etablissement)}"><span class="chevron" aria-hidden="true"></span></button>` : `<span class="pli-vide"></span>`;
const celluleNom = (f, s, titre) => `<div class="nom-ligne">${pli(s)}<div><button class="lien-fiche" ${horsDep(nomDep(f)) ? `data-voir-pdf="${f.id}" title="Voir le PDF fourni par l'établissement"` : `data-voir="${f.id}" title="${titre}"`}>${esc(f.Etablissement)}</button><span class="sous">${esc(f.Site || "")}</span></div></div>`;

// f : fiche affichée (nom cliquable) ; s : fiche de la campagne en cours (étape, changements, actions) ; close : onglet des campagnes closes
function ligneClose(f, s) {
  const nom = celluleNom(f, s, "Consulter la fiche (lecture seule)");
  const nb = t => D[t].filter(r => r.Fiche === f.id && r.Statut !== "Fermée").length;
  const statut = recue(f) ? "Reçue" : `<span class="sous">non reçue</span>`;
  if (horsDep(nomDep(f))) {
    const depot = `<label class="mini depot-pdf" title="Déposer le PDF ${esc(CAMP_DE(f))} fourni par l'établissement, sans retouche">${pdfDepose(f) ? "Remplacer le PDF" : "Déposer le PDF"}<input type="file" accept="application/pdf" data-depot-pdf="${f.id}" hidden></label>`;
    return `<tr${VUE === f.id ? ' class="selection"' : ""}><td>${nom}</td><td>PDF fourni par l'établissement</td><td>${statut}</td><td><div class="boutons">${BOUTON_PDF(f)}${depot}</div></td></tr>`;
  }
  const actions = `<div class="boutons">${BOUTON_PDF(f)}</div>`;
  return `<tr${VUE === f.id ? ' class="selection"' : ""}><td>${nom}</td><td>${pluriel(nb("formations"), "formation")} · ${pluriel(nb("contacts"), "contact")}</td><td>${statut}</td><td>${actions}</td></tr>`;
}

function ligne(f, s, close) {
  if (close) return ligneClose(f, s);
  const nom = celluleNom(f, s, "Ouvrir la fiche dans le formulaire");
  const sel = VUE === f.id || (s && VUE === s.id) ? ' class="selection"' : "";
  if (!s) return `<tr${sel}><td>${nom}</td><td colspan="3"><span class="sous">pas de fiche dans la campagne en cours</span></td>
    <td><div class="boutons">${BOUTON_PDF(f)}</div></td></tr>`;
  const e = etape(s);
  const pdfFourni = horsDep(nomDep(s)); // GRETA : fiche fournie en PDF
  const dateEtat = e === 2 ? (s.Soumise_le || s.Finalisee_le) : e === 1 ? s.Lien_envoye_le : null;
  const etat = `<span class="etat-fiche e${e}${enRetard(s) ? " retard" : ""}">${esc(libEtape(e))}${dateEtat ? " · " + dateFr(dateEtat) : ""}</span>${enRetard(s) ? `<span class="sous retard">sans réponse depuis plus de 7 jours</span>` : ""}${e < 2 && !destinataires(s).length ? `<span class="sous retard" title="Ni l'établissement ni ses contacts n'ont d'adresse mail">aucune adresse mail</span>` : ""}${(() => { if (pdfFourni || !window.contactAVerifier) return ""; const n = D.contacts.filter(c => c.Fiche === s.id && window.contactAVerifier(c)).length; return n ? `<span class="sous a-verif" title="Contacts repris du catalogue 2026 qui semblent mal lus : à faire vérifier par l'établissement">${pluriel(n, "contact")} à vérifier</span>` : ""; })()}`;
  const ch = changements(s);
  // GRETA : la fiche est un PDF ; « reçue » = PDF de l'année déposé (bouton « Déposer le PDF »)
  const nbCh = pdfFourni ? (e === 2 ? `<span class="pill p-ok">PDF ${esc(CAMP_DE(s))} déposé</span>` : `<span class="sous">PDF de l'an dernier</span>`)
    : ch === null ? `<span class="sous">pas de fiche l'an dernier</span>` : !ch.length ? `<span class="sous vide" title="Aucun changement">—</span>`
    : `<button class="lien-fiche" data-ouvrir="${s.id}" data-vers="changements">${ch.length} changement${ch.length > 1 ? "s" : ""}</button>`;
  const der = echanges(s)[0];
  const derBrut = der ? `${esc(der.Type)} · ${dateFr(der.Date)}` : s.Soumise_le ? `Reçue · ${dateFr(s.Soumise_le)}` : s.Lien_envoye_le ? `Lien envoyé · ${dateFr(s.Lien_envoye_le)}` : "";
  const derTxt = `<button class="lien-fiche lien-doux" data-ouvrir="${s.id}" data-vers="echanges" title="Voir les échanges et en noter un">${derBrut || `<span class="ajout-ech">+ Noter un échange</span>`}</button>`;
  let actions = "";
  if (!close) {
    if (pdfFourni) { // GRETA : on demande le PDF, puis on le dépose tel qu'il est reçu
      if (e === 0) actions += `<button class="mini contour" data-envoyer="${s.id}">Demander le PDF</button>`;
      if (e === 1) actions += `<button class="mini${enRetard(s) ? " prim" : ""}" data-relancer="${s.id}">Relancer</button>`;
      actions += `<label class="mini${e === 1 ? " prim" : ""} depot-pdf" title="Déposer le PDF reçu de l'établissement, sans retouche">${e === 2 ? "Remplacer le PDF" : "Déposer le PDF reçu"}<input type="file" accept="application/pdf" data-depot-pdf="${s.id}" hidden></label>`;
    } else {
      if (e === 0) actions += `<button class="mini contour" data-envoyer="${s.id}">Envoyer</button>`;
      if (e === 1) actions += `<button class="mini${enRetard(s) ? " prim" : ""}" data-relancer="${s.id}">Relancer</button>`;
    }
  }
  actions = `<div class="boutons">${BOUTON_PDF(f, esc(CAMP_DE(f)))}${actions}</div>`;
  return `<tr${sel}><td>${nom}</td>
    <td>${etat}${s.Prochaine_action ? `<span class="sous">→ ${esc(s.Prochaine_action)}</span>` : ""}</td>
    <td>${nbCh}</td><td>${derTxt}</td><td>${actions}</td></tr>`;
}

function detail(f, lecture) { // lecture : vue des campagnes closes (comparaison seule)
  const e = etape(f);
  const ch = changements(f);
  const diffs = horsDep(nomDep(f)) ? `<p class="etat">Fiche fournie en PDF par l'établissement : elle est reprise telle quelle dans le catalogue, sans comparaison champ par champ. <button class="lien-fiche" data-voir-pdf="${f.id}">Voir le PDF</button></p>`
    : ch === null ? `<p class="etat">Pas de fiche l'an dernier : rien à comparer.</p>`
    : ch.length ? ch.map(d => `<div class="diff"><span class="pill">${esc(d.type)}</span><span>${esc(d.lib)} :</span>${d.avant ? `<span class="avant">${esc(d.avant)}</span>` : ""}${d.avant && d.apres ? "→" : ""}${d.apres ? `<span class="apres">${esc(d.apres)}</span>` : ""}</div>`).join("")
    : `<p class="etat">Aucun changement par rapport à l'an dernier.</p>`;
  const ech = echanges(f).map(x => `<div class="ech"><b>${dateFr(x.Date)} · ${esc(x.Type)}</b> — ${esc(x.Objet || "")}<span class="sous">${esc(x.Resume || "")}</span></div>`).join("") || `<p class="etat">Aucun échange enregistré.</p>`;
  if (lecture) return `<section id="sec-echanges"><h2>Correspondances ${esc(String(CAMP_DE(f)))}</h2>${ech}</section>`;
  return `<div class="grille-detail">
    <section id="sec-changements"><h2>${horsDep(nomDep(f)) ? "Document" : "Changements par rapport à l'an dernier"}</h2>${diffs}
      <label class="champ">Prochaine action<input data-prochaine="${f.id}" value="${esc(f.Prochaine_action || "")}" placeholder="Ex. : relancer le 20/01"></label></section>
    <section id="sec-echanges"><h2>Correspondances</h2>${ech}
      <div class="form-ech">
        <label class="champ">Date<input type="date" id="eDate" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="champ">Type<select id="eType"><option>Mail envoyé</option><option>Mail reçu</option><option>Appel</option><option>Note</option></select></label>
        <label class="champ plein">Objet<input id="eObjet"></label>
        <label class="champ plein">Résumé<textarea id="eResume" rows="2"></textarea></label>
        <button class="btn sec plein" data-ajout-ech="${f.id}">Enregistrer l'échange</button></div></section></div>`;
}

// ---------- Mails (préparés dans la messagerie, jamais envoyés automatiquement) ----------
function lienFiche(f) { return (CAMP.URL_formulaire || "") + (String(CAMP.URL_formulaire || "").includes("?") ? "&" : "?") + "Code_=" + encodeURIComponent(f.Code || ""); }
// Destinataires : le mail de l'établissement, à défaut ceux de ses contacts (jamais affichés ici, seulement mis dans le mail)
function destinataires(f) {
  if (String(f.Mail || "").trim()) return [String(f.Mail).trim()];
  return [...new Set(D.contacts.filter(c => c.Fiche === f.id).flatMap(c => String(c.Mail || "").split("/")).map(m => m.trim()).filter(m => m.includes("@")))];
}
function mail(f, relance) {
  const an = CAMP.Annee, lim = CAMP.Date_limite ? new Date(CAMP.Date_limite * 1000).toLocaleDateString("fr-FR") : "";
  const objet = `${relance ? "Relance - " : ""}Catalogue Accompagnement apprentissage ${an} - mise à jour de votre fiche - ${f.Etablissement || ""}`;
  const pdfFourni = horsDep(nomDep(f)); // GRETA : fiche fournie en PDF, pas de formulaire
  const corps = pdfFourni ? [
    "Madame, Monsieur,", "",
    relance ? `Sauf erreur de notre part, nous n'avons pas encore reçu la mise à jour de votre fiche pour le catalogue ${an}.`
            : `Nous préparons l'édition ${an} du catalogue Accompagnement apprentissage. Comme l'an dernier, votre fiche figure dans le catalogue sous la forme du document PDF que vous nous transmettez.`,
    "", `Merci de nous renvoyer en réponse à ce mail la version ${an} de ce document (format PDF, A4)${lim ? `, avant le ${lim}` : ""}. Si rien n'a changé, il suffit de nous le confirmer.`,
    "", "Cordialement,", "Le SAIO",
  ].join("\n") : [
    "Madame, Monsieur,", "",
    relance ? `Sauf erreur de notre part, nous n'avons pas encore reçu la mise à jour de votre fiche pour le catalogue ${an}.`
            : `Nous préparons l'édition ${an} du catalogue Accompagnement apprentissage. Votre fiche de l'an dernier est déjà remplie dans le formulaire ci-dessous : il suffit de corriger ce qui a changé (formations, contacts, coordonnées, accompagnement) puis de l'envoyer.`,
    "", "Merci de vérifier en particulier vos contacts (noms, fonctions, téléphones et mails) : ceux qui portent la mention « À vérifier » ont pu être mal repris du catalogue de l'an dernier.",
    "", "Votre fiche : " + lienFiche(f), "",
    lim ? `Merci de nous la retourner avant le ${lim}. Si rien n'a changé, vous pouvez l'envoyer telle quelle.` : "Si rien n'a changé, vous pouvez l'envoyer telle quelle.",
    "Ce lien est personnel : merci de ne pas le diffuser.", "", "Cordialement,", "Le SAIO",
  ].join("\n");
  return `mailto:${destinataires(f).map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
}

// ---------- Nouvelle campagne ----------
// Recopie les fiches dans une nouvelle campagne (inactive tant qu'on ne l'active pas) :
// nouveaux codes, lien vers la fiche d'origine (pour la comparaison), formations fermées non reprises.
const SUIVI = ["Code", "Campagne", "Fiche_precedente", "Lien_envoye_le", "Ouverte_le", "Soumise_le", "Finalisee_le", "Prochaine_action", "PDF_depose", "Document_fourni", "Code_actif"];
let COLONNES = null; // colonnes de données (hors formules) par table, lues dans les métadonnées

async function colonnesDonnees() {
  if (COLONNES) return COLONNES;
  const t = lignes(await grist.docApi.fetchTable("_grist_Tables")), c = lignes(await grist.docApi.fetchTable("_grist_Tables_column"));
  COLONNES = {};
  for (const tab of t) COLONNES[tab.tableId] = c.filter(x => x.parentId === tab.id && !x.isFormula && !x.colId.startsWith("gristHelper") && x.colId !== "manualSort").map(x => x.colId);
  return COLONNES;
}

function sources(campSource) {
  // la fiche si elle a été reçue, sinon sa dernière version reçue (à défaut, la version actuelle)
  const res = [];
  for (const f of D.fiches.filter(x => x.Campagne === campSource.id)) {
    if (recue(f)) { res.push(f); continue; }
    let p = D.fiches.find(x => x.id === f.Fiche_precedente);
    while (p && !recue(p)) p = D.fiches.find(x => x.id === p.Fiche_precedente);
    res.push(p || f);
  }
  return res;
}

function panneau() {
  if (PANNEAU !== "nouvelle") return "";
  const src = CAMP, an = String((parseInt(src.Annee, 10) || new Date().getFullYear()) + 1);
  const nbF = D.fiches.filter(f => f.Campagne === src.id).length, nbFin = D.fiches.filter(f => f.Campagne === src.id && recue(f)).length;
  return `<section class="carte" style="margin-bottom:16px"><h2>Préparer une nouvelle campagne à partir de ${esc(src.Annee)}</h2>
    <div class="form-ech">
      <label class="champ">Année<input id="nAnnee" value="${esc(an)}"></label>
      <label class="champ">Date limite de retour<input type="date" id="nLimite"></label></div>
    <p class="etat">${pluriel(nbF, "fiche")} dans la campagne ${esc(src.Annee)}, dont ${nbFin} reçue${nbFin > 1 ? "s" : ""}. Chaque fiche est reprise dans sa dernière version reçue ;
      les formations « Fermée » ne sont pas reprises, les « Nouvelle » deviennent « Maintenue ».</p>
    <p class="bandeau err" style="font-size:15px">La nouvelle campagne devient aussitôt la campagne en cours : la campagne ${esc(src.Annee)} est close
      et ses liens cessent de fonctionner pour les établissements.</p>
    <div class="boutons"><button class="btn" id="creerCampagne">Créer et lancer la campagne</button><button class="btn sec" data-panneau="">Annuler</button></div></section>`;
}

async function creerCampagne() {
  const annee = document.getElementById("nAnnee").value.trim();
  const lim = document.getElementById("nLimite").value;
  if (!annee) { MSG = { cl: "err", txt: "Indiquez l'année de la campagne." }; return afficher(); }
  if (D.campagnes.some(c => String(c.Annee).trim() === annee)) { MSG = { cl: "err", txt: `La campagne ${annee} existe déjà.` }; return afficher(); }
  const src = sources(CAMP);
  if (!DANS_GRIST) { MSG = { cl: "ok", txt: `Démonstration : la campagne ${annee} serait créée avec ${pluriel(src.length, "fiche")}.` }; PANNEAU = null; return afficher(); }
  try {
    const cols = await colonnesDonnees();
    const garder = (table, r, exclure) => { const o = {}; for (const c of cols[table] || []) if (!exclure.includes(c) && c in r) o[c] = r[c]; return o; };
    const [campId] = (await grist.docApi.applyUserActions([["AddRecord", "Campagnes", null, {
      Annee: annee, Active: false, Date_limite: lim ? Date.parse(lim) / 1000 : null, URL_formulaire: CAMP.URL_formulaire || "" }]])).retValues;
    const nouvelles = src.map(f => ({ ...garder("Fiches", f, SUIVI), Code: crypto.randomUUID(), Campagne: campId, Fiche_precedente: f.id }));
    const ids = nouvelles.length ? (await grist.docApi.applyUserActions([bulk("Fiches", nouvelles)])).retValues[0] : [];
    const corresp = new Map(src.map((f, i) => [f.id, ids[i]]));
    const enfants = [];
    for (const [table, cle] of [["Formations", "formations"], ["Contacts", "contacts"], ["Accompagnement", "accomp"]]) {
      const rows = [];
      for (const r of D[cle]) {
        if (!corresp.has(r.Fiche)) continue;
        if (table === "Formations" && r.Statut === "Fermée") continue;
        const o = { ...garder(table, r, ["Fiche"]), Fiche: corresp.get(r.Fiche) };
        if (table === "Formations" && o.Statut === "Nouvelle") o.Statut = "Maintenue";
        rows.push(o);
      }
      if (rows.length) enfants.push(bulk(table, rows));
    }
    if (enfants.length) await grist.docApi.applyUserActions(enfants);
    await grist.docApi.applyUserActions([...D.campagnes, { id: campId }].map(c => ["UpdateRecord", "Campagnes", c.id, { Active: c.id === campId }]));
    PANNEAU = null;
    MSG = { cl: "ok", txt: `Campagne ${annee} créée et lancée : ${pluriel(ids.length, "fiche")} reprise${ids.length > 1 ? "s" : ""}. La campagne précédente est close.` };
    CAMP = { id: campId };
    await charger();
  } catch (err) { MSG = { cl: "err", txt: "Création interrompue : " + (err && err.message ? err.message : err) }; afficher(); }
}

function bulk(table, rows) {
  const cols = [...new Set(rows.flatMap(Object.keys))], o = {};
  for (const c of cols) o[c] = rows.map(r => (c in r ? r[c] : null));
  return ["BulkAddRecord", table, rows.map(() => null), o];
}

async function appliquer(actions, txt) {
  if (!DANS_GRIST) { MSG = { cl: "ok", txt: "Démonstration : " + txt }; return afficher(); }
  try { await grist.docApi.applyUserActions(actions); MSG = { cl: "ok", txt }; await charger(); }
  catch (err) { MSG = { cl: "err", txt: "Refusé : " + (err && err.message ? err.message : err) }; afficher(); }
}

async function envoyer(f, relance) {
  if (!horsDep(nomDep(f)) && !CAMP.URL_formulaire) { MSG = { cl: "err", txt: "Renseignez l'adresse du formulaire (colonne URL_formulaire de la campagne)." }; return afficher(); }
  if (!horsDep(nomDep(f)) && !f.Code) { MSG = { cl: "err", txt: "Cette fiche n'a pas de code : impossible de créer son lien." }; return afficher(); }
  window.open(mail(f, relance), "_blank");
  const dest = destinataires(f);
  const auj = Math.floor(Date.now() / 86400000) * 86400;
  const a = [["AddRecord", "Correspondances", null, { Fiche: f.id, Date: auj, Type: "Mail envoyé", Objet: relance ? "Relance" : "Envoi du lien du formulaire" }]];
  if (!relance) a.push(["UpdateRecord", "Fiches", f.id, { Lien_envoye_le: maintenant() }]);
  await appliquer(a, dest.length ? `Mail préparé pour ${f.Etablissement}${String(f.Mail || "").trim() ? "" : ` (adressé ${dest.length > 1 ? `aux ${dest.length} adresses des contacts` : "à l'adresse du contact"} de la fiche, faute de mail de l'établissement)`} : vérifiez-le et envoyez-le depuis votre messagerie.`
    : `Mail préparé pour ${f.Etablissement}, SANS destinataire : la fiche n'a aucune adresse mail. Ajoutez le destinataire dans votre messagerie avant d'envoyer.`);
}

// ---------- Interactions ----------
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.depotPdf && el.files && el.files[0]) return deposerPdf(+el.dataset.depotPdf, el.files[0]);
  if (el.id === "choixArchive") { ARCH = D.campagnes.find(c => c.id === +el.value); choisirCampagne(); OUVERTE = null; MSG = null; return afficher(); }
  if (el.id === "fEtape") { FILTRE.etape = el.value; return afficher(); }
  if (el.dataset.prochaine) return appliquer([["UpdateRecord", "Fiches", +el.dataset.prochaine, { Prochaine_action: el.value }]], "Prochaine action enregistrée.");
});
app.addEventListener("input", e => {
  if (e.target.id === "fTexte") { FILTRE.texte = e.target.value; const pos = e.target.selectionStart; afficher(); const x = document.getElementById("fTexte"); x.focus(); x.setSelectionRange(pos, pos); }
});
document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = b.dataset, fiche = id => D.fiches.find(f => f.id === +id);
  if (d.retard) { FILTRE.retard = !FILTRE.retard; return afficher(); }
  if (d.recap !== undefined) {
    const k = d.recap, deja = b.getAttribute("aria-pressed") === "true" && k !== "";
    FILTRE.etape = ""; FILTRE.ch = false; FILTRE.retard = false;
    if (!deja) { if (k === "ch") FILTRE.ch = true; else if (k === "retard") FILTRE.retard = true; else FILTRE.etape = k; }
    return afficher();
  }
  if (d.avecCh) { FILTRE.ch = !FILTRE.ch; return afficher(); }
  if (d.replier !== undefined) { REPLIES.has(d.replier) ? REPLIES.delete(d.replier) : REPLIES.add(d.replier); return afficher(); }
  if (d.toutDep) { REPLIES = d.toutDep === "replier" ? new Set(D.fiches.map(f => f.Departement || "Sans département")) : new Set(); return afficher(); }
  if (d.dep !== undefined) { FILTRE.dep = d.dep; OUVERTE = null; return afficher(); }
  if (d.onglet) { ONGLET = d.onglet; choisirCampagne(); OUVERTE = null; VUE = null; MSG = null; PANNEAU = null; FILTRE.etape = ""; FILTRE.retard = false; FILTRE.ch = false; FILTRE.dep = ""; if (!tiroir.hidden && !window.FormulaireFiche.modifie()) tiroir.hidden = true; return afficher(); }
  if (d.voir) { VUE = +d.voir; ouvrirTiroir(VUE); return afficher(); }
  if (d.fermerTiroir !== undefined) return fermerTiroir(false);
  if (d.fermerQuandMeme !== undefined) return fermerTiroir(true);
  if (d.resterTiroir !== undefined) { document.getElementById("tAlerte").innerHTML = ""; return; }
  if (d.pdf) return exporterPdf(fiche(d.pdf));
  if (d.voirPdf) return pdfGreta(fiche(d.voirPdf), true);
  if (d.ouvrir) {
    OUVERTE = d.vers ? +d.ouvrir : OUVERTE === +d.ouvrir ? null : +d.ouvrir; MSG = null; afficher();
    const cible = d.vers && document.getElementById("sec-" + d.vers);
    if (cible) { cible.scrollIntoView({ block: "nearest", behavior: "smooth" }); if (d.vers === "echanges") document.getElementById("eObjet")?.focus({ preventScroll: true }); }
    return;
  }
  if (d.envoyer) return envoyer(fiche(d.envoyer), false);
  if (d.relancer) return envoyer(fiche(d.relancer), true);
  if (d.panneau !== undefined) { PANNEAU = d.panneau || null; MSG = null; return afficher(); }
  if (b.id === "creerCampagne") { b.disabled = true; b.textContent = "Création en cours…"; return creerCampagne(); }
  if (d.activer) {
    PANNEAU = null;
    return appliquer(D.campagnes.map(c => ["UpdateRecord", "Campagnes", c.id, { Active: c.id === +d.activer }]), "Campagne activée : les liens des autres campagnes ne fonctionnent plus.");
  }
  if (d.ajoutEch) {
    const v = id => (document.getElementById(id).value || "").trim();
    const date = v("eDate") ? Date.parse(v("eDate")) / 1000 : null;
    if (!v("eObjet") && !v("eResume")) { MSG = { cl: "err", txt: "Indiquez au moins un objet ou un résumé." }; return afficher(); }
    const a = [["AddRecord", "Correspondances", null, { Fiche: +d.ajoutEch, Date: date, Type: v("eType"), Objet: v("eObjet"), Resume: v("eResume") }]];
    const f = fiche(d.ajoutEch);
    const marque = v("eType") === "Mail envoyé" && f && etape(f) === 0;
    if (marque) a.push(["UpdateRecord", "Fiches", f.id, { Lien_envoye_le: date || maintenant() }]);
    return appliquer(a, marque ? "Échange enregistré : la fiche est marquée « Envoyée, en attente »." : "Échange enregistré.");
  }
});

// ---------- Panneau latéral (fiche ouverte par-dessus le tableau) ----------
const tiroir = document.getElementById("tiroir");
function ouvrirTiroir(id) {
  document.getElementById("tAlerte").innerHTML = "";
  tiroir.hidden = false;
  document.getElementById("tCorps").scrollTop = 0;
  window.FormulaireFiche.ouvrir(id);
}
function fermerTiroir(force) {
  if (tiroir.hidden) return;
  if (!force && window.FormulaireFiche.modifie()) {
    document.getElementById("tAlerte").innerHTML = `<div class="bandeau err tiroir-alerte">Des modifications ne sont pas enregistrées.
      <span class="boutons"><button class="mini" data-rester-tiroir>Continuer la saisie</button><button class="mini" data-fermer-quand-meme>Fermer sans enregistrer</button></span></div>`;
    return;
  }
  tiroir.hidden = true; VUE = null; afficher();
}
document.addEventListener("keydown", e => { if (e.key === "Escape") fermerTiroir(false); });

if (DANS_GRIST) {
  grist.ready({ requiredAccess: "full" });
  grist.onRecords(() => {
    charger();
    if (!tiroir.hidden) window.FormulaireFiche.rafraichir();
    if (ONGLET === "catalogue") window.CatalogueOnglet.rafraichir();
  });
}
charger();
