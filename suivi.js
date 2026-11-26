// Tableau de suivi des fiches CFA (widget Grist réservé au SAIO).
// Une ligne par fiche de la campagne choisie : étapes, changements par rapport à l'an dernier,
// correspondances, prochaine action. Le bouton « Envoyer » prépare le mail dans la messagerie
// (lien personnel vers le formulaire) puis coche l'étape ; rien n'est envoyé automatiquement.
// Hors de Grist, la page s'affiche avec des données fictives (démonstration).
"use strict";

const DANS_GRIST = window.parent !== window;
const ETAPES = ["Lien envoyé", "Ouverte", "Soumise", "Mise en forme", "En discussion", "Finalisée"];
const CHAMPS = [["Etablissement", "Établissement"], ["Site", "Site"], ["Adresse", "Adresse"], ["Code_postal", "Code postal"],
  ["Ville", "Ville"], ["Telephone", "Téléphone"], ["Mail", "Mail"], ["Site_internet", "Site internet"]];
const JOUR = 86400;

let D = { fiches: [], formations: [], contacts: [], accomp: [], corresp: [], campagnes: [] };
let CAMP = null, FILTRE = { etape: "", dep: "", texte: "", retard: false }, OUVERTE = null, MSG = null;
let VUE = null; // fiche affichée dans le formulaire lié
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
  if (!CAMP || !ca.find(c => c.id === CAMP.id)) CAMP = ca.find(c => c.Active) || ca[ca.length - 1] || null;
  else CAMP = ca.find(c => c.id === CAMP.id);
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
    contacts: [{ id: 1, Fiche: 1, Pole: "Bâtiment", Nom: "Ancien contact" }, { id: 2, Fiche: 2, Pole: "Bâtiment", Nom: "Nouveau contact" }],
    accomp: [], corresp: [{ id: 1, Fiche: 3, Date: t - 5 * JOUR, Type: "Appel", Objet: "Question", Resume: "Échange fictif" }],
  };
  CAMP = D.campagnes[1];
  afficher();
}

