// Tableau de suivi des fiches CFA (widget Grist réservé au SAIO).
// Une ligne par fiche de la campagne choisie : étapes, changements par rapport à l'an dernier,
// correspondances, prochaine action. Le bouton « Envoyer » prépare le mail dans la messagerie
// (lien personnel vers le formulaire) puis coche l'étape ; rien n'est envoyé automatiquement.
// Hors de Grist, la page s'affiche avec des données fictives (démonstration).
"use strict";

const DANS_GRIST = window.parent !== window;
const ETAPES = ["Lien envoyé", "Ouverte", "Soumise", "En discussion", "Finalisée"];
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
const norm = s => String(s ?? "").trim().toLowerCase();
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
  if (f.Finalisee_le) return 5;
  if (f.Soumise_le && enDiscussion(f)) return 4;
  if (f.Soumise_le) return 3;
  if (f.Ouverte_le) return 2;
  if (f.Lien_envoye_le) return 1;
  return 0;
}
const libEtape = n => n === 0 ? "À envoyer" : n === 3 ? "Soumise, à vérifier" : ETAPES[n - 1];
// Discussion : un mail ou un appel enregistré le jour de la soumission ou après (les notes du SAIO ne comptent pas)
function enDiscussion(f) {
  const jour = Math.floor((f.Soumise_le || 0) / 86400) * 86400;
  return echanges(f).some(c => c.Type !== "Note" && (c.Date || 0) >= jour);
}

function changements(f) {
  const prec = D.fiches.find(x => x.id === f.Fiche_precedente);
  if (!prec) return null;
  const out = [];
  for (const [c, lib] of CHAMPS) if (c in f && norm(f[c]) !== norm(prec[c])) out.push({ type: "Coordonnées", lib, avant: prec[c], apres: f[c] });
  const de = (t, id) => D[t].filter(r => r.Fiche === id);
  const fo0 = de("formations", prec.id), fo1 = de("formations", f.id);
  for (const n of fo1) {
    const o = fo0.find(x => norm(x.Intitule) === norm(n.Intitule));
    if (!o) out.push({ type: "Formation", lib: "Nouvelle", apres: n.Intitule });
    else if (n.Statut === "Fermée" && o.Statut !== "Fermée") out.push({ type: "Formation", lib: "Fermée", avant: n.Intitule });
    else if (norm(n.Remarque) !== norm(o.Remarque)) out.push({ type: "Formation", lib: "Remarque · " + n.Intitule, avant: o.Remarque, apres: n.Remarque });
  }
  for (const o of fo0) if (!fo1.find(x => norm(x.Intitule) === norm(o.Intitule))) out.push({ type: "Formation", lib: "Retirée", avant: o.Intitule });
  const co0 = de("contacts", prec.id), co1 = de("contacts", f.id);
  // contacts rapprochés par nom, sinon par pôle / fonction
  const cle = c => norm(c.Nom) || norm(c.Fonction);
  const pareil = (a, b) => (norm(a.Nom) && norm(a.Nom) === norm(b.Nom)) || (!norm(a.Nom) && cle(a) === cle(b));
  const etiq = c => c.Fonction || "";
  for (const n of co1) {
    const o = co0.find(x => pareil(x, n));
    if (!o) { out.push({ type: "Contact", lib: "Nouveau · " + etiq(n), apres: n.Nom }); continue; }
    for (const [c, lib] of [["Nom", "Nom"], ["Fonction", "Fonction"], ["Telephone", "Téléphone"], ["Mail", "Mail"]])
      if (norm(n[c]) !== norm(o[c])) out.push({ type: "Contact", lib: lib + " · " + etiq(n), avant: o[c], apres: n[c] });
  }
  for (const o of co0) if (!co1.find(x => pareil(o, x))) out.push({ type: "Contact", lib: "Retiré · " + etiq(o), avant: o.Nom });
  const ac0 = de("accomp", prec.id), ac1 = de("accomp", f.id);
  for (const n of ac1) {
    const o = ac0.find(x => norm(x.Action) === norm(n.Action));
    if (!o) out.push({ type: "Accompagnement", lib: "Nouvelle action", apres: n.Action });
    else if (!!o.Cochee !== !!n.Cochee) out.push({ type: "Accompagnement", lib: n.Cochee ? "Cochée" : "Décochée", apres: n.Action });
  }
  for (const o of ac0) if (!ac1.find(x => norm(x.Action) === norm(o.Action))) out.push({ type: "Accompagnement", lib: "Retirée", avant: o.Action });
  return out;
}

