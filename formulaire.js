// Formulaire de mise à jour de la fiche de renseignement d'un CFA (widget personnalisé Grist).
// L'établissement arrive par un lien personnel (?Code_=…) : les règles d'accès du document ne lui
// laissent voir que sa fiche et ses lignes (formations, contacts, accompagnement).
// Tables attendues : Fiches, Formations, Contacts, Accompagnement (colonne Fiche = référence), Referentiel.
// Hors de Grist, la page s'affiche avec des données fictives (démonstration).
"use strict";

const DANS_GRIST = window.parent !== window;
const CHAMPS_FICHE = [
  ["Etablissement", "Nom de l'établissement"], ["Site", "Site de formation"], ["Adresse", "Adresse"],
  ["Code_postal", "Code postal"], ["Ville", "Ville"], ["Telephone", "Téléphone"], ["Mail", "Mail"], ["Site_internet", "Site internet"],
];
const CHAMPS_CONTACT = [["Pole", "Pôle ou filière"], ["Nom", "Nom"], ["Telephone", "Téléphone"], ["Mail", "Mail"]];

let FICHES = [], FICHE = null, ORIG = null, REF = [];
let ETAT = { contacts: [], formations: [], accomp: [] };
let OUVERTS = new Set(["etab", "contacts"]);
let MESSAGE = null, CERTIF = false;
let CHOIX = null; // formation choisie dans le référentiel (le champ est alors verrouillé)

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = document.getElementById("app");

// Grist renvoie les tables colonne par colonne : on les remet en lignes.
function lignes(t) {
  if (!t || !t.id) return [];
  return t.id.map((id, i) => { const r = { id }; for (const k in t) r[k] = t[k][i]; return r; });
}
const copie = o => JSON.parse(JSON.stringify(o));

// ---------- Chargement ----------
async function charger() {
  if (!DANS_GRIST) return demo();
  const lire = n => grist.docApi.fetchTable(n).then(lignes).catch(() => []);
  const [f, fo, co, ac, re] = await Promise.all(["Fiches", "Formations", "Contacts", "Accompagnement", "Referentiel"].map(lire));
  // Seules les fiches de la campagne active (Code_actif rempli) ; un établissement n'en voit qu'une.
  FICHES = f.filter(x => x.Code_actif); if (!FICHES.length) FICHES = f;
  REF = re;
  const garde = FICHE && FICHES.find(x => x.id === FICHE.id);
  FICHE = garde || FICHES[0] || null;
  if (!FICHE) { app.innerHTML = `<p class="alerte">Aucune fiche accessible. Vérifiez que vous avez ouvert le lien complet reçu par mail.</p>`; return; }
  const de = rows => rows.filter(r => r.Fiche === FICHE.id);
  ETAT = { contacts: de(co), formations: de(fo), accomp: de(ac) };
  ORIG = copie({ fiche: FICHE, ...ETAT });
  afficher();
  // Première ouverture par l'établissement : on coche l'étape « Ouverte » du suivi.
  if (FICHES.length === 1 && "Ouverte_le" in FICHE && !FICHE.Ouverte_le) {
    grist.docApi.applyUserActions([["UpdateRecord", "Fiches", FICHE.id, { Ouverte_le: Date.now() / 1000 }]]).catch(() => {});
  }
}

function demo() {
  FICHES = [{ id: 1, Etablissement: "CFA Exemple (démonstration)", Site: "Site de Villeneuve", Adresse: "1 rue Imaginaire", Code_postal: "00000", Ville: "Villeneuve", Telephone: "05 00 00 00 00", Mail: "contact@exemple.fr" }];
  FICHE = FICHES[0];
  REF = [["CAP", "Maçon", "Bâtiment, Travaux publics"], ["CAP", "Couvreur", "Bâtiment, Travaux publics"], ["CAP", "Carreleur mosaïste", "Bâtiment, Travaux publics"], ["CAP", "Cuisine", "Hôtellerie, Restauration"], ["Bac pro", "Métiers de l'accueil", "Commerce, Vente, Logistique"]]
    .map(([Diplome, Intitule, Filiere], i) => ({ id: i + 1, Diplome, Intitule, Filiere }));
  ETAT = {
    contacts: [{ id: 1, Fiche: 1, Pole: "Bâtiment", Nom: "Prénom NOM", Telephone: "05 00 00 00 01", Mail: "contact1@exemple.fr" }],
    formations: [{ id: 1, Fiche: 1, Intitule: "CAP Maçon", Filiere: "Bâtiment, Travaux publics", Statut: "Maintenue" },
                 { id: 2, Fiche: 1, Intitule: "CAP Couvreur", Filiere: "Bâtiment, Travaux publics", Statut: "Maintenue" }],
    accomp: [{ id: 1, Fiche: 1, Groupe: "Avant la recherche", Action: "Entretien individuel", Cochee: true },
             { id: 2, Fiche: 1, Groupe: "Événements", Action: "Job dating", Cochee: false }],
  };
  ORIG = copie({ fiche: FICHE, ...ETAT });
  afficher();
}