// ---------- Calculs ----------
function etape(f) {
  if (f.Finalisee_le) return 6;
  if (f.Etape_SAIO === "En discussion") return 5;
  if (f.Etape_SAIO === "Mise en forme") return 4;
  if (f.Soumise_le) return 3;
  if (f.Ouverte_le) return 2;
  if (f.Lien_envoye_le) return 1;
  return 0;
}
const libEtape = n => n === 0 ? "À envoyer" : n === 3 ? "Soumise, à mettre en forme" : ETAPES[n - 1];

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
  const cle = c => norm(c.Nom) || norm(c.Pole) || norm(c.Fonction);
  const pareil = (a, b) => (norm(a.Nom) && norm(a.Nom) === norm(b.Nom)) || (!norm(a.Nom) && cle(a) === cle(b)) || (norm(a.Pole) && norm(a.Pole) === norm(b.Pole) && norm(a.Fonction) === norm(b.Fonction));
  const etiq = c => c.Pole || c.Fonction || "";
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
  document.getElementById("titre").textContent = camp ? `Suivi de la campagne ${camp.Annee}` : "Suivi des fiches";
  document.getElementById("campagne").innerHTML = `<div class="boutons"><select id="choixCampagne" aria-label="Campagne" style="width:auto">${D.campagnes.map(c => `<option value="${c.id}"${camp && c.id === camp.id ? " selected" : ""}>Campagne ${esc(c.Annee)}${c.Active ? " (active)" : " (inactive)"}</option>`).join("")}</select>
    ${camp && !camp.Active ? `<button class="mini prim" data-panneau="activer">Activer cette campagne</button>` : ""}
    <button class="mini" data-panneau="nouvelle">Préparer une nouvelle campagne</button></div>`;
  if (!camp) { app.innerHTML = `<p class="alerte">Aucune campagne. Ajoutez une ligne dans la table Campagnes.</p>`; return; }

  const fiches = D.fiches.filter(f => f.Campagne === camp.id);
  const parEtape = [0, 1, 2, 3, 4, 5, 6].map(n => fiches.filter(f => etape(f) === n).length);
  const nbRetard = fiches.filter(enRetard).length;
  const compteur = (val, nb, lib) => `<button class="compteur" data-filtre-etape="${val}" aria-pressed="${FILTRE.etape === String(val)}"><b>${nb}</b><span>${lib}</span></button>`;
  const compteurs = `<div class="compteurs">${compteur("", fiches.length, "Toutes")}${compteur(0, parEtape[0], "À envoyer")}${compteur("1-2", parEtape[1] + parEtape[2], "Envoyées, en attente")}${compteur(3, parEtape[3], "Soumises, à traiter")}${compteur("4-5", parEtape[4] + parEtape[5], "Mise en forme / discussion")}${compteur(6, parEtape[6], "Finalisées")}
    <button class="compteur" data-retard="1" aria-pressed="${FILTRE.retard}"><b class="${nbRetard ? "retard" : ""}">${nbRetard}</b><span>Sans réponse depuis 7 j</span></button></div>`;

  const deps = [...new Set(fiches.map(f => f.Departement || "Sans département"))].sort();
  const filtres = `<div class="filtres">
    <select id="fDep" aria-label="Département"><option value="">Tous les départements</option>${deps.map(d => `<option${FILTRE.dep === d ? " selected" : ""}>${esc(d)}</option>`).join("")}</select>
    <input id="fTexte" placeholder="Rechercher un établissement" aria-label="Rechercher" value="${esc(FILTRE.texte)}">
    <button class="mini" id="envoyerTous">Préparer l'envoi des fiches « À envoyer »</button>
    ${camp.Date_limite ? `<span class="etat">Date limite : ${esc(new Date(camp.Date_limite * 1000).toLocaleDateString("fr-FR"))}</span>` : ""}</div>`;

  const garde = f => {
    const e = etape(f);
    if (FILTRE.etape !== "") { const [a, b] = FILTRE.etape.split("-").map(Number); if (e < a || e > (b ?? a)) return false; }
    if (FILTRE.retard && !enRetard(f)) return false;
    if (FILTRE.dep && (f.Departement || "Sans département") !== FILTRE.dep) return false;
    if (FILTRE.texte && !norm(f.Etablissement + " " + f.Site).includes(norm(FILTRE.texte))) return false;
    return true;
  };
  const vis = fiches.filter(garde).sort((a, b) => String(a.Departement || "~").localeCompare(b.Departement || "~") || String(a.Etablissement).localeCompare(b.Etablissement));

  let corps = "", depCourant = null;
  for (const f of vis) {
    const dep = f.Departement || "Sans département";
    if (dep !== depCourant) { depCourant = dep; corps += `<tr class="dep"><td colspan="6">${esc(dep)} · ${vis.filter(x => (x.Departement || "Sans département") === dep).length}</td></tr>`; }
    corps += ligne(f);
    if (OUVERTE === f.id) corps += `<tr class="detail"><td colspan="6">${detail(f)}</td></tr>`;
  }
  const bandeau = MSG ? `<div class="bandeau ${MSG.cl}" role="status" style="margin-bottom:12px">${esc(MSG.txt)}</div>` : "";
  app.innerHTML = `${bandeau}${panneau()}${compteurs}${filtres}<div class="boite"><table class="suivi">
    <thead><tr><th>Établissement · site</th><th>Étape</th><th>Changements</th><th>Dernier échange</th><th>Prochaine action</th><th>Actions</th></tr></thead>
    <tbody>${corps || `<tr><td colspan="6" class="etat">Aucune fiche pour ces filtres.</td></tr>`}</tbody></table></div>`;
}

function ligne(f) {
  const e = etape(f);
  const dates = [f.Lien_envoye_le, f.Ouverte_le, f.Soumise_le, null, null, f.Finalisee_le];
  const barres = ETAPES.map((lib, i) => `<i class="${i < e ? "f" : i === e && e >= 3 && e < 6 ? "c" : ""}" title="${esc(lib)}${dates[i] ? " · " + dateFr(dates[i]) : ""}"></i>`).join("");
  const ch = changements(f);
  const nbCh = ch === null ? `<span class="sous">pas de fiche l'an dernier</span>` : e < 3 ? `<span class="sous">—</span>` : `${ch.length} changement${ch.length > 1 ? "s" : ""}`;
  const der = echanges(f)[0];
  const derTxt = der ? `${esc(der.Type)} · ${dateFr(der.Date)}` : f.Soumise_le ? `Soumise · ${dateFr(f.Soumise_le)}` : f.Lien_envoye_le ? `Lien envoyé · ${dateFr(f.Lien_envoye_le)}` : "—";
  let actions = "";
  if (e === 0) actions += `<button class="mini prim" data-envoyer="${f.id}">Envoyer</button>`;
  if (e === 1 || e === 2) actions += `<button class="mini" data-relancer="${f.id}">Relancer</button>`;
  if (e >= 3 && e < 6) actions += `<button class="mini prim" data-finaliser="${f.id}">Finaliser</button>`;
  if (e === 6) actions += `<button class="mini" data-definaliser="${f.id}">Rouvrir</button>`;
  actions += `<button class="mini" data-ouvrir="${f.id}" aria-expanded="${OUVERTE === f.id}">${OUVERTE === f.id ? "Fermer" : "Détails"}</button>`;
  return `<tr${VUE === f.id ? ' class="choisie"' : ""}><td><button class="lien-fiche" data-voir="${f.id}" title="Ouvrir la fiche dans le formulaire">${esc(f.Etablissement)}</button><span class="sous">${esc(f.Site || "")}</span></td>
    <td><div class="etapes">${barres}</div><span class="etiq${enRetard(f) ? " retard" : ""}">${esc(libEtape(e))}${enRetard(f) ? " · sans réponse" : ""}</span></td>
    <td>${nbCh}</td><td>${derTxt}</td><td>${esc(f.Prochaine_action || "")}</td><td><div class="boutons">${actions}</div></td></tr>`;
}