const echanges = f => D.corresp.filter(c => c.Fiche === f.id).sort((a, b) => (b.Date || 0) - (a.Date || 0));
function derniereActivite(f) {
  return Math.max(f.Lien_envoye_le || 0, f.Ouverte_le || 0, f.Soumise_le || 0, ...echanges(f).map(e => e.Date || 0));
}
function enRetard(f) { // lien envoyé, pas soumise, rien depuis 7 jours
  const e = etape(f);
  return (e === 1 || e === 2) && maintenant() - derniereActivite(f) > 7 * JOUR;
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
      ${ONGLET === "closes" && closes.length > 1 ? `<select id="choixArchive" aria-label="Campagne close" style="width:auto;margin-left:auto">${closes.map(c => `<option value="${c.id}"${ARCH && c.id === ARCH.id ? " selected" : ""}>${esc(c.Annee)}</option>`).join("")}</select>` : ""}</div>`;
  document.getElementById("actionsCampagne").innerHTML = `<button class="mini" data-panneau="nouvelle" style="visibility:${ONGLET === "encours" ? "visible" : "hidden"}">Préparer une nouvelle campagne</button>`;
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
  const et = l => (l.s ? etape(l.s) : -1), chg = l => (l.s ? (changements(l.s) || []).length : 0);
  const depDe = l => l.f.Departement || "Sans département";
  const dansDep = () => lignes.filter(l => !FILTRE.dep || depDe(l) === FILTRE.dep);
  const n = v => dansDep().filter(l => { const e = et(l); const [a, b] = v.split("-").map(Number); return e >= a && e <= (b ?? a); }).length;
  const ETATS = [["", "Toutes les étapes"], ["0", "À envoyer"], ["1-2", "Envoyées, en attente"], ["3", "Soumises, à vérifier"], ["4", "En discussion"], ["5", "Finalisées"]];
  const nbRetard = () => dansDep().filter(l => l.s && enRetard(l.s)).length, nbChg = () => dansDep().filter(l => chg(l)).length;
  const deps = [...new Set(lignes.map(l => l.f.Departement || "Sans département"))].sort((a, b) => (a === TOUS ? -1 : b === TOUS ? 1 : a.localeCompare(b, "fr")));
  if (FILTRE.dep && !deps.includes(FILTRE.dep)) FILTRE.dep = "";
  const nbDep = d => lignes.filter(l => (l.f.Departement || "Sans département") === d).length;
  const sousOnglets = `<div class="sous-onglets" role="tablist" aria-label="Départements">
    <button role="tab" data-dep="" aria-selected="${!FILTRE.dep}">Toutes les fiches <span>${lignes.length}</span></button>
    ${deps.map(d => `<button role="tab" data-dep="${esc(d)}" aria-selected="${FILTRE.dep === d}">${esc(d)} <span>${nbDep(d)}</span></button>`).join("")}</div>`;
  const filtres = `<div class="filtres">
    ${close ? "" : `<select id="fEtape" aria-label="Étape">${ETATS.map(([v, lib]) => `<option value="${v}"${FILTRE.etape === v ? " selected" : ""}>${lib} (${v === "" ? dansDep().length : n(v)})</option>`).join("")}</select>`}
    <input id="fTexte" placeholder="Rechercher un établissement" aria-label="Rechercher" value="${esc(FILTRE.texte)}">
    <button class="puce-filtre" data-avec-ch="1" aria-pressed="${!!FILTRE.ch}">Avec changements · ${nbChg()}</button>
    ${close ? "" : `<button class="puce-filtre${nbRetard() ? " alerte-filtre" : ""}" data-retard="1" aria-pressed="${FILTRE.retard}">Sans réponse depuis 7 j · ${nbRetard()}</button>`}
    ${FILTRE.dep ? "" : `<span class="boutons" style="margin-left:auto"><button class="mini" data-tout-dep="ouvrir">Tout déplier</button><button class="mini" data-tout-dep="replier">Tout replier</button></span>`}</div>`;
  const garde = l => {
    const e = et(l);
    if (FILTRE.etape !== "") { const [a, b] = FILTRE.etape.split("-").map(Number); if (e < a || e > (b ?? a)) return false; }
    if (FILTRE.retard && !(l.s && enRetard(l.s))) return false;
    if (FILTRE.ch && !chg(l)) return false;
    if (FILTRE.dep && (l.f.Departement || "Sans département") !== FILTRE.dep) return false;
    if (FILTRE.texte && !norm(l.f.Etablissement + " " + l.f.Site).includes(norm(FILTRE.texte))) return false;
    return true;
  };
  const vis = lignes.filter(garde).sort((a, b) => String(a.f.Departement || "~").localeCompare(b.f.Departement || "~") || String(a.f.Etablissement).localeCompare(b.f.Etablissement, "fr", { numeric: true }));
  let corps = "", depCourant = null;
  for (const l of vis) {
    const dep = l.f.Departement || "Sans département";
    if (!FILTRE.dep && dep !== depCourant) {
      depCourant = dep;
      const ouvert = !REPLIES.has(dep);
      corps += `<tr class="dep"><td colspan="5"><button class="dep-pli" data-replier="${esc(dep)}" aria-expanded="${ouvert}"><span class="chevron" aria-hidden="true"></span>${esc(dep)} <span class="nb">${vis.filter(x => (x.f.Departement || "Sans département") === dep).length}</span></button></td></tr>`;
    }
    if (!FILTRE.dep && REPLIES.has(dep)) continue;
    corps += ligne(l.f, l.s, close);
    if (l.s && OUVERTE === l.s.id) corps += `<tr class="detail"><td colspan="5">${detail(l.s, close)}</td></tr>`;
  }
  const bandeau = MSG ? `<div class="bandeau ${MSG.cl}" role="status" style="margin-bottom:12px">${esc(MSG.txt)}</div>` : "";
  const contexte = close ? `Campagne ${esc(camp.Annee)} close, en consultation seule : chaque fiche est comparée à sa fiche ${esc(anCours)}.`
    : camp.Date_limite ? `Date limite de retour : ${esc(new Date(camp.Date_limite * 1000).toLocaleDateString("fr-FR"))}.` : "";
  app.innerHTML = `${bandeau}${panneau()}${contexte ? `<p class="contexte">${contexte}</p>` : ""}${sousOnglets}${filtres}<div class="boite"><table class="suivi">
    <thead>${close ? `<tr><th>Établissement · site</th><th>Contenu ${esc(camp.Annee)}</th><th>Statut ${esc(camp.Annee)}</th><th>Changements en ${esc(anCours)}</th><th>Actions</th></tr>`
      : `<tr><th>Établissement · site</th><th>Étape ${esc(anCours)}</th><th>Changements depuis ${esc(String((parseInt(camp.Annee, 10) || 1) - 1))}</th><th>Dernier échange</th><th>Actions</th></tr>`}</thead>
    <tbody>${corps || `<tr><td colspan="5" class="etat">Aucune fiche pour ces filtres.</td></tr>`}</tbody></table></div>`;
}

const ICONE_PDF = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M12 12v6"/><path d="m9 15 3 3 3-3"/></svg>`;

// Export PDF d'une fiche (même mise en page que dans le catalogue)
async function exporterPdf(f) {
  try {
    await chargerPdf();
    const an = CAMP_DE(f);
    const doc = genererPdf({ seul: true, titre: `Catalogue Accompagnement apprentissage ${an} - ${f.Etablissement || ""}`, pages: [], groupes: [[nomDep(f), [f]]] }, D);
    const nom = String(f.Etablissement || "fiche").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
    doc.save(`fiche-${nom}-${an}.pdf`);
  } catch (err) { MSG = { cl: "err", txt: "Export PDF impossible : " + (err && err.message ? err.message : err) }; afficher(); }
}

// f : fiche affichée (nom cliquable) ; s : fiche de la campagne en cours (étape, changements, actions) ; close : onglet des campagnes closes
function ligneClose(f, s) {
  const nom = `<button class="lien-fiche" data-voir="${f.id}" title="Consulter la fiche (lecture seule)">${esc(f.Etablissement)}</button><span class="sous">${esc(f.Site || "")}</span>`;
  const nb = t => D[t].filter(r => r.Fiche === f.id && r.Statut !== "Fermée").length;
  const ch = s ? changements(s) : null;
  const chg = !s ? `<span class="sous">pas de fiche en cours</span>` : !ch.length ? `<span class="sous">aucun</span>`
    : `<button class="lien-fiche" data-ouvrir="${s.id}">${ch.length} changement${ch.length > 1 ? "s" : ""}</button>`;
  const statut = f.Finalisee_le ? `Finalisée le ${esc(new Date(f.Finalisee_le * 1000).toLocaleDateString("fr-FR"))}` : `<span class="sous">non finalisée</span>`;
  const actions = `<div class="boutons">${s ? `<button class="mini" data-ouvrir="${s.id}" aria-expanded="${OUVERTE === s.id}">${OUVERTE === s.id ? "Fermer" : "Détails"}</button>` : ""}
    <button class="mini pdf" data-pdf="${f.id}" title="Télécharger la fiche en PDF">${ICONE_PDF}PDF</button></div>`;
  return `<tr${VUE === f.id ? ' class="selection"' : ""}><td>${nom}</td><td>${nb("formations")} formation(s) · ${nb("contacts")} contact(s)</td><td>${statut}</td><td>${chg}</td><td>${actions}</td></tr>`;
}

function ligne(f, s, close) {
  if (close) return ligneClose(f, s);
  const nom = `<button class="lien-fiche" data-voir="${f.id}" title="Ouvrir la fiche dans le formulaire">${esc(f.Etablissement)}</button><span class="sous">${esc(f.Site || "")}</span>`;
  const sel = VUE === f.id || (s && VUE === s.id) ? ' class="selection"' : "";
  if (!s) return `<tr${sel}><td>${nom}</td><td colspan="3"><span class="sous">pas de fiche dans la campagne en cours</span></td>
    <td><div class="boutons"><button class="mini pdf" data-pdf="${f.id}" title="Télécharger la fiche en PDF">${ICONE_PDF}PDF</button></div></td></tr>`;
  const e = etape(s);
  const dates = [s.Lien_envoye_le, s.Ouverte_le, s.Soumise_le, null, s.Finalisee_le];
  const barres = ETAPES.map((lib, i) => `<i class="${i < e ? "f" : i === e && e >= 3 && e < 5 ? "c" : ""}" title="${esc(lib)}${dates[i] ? " · " + dateFr(dates[i]) : ""}"></i>`).join("");
  const ch = changements(s);
  const nbCh = ch === null ? `<span class="sous">pas de fiche l'an dernier</span>` : !ch.length ? `<span class="sous">aucun</span>`
    : `<button class="lien-fiche" data-ouvrir="${s.id}">${ch.length} changement${ch.length > 1 ? "s" : ""}</button>`;
  const der = echanges(s)[0];
  const derTxt = der ? `${esc(der.Type)} · ${dateFr(der.Date)}` : s.Soumise_le ? `Soumise · ${dateFr(s.Soumise_le)}` : s.Lien_envoye_le ? `Lien envoyé · ${dateFr(s.Lien_envoye_le)}` : "—";
  let actions = "";
  if (!close) {
    if (e === 0) actions += `<button class="mini prim" data-envoyer="${s.id}">Envoyer</button>`;
    if (e === 1 || e === 2) actions += `<button class="mini" data-relancer="${s.id}">Relancer</button>`;
    if (e >= 3 && e < 5) actions += `<button class="mini prim" data-finaliser="${s.id}">Finaliser</button>`;
    if (e === 5) actions += `<button class="mini" data-definaliser="${s.id}">Rouvrir</button>`;
  }
  actions += `<button class="mini" data-ouvrir="${s.id}" aria-expanded="${OUVERTE === s.id}">${OUVERTE === s.id ? "Fermer" : "Détails"}</button>`;
  actions = `<div class="boutons">${actions}</div><div class="boutons" style="margin-top:6px"><button class="mini pdf" data-pdf="${f.id}" title="Télécharger la fiche ${esc(CAMP_DE(f))} en PDF">${ICONE_PDF}PDF</button></div>`;
  return `<tr${sel}><td>${nom}</td>
    <td><div class="etapes">${barres}</div><span class="etiq${enRetard(s) ? " retard" : ""}">${esc(libEtape(e))}${enRetard(s) ? " · sans réponse" : ""}</span>${s.Prochaine_action ? `<span class="sous">→ ${esc(s.Prochaine_action)}</span>` : ""}</td>
    <td>${nbCh}</td><td>${derTxt}</td><td>${actions}</td></tr>`;
}

function detail(f, lecture) { // lecture : vue des campagnes closes (comparaison seule)
  const e = etape(f);
  const ch = changements(f);
  const diffs = ch === null ? `<p class="etat">Pas de fiche l'an dernier : rien à comparer.</p>`
    : ch.length ? ch.map(d => `<div class="diff"><span class="pill">${esc(d.type)}</span><span>${esc(d.lib)} :</span>${d.avant ? `<span class="avant">${esc(d.avant)}</span>` : ""}${d.avant && d.apres ? "→" : ""}${d.apres ? `<span class="apres">${esc(d.apres)}</span>` : ""}</div>`).join("")
    : `<p class="etat">Aucun changement par rapport à l'an dernier.</p>`;
  const ech = echanges(f).map(x => `<div class="ech"><b>${dateFr(x.Date)} · ${esc(x.Type)}</b> — ${esc(x.Objet || "")}<span class="sous">${esc(x.Resume || "")}</span></div>`).join("") || `<p class="etat">Aucun échange enregistré.</p>`;
  if (lecture) return `<div class="grille-detail"><section><h2>Changements par rapport à l'an dernier</h2>${diffs}</section><section><h2>Correspondances ${esc(String(CAMP_DE(f)))}</h2>${ech}</section></div>`;
  return `<div class="grille-detail">
    <section><h2>Changements par rapport à l'an dernier</h2>${diffs}
      <label class="champ">Prochaine action<input data-prochaine="${f.id}" value="${esc(f.Prochaine_action || "")}" placeholder="Ex. : relancer le 20/01"></label></section>
    <section><h2>Correspondances</h2>${ech}
      <div class="form-ech">
        <label class="champ">Date<input type="date" id="eDate" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="champ">Type<select id="eType"><option>Mail envoyé</option><option>Mail reçu</option><option>Appel</option><option>Note</option></select></label>
        <label class="champ plein">Objet<input id="eObjet"></label>
        <label class="champ plein">Résumé<textarea id="eResume" rows="2"></textarea></label>
        <button class="btn sec plein" data-ajout-ech="${f.id}">Enregistrer l'échange</button></div></section></div>`;
}

// ---------- Mails (préparés dans la messagerie, jamais envoyés automatiquement) ----------
function lienFiche(f) { return (CAMP.URL_formulaire || "") + (String(CAMP.URL_formulaire || "").includes("?") ? "&" : "?") + "Code_=" + encodeURIComponent(f.Code || ""); }
function mail(f, relance) {
  const an = CAMP.Annee, lim = CAMP.Date_limite ? new Date(CAMP.Date_limite * 1000).toLocaleDateString("fr-FR") : "";
  const objet = `${relance ? "Relance - " : ""}Catalogue Accompagnement apprentissage ${an} - mise à jour de votre fiche - ${f.Etablissement || ""}`;
  const corps = [
    "Madame, Monsieur,", "",
    relance ? `Sauf erreur de notre part, nous n'avons pas encore reçu la mise à jour de votre fiche pour le catalogue ${an}.`
            : `Nous préparons l'édition ${an} du catalogue Accompagnement apprentissage. Votre fiche de l'an dernier est déjà remplie dans le formulaire ci-dessous : il suffit de corriger ce qui a changé (formations, contacts, coordonnées, accompagnement) puis de l'envoyer.`,
    "", "Votre fiche : " + lienFiche(f), "",
    lim ? `Merci de nous la retourner avant le ${lim}. Si rien n'a changé, vous pouvez l'envoyer telle quelle.` : "Si rien n'a changé, vous pouvez l'envoyer telle quelle.",
    "Ce lien est personnel : merci de ne pas le diffuser.", "", "Cordialement,", "Le SAIO",
  ].join("\n");
  return `mailto:${encodeURIComponent(f.Mail || "")}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
}

// ---------- Nouvelle campagne ----------
// Recopie les fiches dans une nouvelle campagne (inactive tant qu'on ne l'active pas) :
// nouveaux codes, lien vers la fiche d'origine (pour la comparaison), formations fermées non reprises.
const SUIVI = ["Code", "Campagne", "Fiche_precedente", "Lien_envoye_le", "Ouverte_le", "Soumise_le", "Finalisee_le", "Prochaine_action"];
let COLONNES = null; // colonnes de données (hors formules) par table, lues dans les métadonnées

async function colonnesDonnees() {
  if (COLONNES) return COLONNES;
  const t = lignes(await grist.docApi.fetchTable("_grist_Tables")), c = lignes(await grist.docApi.fetchTable("_grist_Tables_column"));
  COLONNES = {};
  for (const tab of t) COLONNES[tab.tableId] = c.filter(x => x.parentId === tab.id && !x.isFormula && !x.colId.startsWith("gristHelper") && x.colId !== "manualSort").map(x => x.colId);
  return COLONNES;
}

function sources(campSource) {
  // la fiche si elle est finalisée, sinon sa dernière version finalisée (à défaut, la version actuelle)
  const res = [];
  for (const f of D.fiches.filter(x => x.Campagne === campSource.id)) {
    if (f.Finalisee_le) { res.push(f); continue; }
    let p = D.fiches.find(x => x.id === f.Fiche_precedente);
    while (p && !p.Finalisee_le) p = D.fiches.find(x => x.id === p.Fiche_precedente);
    res.push(p || f);
  }
  return res;
}

function panneau() {
  if (PANNEAU !== "nouvelle") return "";
  const src = CAMP, an = String((parseInt(src.Annee, 10) || new Date().getFullYear()) + 1);
  const nbF = D.fiches.filter(f => f.Campagne === src.id).length, nbFin = D.fiches.filter(f => f.Campagne === src.id && f.Finalisee_le).length;
  return `<section class="carte" style="margin-bottom:16px"><h2>Préparer une nouvelle campagne à partir de ${esc(src.Annee)}</h2>
    <div class="form-ech">
      <label class="champ">Année<input id="nAnnee" value="${esc(an)}"></label>
      <label class="champ">Date limite de retour<input type="date" id="nLimite"></label></div>
    <p class="etat">${nbF} fiche(s) dans la campagne ${esc(src.Annee)}, dont ${nbFin} finalisée(s). Chaque fiche est reprise dans sa dernière version finalisée ;
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
  if (!DANS_GRIST) { MSG = { cl: "ok", txt: `Démonstration : la campagne ${annee} serait créée avec ${src.length} fiche(s).` }; PANNEAU = null; return afficher(); }
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
    MSG = { cl: "ok", txt: `Campagne ${annee} créée et lancée : ${ids.length} fiche(s) reprises. La campagne précédente est close.` };
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
  if (!CAMP.URL_formulaire) { MSG = { cl: "err", txt: "Renseignez l'adresse du formulaire (colonne URL_formulaire de la campagne)." }; return afficher(); }
  if (!f.Code) { MSG = { cl: "err", txt: "Cette fiche n'a pas de code : impossible de créer son lien." }; return afficher(); }
  window.open(mail(f, relance), "_blank");
  const auj = Math.floor(Date.now() / 86400000) * 86400;
  const a = [["AddRecord", "Correspondances", null, { Fiche: f.id, Date: auj, Type: "Mail envoyé", Objet: relance ? "Relance" : "Envoi du lien du formulaire" }]];
  if (!relance) a.push(["UpdateRecord", "Fiches", f.id, { Lien_envoye_le: maintenant() }]);
  await appliquer(a, `Mail préparé pour ${f.Etablissement} : vérifiez-le et envoyez-le depuis votre messagerie.`);
}

// ---------- Interactions ----------
document.addEventListener("change", e => {
  const el = e.target;
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
  if (d.avecCh) { FILTRE.ch = !FILTRE.ch; return afficher(); }
  if (d.replier !== undefined) { REPLIES.has(d.replier) ? REPLIES.delete(d.replier) : REPLIES.add(d.replier); return afficher(); }
  if (d.toutDep) { REPLIES = d.toutDep === "replier" ? new Set(D.fiches.map(f => f.Departement || "Sans département")) : new Set(); return afficher(); }
  if (d.dep !== undefined) { FILTRE.dep = d.dep; OUVERTE = null; return afficher(); }
  if (d.onglet) { ONGLET = d.onglet; choisirCampagne(); OUVERTE = null; VUE = null; MSG = null; PANNEAU = null; FILTRE.etape = ""; FILTRE.retard = false; FILTRE.ch = false; FILTRE.dep = ""; viderSelection(); return afficher(); }
  if (d.voir) {
    VUE = +d.voir;
    if (DANS_GRIST) { try { await grist.setSelectedRows([VUE]); await grist.setCursorPos({ rowId: VUE }); } catch (err) { /* widget non relié */ } }
    MSG = null;
    return afficher();
  }
  if (d.pdf) return exporterPdf(fiche(d.pdf));
  if (d.ouvrir) { OUVERTE = OUVERTE === +d.ouvrir ? null : +d.ouvrir; MSG = null; return afficher(); }
  if (d.envoyer) return envoyer(fiche(d.envoyer), false);
  if (d.relancer) return envoyer(fiche(d.relancer), true);
  if (d.finaliser) return appliquer([["UpdateRecord", "Fiches", +d.finaliser, { Finalisee_le: maintenant() }]], "Fiche finalisée.");
  if (d.definaliser) return appliquer([["UpdateRecord", "Fiches", +d.definaliser, { Finalisee_le: null }]], "Fiche rouverte.");
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
    return appliquer([["AddRecord", "Correspondances", null, { Fiche: +d.ajoutEch, Date: date, Type: v("eType"), Objet: v("eObjet"), Resume: v("eResume") }]], "Échange enregistré.");
  }
});

// Aucune fiche choisie : le formulaire relié affiche une invite au lieu d'une fiche au hasard
function viderSelection() { if (DANS_GRIST) grist.setSelectedRows([]).catch(() => {}); }

if (DANS_GRIST) {
  grist.ready({ requiredAccess: "full", allowSelectBy: true });
  viderSelection();
  grist.onRecords(() => charger());
}
charger();