// ---------- Comparaison avec l'état chargé ----------
const orig = (table, id) => (ORIG[table] || []).find(r => r.id === id);
function changeChamp(table, ligne, champ) {
  if (table === "fiche") return String(FICHE[champ] ?? "") !== String(ORIG.fiche[champ] ?? "");
  if (!ligne.id) return false;
  const o = orig(table, ligne.id);
  return o && String(o[champ] ?? "") !== String(ligne[champ] ?? "");
}
function nbModifs() {
  let n = CHAMPS_FICHE.filter(([c]) => c in ORIG.fiche || FICHE[c]).filter(([c]) => changeChamp("fiche", null, c)).length;
  for (const t of ["contacts", "formations", "accomp"]) for (const l of ETAT[t]) {
    if (!l.id || l._suppr) { n++; continue; }
    const o = orig(t, l.id);
    if (o && Object.keys(l).some(k => !k.startsWith("_") && String(o[k] ?? "") !== String(l[k] ?? ""))) n++;
  }
  return n;
}

// ---------- Contrôles de format (jamais de lecture de la valeur au-delà du format) ----------
function controle(champ, v) {
  v = String(v ?? "").trim();
  if (!v) return "";
  if (/mail/i.test(champ) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Adresse mail incomplète";
  if (/telephone/i.test(champ) && v.replace(/\D/g, "").length !== 10) return "10 chiffres attendus";
  return "";
}

const libRef = r => (r.Diplome ? r.Diplome + " " : "") + r.Intitule;
const trouverRef = v => REF.find(r => libRef(r).toLowerCase() === String(v).trim().toLowerCase());

// ---------- Affichage ----------
function champ(table, idx, c, libelle, ligne) {
  const v = ligne[c] ?? "";
  const ch = changeChamp(table, ligne, c);
  const err = controle(c, v);
  return `<label class="champ${ch ? " change" : ""}">${esc(libelle)}
    <input data-t="${table}" data-i="${idx}" data-c="${c}" value="${esc(v)}">
    <span class="invalide">${esc(err)}</span></label>`;
}

function pli(cle, titre, pastilles, corps) {
  return `<details class="pli" data-pli="${esc(cle)}"${OUVERTS.has(cle) ? " open" : ""}>
    <summary><span class="nomgrp">${esc(titre)}</span>${pastilles}</summary><div class="corps">${corps}</div></details>`;
}

function grouper(liste, cle) {
  const g = new Map();
  liste.forEach((l, i) => { if (l._suppr && !l.id) return; const k = l[cle] || "Autres"; if (!g.has(k)) g.set(k, []); g.get(k).push([l, i]); });
  return g;
}

function bandeau(id) {
  if (!MESSAGE) return "";
  return `<div class="bandeau ${MESSAGE.cl}" role="${MESSAGE.cl === "err" ? "alert" : "status"}"${id ? ` id="${id}"` : ""}>${MESSAGE.cl === "ok" ? "✓ " : "⚠ "}${esc(MESSAGE.txt)}</div>`;
}

function afficher() {
  const n = nbModifs();
  document.getElementById("titre").textContent = `Votre fiche — ${FICHE.Etablissement || ""}${FICHE.Site ? ", " + FICHE.Site : ""}`;
  document.getElementById("resume").innerHTML = (FICHE.Soumise_le ? `<span class="pill">Envoyée</span> ` : "") +
    (n ? `<span class="pill modif">${n} modification${n > 1 ? "s" : ""}</span>` : `<span class="pill">Aucune modification</span>`);

  const choix = FICHES.length > 1 ? `<p class="info">Vue SAIO : ${FICHES.length} fiches visibles.
    <select id="choixFiche" aria-label="Fiche affichée">${FICHES.map(f => `<option value="${f.id}"${f.id === FICHE.id ? " selected" : ""}>${esc(f.Etablissement)} — ${esc(f.Site || "")}</option>`).join("")}</select></p>` : "";

  // Établissement
  const etab = pli("etab", "Établissement", "", CHAMPS_FICHE.filter(([c]) => c in FICHE).map(([c, lib]) => champ("fiche", 0, c, lib, FICHE)).join(""));

  // Contacts
  const vivants = ETAT.contacts.map((l, i) => [l, i]).filter(([l]) => !l._suppr);
  const contacts = vivants.map(([l, i]) => pli("contact" + i, l.Pole || l.Nom || "Nouveau contact",
      !l.id ? `<span class="pill new">Nouveau</span>` : "",
      CHAMPS_CONTACT.map(([c, lib]) => champ("contacts", i, c, lib, l)).join("") +
      `<button class="mini" data-suppr="contacts" data-i="${i}">Retirer ce contact</button>`)).join("");
  const blocContacts = pli("contacts", "Contacts", `<span class="pill">${vivants.length}</span>`,
    contacts + `<button class="ajout" data-ajout="contacts">+ Ajouter un contact</button>`);

  // Formations par filière
  const gf = grouper(ETAT.formations, "Filiere");
  let nbF = 0;
  const filieres = [...gf].map(([fil, items]) => {
    const vis = items.filter(([l]) => !l._suppr);
    nbF += vis.filter(([l]) => l.Statut !== "Fermée").length;
    const nbFerm = vis.filter(([l]) => l.Statut === "Fermée").length, nbNew = vis.filter(([l]) => !l.id).length;
    const corps = vis.map(([l, i]) => {
      const cl = !l.id ? "new" : l.Statut === "Fermée" ? "ferme" : changeChamp("formations", l, "Remarque") ? "change" : "";
      const statut = !l.id ? `<span class="pill new">Nouvelle</span><button class="mini" data-suppr="formations" data-i="${i}">Retirer</button>`
        : `<span class="seg" role="group" aria-label="Statut"><button data-statut="Maintenue" data-i="${i}" aria-pressed="${l.Statut !== "Fermée"}">Maintenue</button><button class="fermee" data-statut="Fermée" data-i="${i}" aria-pressed="${l.Statut === "Fermée"}">Fermée</button></span>`;
      return `<div class="ligne ${cl}"><span class="nom">${esc(l.Intitule)}${l.Remarque ? `<span class="rem">${esc(l.Remarque)}</span>` : ""}</span>${statut}</div>`;
    }).join("");
    return pli("fil:" + fil, fil, `<span class="pill">${vis.length}</span>` + (nbFerm ? `<span class="pill ferme">${nbFerm} fermée${nbFerm > 1 ? "s" : ""}</span>` : "") + (nbNew ? `<span class="pill new">${nbNew} nouvelle${nbNew > 1 ? "s" : ""}</span>` : ""), corps);
  }).join("");
  const options = REF.map(r => `<option value="${esc(libRef(r))}">`).join("");
  const blocFormations = `<section class="carte"><div class="entete"><h2>Formations proposées : ${nbF}</h2>
      <span><button class="mini" data-tout="fil:" data-ouvre="1">Tout déplier</button> <button class="mini" data-tout="fil:" data-ouvre="">Tout replier</button></span></div>
    ${filieres || `<p class="etat">Aucune formation pour l'instant.</p>`}
    <div class="nouvelle"><b>Ajouter une formation</b>
      ${CHOIX ? `<div class="champ">Formation choisie dans la liste officielle
        <div class="choisie"><span class="verrou" aria-hidden="true">✓</span><input id="nvFormation" value="${esc(libRef(CHOIX))}" readonly aria-readonly="true">
        <button class="mini" id="changerFormation">Changer</button></div></div>`
      : `<label class="champ">Diplôme et intitulé — choisir dans la liste officielle
        <input id="nvFormation" list="listeRef" placeholder="Tapez quelques lettres, puis choisissez dans la liste"></label>
      <datalist id="listeRef">${options}</datalist>`}
      <label class="champ">Remarque (facultatif)<input id="nvRemarque" placeholder="Ex. : possible aussi sur un autre site"></label>
      <span class="invalide" id="nvErreur"></span>
      <button class="btn sec" id="ajoutFormation"${CHOIX ? "" : " disabled"}>Ajouter cette formation</button></div></section>`;

  // Accompagnement par groupe
  const ga = grouper(ETAT.accomp, "Groupe");
  const groupes = [...ga].map(([g, items]) => {
    const vis = items.filter(([l]) => !l._suppr);
    const corps = vis.map(([l, i]) => `<label class="coche"><input type="checkbox" data-coche="${i}"${l.Cochee ? " checked" : ""}>${esc(l.Action)}${!l.id ? ` <span class="pill new">Ajoutée</span>` : ""}</label>`).join("");
    return pli("acc:" + g, g, `<span class="pill">${vis.filter(([l]) => l.Cochee).length}/${vis.length} cochées</span>`, corps);
  }).join("");
  const blocAccomp = `<section class="carte"><div class="entete"><h2>Modalités d'accompagnement</h2>
      <span><button class="mini" data-tout="acc:" data-ouvre="1">Tout déplier</button> <button class="mini" data-tout="acc:" data-ouvre="">Tout replier</button></span></div>
    ${groupes}
    <div class="nouvelle"><label class="champ">Autre action proposée<input id="nvAction" placeholder="Décrivez l'action"></label>
      <button class="btn sec" id="ajoutAction">Ajouter cette action</button></div></section>`;

  const envoi = `<section class="carte">
    <label class="coche"><input type="checkbox" id="certif"${CERTIF ? " checked" : ""}>Je certifie l'exactitude de ces informations.</label>
    ${bandeau()}
    <div class="actions">
      <button class="btn sec" id="enregistrer">Enregistrer et finir plus tard</button>
      <button class="btn" id="envoyer">Envoyer ma fiche</button></div>
    <p class="etat">Rien n'a changé ? Cochez la case et envoyez la fiche telle quelle.</p></section>`;

  app.innerHTML = `${choix}${bandeau("haut")}<p class="info">Vos informations de l'an dernier sont déjà remplies. Modifiez seulement ce qui a changé, puis cliquez sur « Envoyer ma fiche ». Vous pouvez enregistrer et revenir plus tard avec le même lien.</p>
    <div class="colonnes"><div class="cote"><section class="carte">${etab}</section><section class="carte">${blocContacts}</section></div>
    <div class="principal">${blocFormations}${blocAccomp}${envoi}</div></div>`;
}

// ---------- Interactions ----------
app.addEventListener("toggle", e => {
  const d = e.target; if (!d.dataset || !d.dataset.pli) return;
  d.open ? OUVERTS.add(d.dataset.pli) : OUVERTS.delete(d.dataset.pli);
}, true);

app.addEventListener("input", e => {
  const el = e.target, { t, i, c } = el.dataset;
  if (el.id === "nvFormation" && !CHOIX) {
    const r = trouverRef(el.value);
    if (r) { CHOIX = r; afficher(); const rem = document.getElementById("nvRemarque"); if (rem) rem.focus(); }
    return;
  }
  if (!t) return;
  const ligne = t === "fiche" ? FICHE : ETAT[t][+i];
  ligne[c] = el.value;
  const lab = el.closest("label");
  lab.classList.toggle("change", changeChamp(t, ligne, c));
  lab.querySelector(".invalide").textContent = controle(c, el.value);
  const n = nbModifs();
  document.getElementById("resume").innerHTML = n ? `<span class="pill modif">${n} modification${n > 1 ? "s" : ""}</span>` : `<span class="pill">Aucune modification</span>`;
});

app.addEventListener("change", e => {
  const el = e.target;
  if (el.id === "choixFiche") { FICHE = FICHES.find(f => f.id === +el.value); MESSAGE = null; return charger(); }
  if (el.id === "certif") { CERTIF = el.checked; return; }
  if (el.dataset.coche !== undefined) { ETAT.accomp[+el.dataset.coche].Cochee = el.checked; afficher(); }
});

app.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = b.dataset;
  if (d.statut) { ETAT.formations[+d.i].Statut = d.statut; return afficher(); }
  if (d.suppr) { const l = ETAT[d.suppr][+d.i]; if (l.id) l._suppr = true; else ETAT[d.suppr].splice(+d.i, 1); return afficher(); }
  if (d.ajout === "contacts") { ETAT.contacts.push({ Fiche: FICHE.id, Pole: "", Nom: "", Telephone: "", Mail: "" }); OUVERTS.add("contacts"); OUVERTS.add("contact" + (ETAT.contacts.length - 1)); return afficher(); }
  if (d.tout !== undefined) { app.querySelectorAll(`details[data-pli^="${d.tout}"]`).forEach(x => { x.open = !!d.ouvre; }); return; }
  if (b.id === "ajoutFormation") return ajouterFormation();
  if (b.id === "changerFormation") { CHOIX = null; afficher(); const f = document.getElementById("nvFormation"); if (f) f.focus(); return; }
  if (b.id === "ajoutAction") {
    const v = document.getElementById("nvAction").value.trim(); if (!v) return;
    ETAT.accomp.push({ Fiche: FICHE.id, Groupe: "Autres actions", Action: v, Cochee: true }); OUVERTS.add("acc:Autres actions"); return afficher();
  }
  if (b.id === "enregistrer") return enregistrer(false);
  if (b.id === "envoyer") {
    if (!CERTIF) { MESSAGE = { cl: "err", txt: "Cochez la case de certification avant d'envoyer." }; return afficher(); }
    return enregistrer(true);
  }
});