function detail(f) {
  const e = etape(f);
  const ch = changements(f);
  const diffs = ch === null ? `<p class="etat">Pas de fiche l'an dernier : rien à comparer.</p>`
    : e < 3 ? `<p class="etat">La comparaison apparaîtra quand l'établissement aura soumis sa fiche.</p>`
    : ch.length ? ch.map(d => `<div class="diff"><span class="pill">${esc(d.type)}</span><span>${esc(d.lib)} :</span>${d.avant ? `<span class="avant">${esc(d.avant)}</span>` : ""}${d.avant && d.apres ? "→" : ""}${d.apres ? `<span class="apres">${esc(d.apres)}</span>` : ""}</div>`).join("")
    : `<p class="etat">Aucun changement par rapport à l'an dernier.</p>`;
  const ech = echanges(f).map(x => `<div class="ech"><b>${dateFr(x.Date)} · ${esc(x.Type)}</b> — ${esc(x.Objet || "")}<span class="sous">${esc(x.Resume || "")}</span></div>`).join("") || `<p class="etat">Aucun échange enregistré.</p>`;
  const etapeSaio = `<label class="champ">Étape SAIO<select data-etape-saio="${f.id}"><option value="">—</option>${["Mise en forme", "En discussion"].map(v => `<option${f.Etape_SAIO === v ? " selected" : ""}>${v}</option>`).join("")}</select></label>`;
  return `<div class="grille-detail">
    <section><h2>Changements par rapport à l'an dernier</h2>${diffs}
      ${e >= 3 ? etapeSaio : ""}
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
const SUIVI = ["Code", "Campagne", "Fiche_precedente", "Lien_envoye_le", "Ouverte_le", "Soumise_le", "Finalisee_le", "Etape_SAIO", "Prochaine_action"];
let COLONNES = null; // colonnes de données (hors formules) par table, lues dans les métadonnées

async function colonnesDonnees() {
  if (COLONNES) return COLONNES;
  const t = lignes(await grist.docApi.fetchTable("_grist_Tables")), c = lignes(await grist.docApi.fetchTable("_grist_Tables_column"));
  COLONNES = {};
  for (const tab of t) COLONNES[tab.tableId] = c.filter(x => x.parentId === tab.id && !x.isFormula && !x.colId.startsWith("gristHelper") && x.colId !== "manualSort").map(x => x.colId);
  return COLONNES;
}

function sources(campSource, mode) {
  // mode "finalisee" : la fiche si elle est finalisée, sinon sa dernière version finalisée ; mode "actuelle" : la fiche telle quelle
  const res = [];
  for (const f of D.fiches.filter(x => x.Campagne === campSource.id)) {
    if (mode === "actuelle" || f.Finalisee_le) { res.push(f); continue; }
    let p = D.fiches.find(x => x.id === f.Fiche_precedente);
    while (p && !p.Finalisee_le) p = D.fiches.find(x => x.id === p.Fiche_precedente);
    res.push(p || f);
  }
  return res;
}

function panneau() {
  if (PANNEAU === "activer") return `<div class="bandeau err" style="margin-bottom:12px">Activer la campagne ${esc(CAMP.Annee)} ?
    Les liens des autres campagnes cesseront aussitôt de fonctionner pour les établissements.
    <div class="boutons" style="margin-top:10px"><button class="btn" data-activer="${CAMP.id}">Oui, activer</button><button class="btn sec" data-panneau="">Annuler</button></div></div>`;
  if (PANNEAU !== "nouvelle") return "";
  const src = CAMP, an = String((parseInt(src.Annee, 10) || new Date().getFullYear()) + 1);
  const nbF = D.fiches.filter(f => f.Campagne === src.id).length, nbFin = D.fiches.filter(f => f.Campagne === src.id && f.Finalisee_le).length;
  return `<section class="carte" style="margin-bottom:16px"><h2>Préparer une nouvelle campagne à partir de ${esc(src.Annee)}</h2>
    <div class="form-ech">
      <label class="champ">Année<input id="nAnnee" value="${esc(an)}"></label>
      <label class="champ">Date limite de retour<input type="date" id="nLimite"></label></div>
    <p class="etat">${nbF} fiche(s) dans la campagne ${esc(src.Annee)}, dont ${nbFin} finalisée(s). Fiches non finalisées :</p>
    <label class="coche"><input type="radio" name="nMode" value="finalisee" checked>reprendre leur dernière version finalisée (sinon la version actuelle)</label>
    <label class="coche"><input type="radio" name="nMode" value="actuelle">reprendre la version actuelle, même non finalisée</label>
    <p class="etat">Les formations marquées « Fermée » ne sont pas reprises ; les « Nouvelle » deviennent « Maintenue ».
      La nouvelle campagne reste <b>inactive</b> : les liens actuels continuent de fonctionner jusqu'à ce que vous l'activiez.</p>
    <div class="boutons"><button class="btn" id="creerCampagne">Créer la campagne</button><button class="btn sec" data-panneau="">Annuler</button></div></section>`;
}

async function creerCampagne() {
  const annee = document.getElementById("nAnnee").value.trim();
  const lim = document.getElementById("nLimite").value;
  const mode = (document.querySelector('input[name="nMode"]:checked') || {}).value || "finalisee";
  if (!annee) { MSG = { cl: "err", txt: "Indiquez l'année de la campagne." }; return afficher(); }
  if (D.campagnes.some(c => String(c.Annee).trim() === annee)) { MSG = { cl: "err", txt: `La campagne ${annee} existe déjà.` }; return afficher(); }
  const src = sources(CAMP, mode);
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
    PANNEAU = null;
    MSG = { cl: "ok", txt: `Campagne ${annee} créée (inactive) : ${ids.length} fiche(s) reprises. Vérifiez-la, puis cliquez sur « Activer cette campagne ».` };
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
  if (el.id === "choixCampagne") { CAMP = D.campagnes.find(c => c.id === +el.value); OUVERTE = null; MSG = null; return afficher(); }
  if (el.id === "fDep") { FILTRE.dep = el.value; return afficher(); }
  if (el.dataset.etapeSaio) return appliquer([["UpdateRecord", "Fiches", +el.dataset.etapeSaio, { Etape_SAIO: el.value || null }]], "Étape mise à jour.");
  if (el.dataset.prochaine) return appliquer([["UpdateRecord", "Fiches", +el.dataset.prochaine, { Prochaine_action: el.value }]], "Prochaine action enregistrée.");
});
app.addEventListener("input", e => {
  if (e.target.id === "fTexte") { FILTRE.texte = e.target.value; const pos = e.target.selectionStart; afficher(); const x = document.getElementById("fTexte"); x.focus(); x.setSelectionRange(pos, pos); }
});
document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = b.dataset, fiche = id => D.fiches.find(f => f.id === +id);
  if (d.filtreEtape !== undefined) { FILTRE.etape = FILTRE.etape === d.filtreEtape ? "" : d.filtreEtape; FILTRE.retard = false; return afficher(); }
  if (d.retard) { FILTRE.retard = !FILTRE.retard; FILTRE.etape = ""; return afficher(); }
  if (d.voir) {
    VUE = +d.voir;
    if (DANS_GRIST) { try { await grist.setSelectedRows([VUE]); await grist.setCursorPos({ rowId: VUE }); } catch (err) { /* widget non relié */ } }
    MSG = { cl: "ok", txt: `Fiche de ${fiche(d.voir).Etablissement} ouverte dans le formulaire (sur cette page). Si rien ne s'affiche : ajoutez le widget Formulaire à la page, « Sélectionner par » ce tableau.` };
    return afficher();
  }
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
  if (b.id === "envoyerTous") {
    const aEnvoyer = D.fiches.filter(f => f.Campagne === CAMP.id && etape(f) === 0);
    if (!aEnvoyer.length) { MSG = { cl: "ok", txt: "Aucune fiche à envoyer." }; return afficher(); }
    MSG = { cl: "ok", txt: `${aEnvoyer.length} fiche(s) à envoyer : utilisez le bouton « Envoyer » de chaque ligne (filtre « À envoyer »).` };
    FILTRE.etape = "0"; return afficher();
  }
  if (d.ajoutEch) {
    const v = id => (document.getElementById(id).value || "").trim();
    const date = v("eDate") ? Date.parse(v("eDate")) / 1000 : null;
    if (!v("eObjet") && !v("eResume")) { MSG = { cl: "err", txt: "Indiquez au moins un objet ou un résumé." }; return afficher(); }
    return appliquer([["AddRecord", "Correspondances", null, { Fiche: +d.ajoutEch, Date: date, Type: v("eType"), Objet: v("eObjet"), Resume: v("eResume") }]], "Échange enregistré.");
  }
});

if (DANS_GRIST) {
  grist.ready({ requiredAccess: "full", allowSelectBy: true });
  grist.onRecords(() => charger());
}
charger();