function ajouterFormation() {
  const ref = CHOIX;
  if (!ref) { document.getElementById("nvErreur").textContent = "Choisissez un intitulé dans la liste proposée (formation absente : signalez-la au SAIO)."; return; }
  const intitule = libRef(ref);
  if (ETAT.formations.some(l => !l._suppr && l.Intitule === intitule)) { CHOIX = null; afficher(); document.getElementById("nvErreur").textContent = "Cette formation figure déjà dans la fiche."; return; }
  ETAT.formations.push({ Fiche: FICHE.id, Intitule: intitule, Filiere: ref.Filiere || "Autres", Statut: "Nouvelle", Remarque: document.getElementById("nvRemarque").value.trim() });
  OUVERTS.add("fil:" + (ref.Filiere || "Autres"));
  CHOIX = null;
  afficher();
}

// ---------- Enregistrement dans Grist ----------
const TABLES = { contacts: "Contacts", formations: "Formations", accomp: "Accompagnement" };
const COLS = { contacts: ["Pole", "Nom", "Telephone", "Mail"], formations: ["Intitule", "Filiere", "Statut", "Remarque"], accomp: ["Groupe", "Action", "Cochee"] };

function actions(soumettre) {
  const a = [];
  const majFiche = {};
  for (const [c] of CHAMPS_FICHE) if (c in FICHE && changeChamp("fiche", null, c)) majFiche[c] = FICHE[c];
  if (soumettre) majFiche.Soumise_le = Date.now() / 1000;
  if (Object.keys(majFiche).length) a.push(["UpdateRecord", "Fiches", FICHE.id, majFiche]);
  for (const t in TABLES) for (const l of ETAT[t]) {
    const champs = {}; COLS[t].forEach(c => { if (c in l) champs[c] = l[c]; });
    if (!l.id) { if (!l._suppr) a.push(["AddRecord", TABLES[t], null, { Fiche: FICHE.id, ...champs }]); continue; }
    if (l._suppr) { a.push(["RemoveRecord", TABLES[t], l.id]); continue; }
    const o = orig(t, l.id), diff = {};
    COLS[t].forEach(c => { if (c in l && String(o[c] ?? "") !== String(l[c] ?? "")) diff[c] = l[c]; });
    if (Object.keys(diff).length) a.push(["UpdateRecord", TABLES[t], l.id, diff]);
  }
  return a;
}

async function enregistrer(soumettre) {
  const a = actions(soumettre);
  if (!DANS_GRIST) {
    MESSAGE = { cl: "ok", txt: soumettre ? `Fiche envoyée au SAIO. Merci ! (démonstration : ${a.length} changement(s))` : `Enregistré (démonstration : ${a.length} changement(s)).` };
    afficher(); const h = document.getElementById("haut"); if (h) h.scrollIntoView({ block: "start" }); return;
  }
  try {
    if (a.length) await grist.docApi.applyUserActions(a);
    MESSAGE = { cl: "ok", txt: soumettre ? "Fiche envoyée au SAIO. Merci ! Vous pouvez encore la corriger avec le même lien." : "Enregistré. Vous pouvez revenir plus tard avec le même lien." };
    await charger();
  } catch (err) {
    MESSAGE = { cl: "err", txt: "L'enregistrement a été refusé : " + (err && err.message ? err.message : err) };
    afficher();
  }
  const h = document.getElementById("haut"); if (h) h.scrollIntoView({ behavior: "smooth", block: "start" });
}

if (DANS_GRIST) {
  grist.ready({ requiredAccess: "full" });
  grist.onRecords(() => { if (!ORIG || !nbModifs()) charger(); });
}
charger();
