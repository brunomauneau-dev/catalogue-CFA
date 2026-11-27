// Formulaire de mise à jour de la fiche de renseignement d'un CFA (widget personnalisé Grist).
// L'établissement arrive par un lien personnel (?Code_=…) : les règles d'accès du document ne lui
// laissent voir que sa fiche et ses lignes (formations, contacts, accompagnement).
// Tables attendues : Fiches, Formations, Contacts, Accompagnement (colonne Fiche = référence), Referentiel.
// Hors de Grist, la page s'affiche avec des données fictives (démonstration).
// Intégré au tableau de suivi (window.FORMULAIRE_INTEGRE = { app, titre, resume }) : s'affiche dans le panneau
// latéral du suivi et s'ouvre par FormulaireFiche.ouvrir(id).
(function () {
"use strict";

const INTEGRE = window.FORMULAIRE_INTEGRE || null;
const elTitre = () => (INTEGRE ? INTEGRE.titre : document.getElementById("titre"));
const elResume = () => (INTEGRE ? INTEGRE.resume : document.getElementById("resume"));
const DANS_GRIST = window.parent !== window;
const CHAMPS_FICHE = [
  ["Etablissement", "Nom de l'établissement"], ["Site", "Site de formation"], ["Adresse", "Adresse"],
  ["Code_postal", "Code postal"], ["Ville", "Ville"], ["Telephone", "Téléphone"], ["Mail", "Mail"], ["Site_internet", "Site internet"],
];
const PRESENTATION = "Presentation_accompagnement"; // texte d'introduction de l'accompagnement (facultatif)
const CHAMPS_CONTACT = [["Fonction", "Fonction / pôle"], ["Nom", "Nom"], ["Telephone", "Téléphone"], ["Mail", "Mail"]];

let FICHES = [], FICHE = null, ORIG = null, REF = [];
let ETAT = { contacts: [], formations: [], accomp: [] };
let OUVERTS = new Set(["etab", "contacts"]);
let MESSAGE = null, CERTIF = false, MOTIF = "";
const SAIO = () => FICHES.length > 1;
const fermee = () => SAIO() && FICHE && "Code_actif" in FICHE && !FICHE.Code_actif; // fiche d'une campagne close // propriétaire du document : modification par le SAIO
let ATTENTE = false; // formulaire relié au suivi, aucune fiche choisie
let CHOIX = null; // formation choisie dans le référentiel (le champ est alors verrouillé)

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = INTEGRE ? INTEGRE.app : document.getElementById("app");

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
  if (ATTENTE) { REF = re; app.innerHTML = `<p class="info">Cliquez sur un établissement dans le tableau de suivi pour afficher sa fiche ici.</p>`; elTitre().textContent = "Fiche de renseignement"; elResume().innerHTML = ""; return; }
  const garde = FICHE && f.find(x => x.id === FICHE.id); // fiche demandée (ex. depuis le suivi), même d'une autre campagne
  if (garde && !FICHES.includes(garde)) FICHES = [garde, ...FICHES];
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
  FICHES = [{ id: 1, Presentation_accompagnement: "Le service accompagne les candidats dans leur recherche d'entreprise (texte fictif).", Etablissement: "CFA Exemple (démonstration)", Site: "Site de Villeneuve", Adresse: "1 rue Imaginaire", Code_postal: "00000", Ville: "Villeneuve", Telephone: "05 00 00 00 00", Mail: "contact@exemple.fr" }];
  if (INTEGRE) FICHES.push({ id: 2, Etablissement: "Autre CFA (démonstration)" }); // mode SAIO
  FICHE = FICHES[0];
  REF = [["CAP", "Maçon", "Bâtiment, Travaux publics"], ["CAP", "Couvreur", "Bâtiment, Travaux publics"], ["CAP", "Carreleur mosaïste", "Bâtiment, Travaux publics"], ["CAP", "Cuisine", "Hôtellerie, Restauration"], ["Bac pro", "Métiers de l'accueil", "Commerce, Vente, Logistique"]]
    .map(([Diplome, Intitule, Filiere], i) => ({ id: i + 1, Diplome, Intitule, Filiere }));
  ETAT = {
    contacts: [{ id: 1, Fiche: 1, Fonction: "Bâtiment", Nom: "Prénom NOM", Telephone: "05 00 00 00 01", Mail: "contact1@exemple.fr" },
               { id: 2, Fiche: 1, Fonction: "Site de Villeneuve", Nom: "", Telephone: "05 00 00 00 02", Mail: "" }], // exemple de contact mal lu (« À vérifier »)
    formations: [{ id: 1, Fiche: 1, Intitule: "CAP Maçon", Filiere: "Bâtiment, Travaux publics", Statut: "Maintenue" },
                 { id: 2, Fiche: 1, Intitule: "CAP Couvreur", Filiere: "Bâtiment, Travaux publics", Statut: "Maintenue" }],
    accomp: [{ id: 1, Fiche: 1, Groupe: "Candidature et entretien", Action: "Entretien individuel", Cochee: true },
             { id: 2, Fiche: 1, Groupe: "Recherche d'entreprise", Action: "Job dating", Cochee: false }],
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
  let n = [...CHAMPS_FICHE, [PRESENTATION]].filter(([c]) => c in ORIG.fiche || FICHE[c]).filter(([c]) => changeChamp("fiche", null, c)).length;
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
  if (/telephone/i.test(champ) && v.split("/").some(t => t.replace(/\D/g, "").replace(/^33(?=\d{9}$)/, "0").length !== 10)) return "10 chiffres attendus (plusieurs numéros : séparez-les par « / »)";
  if (champ === "Code_postal" && !/^\d{5}$/.test(v.replace(/\s/g, ""))) return "5 chiffres attendus";
  return "";
}
// Mise en forme commune (mêmes règles que la normalisation des fiches 2026) : la comparaison ne signale que les vrais changements
function formater(champ, v) {
  if (typeof v !== "string") return v;
  let s = v.replace(/\s+/g, " ").trim();
  if (/telephone/i.test(champ)) s = s.split("/").map(t => { const ch = t.replace(/\D/g, "").replace(/^33(?=\d{9}$)/, "0"); return /^0\d{9}$/.test(ch) ? ch.replace(/(\d{2})(?=\d)/g, "$1 ") : t.trim(); }).join(" / ");
  else if (/mail/i.test(champ)) s = s.replace(/\s/g, "").toLowerCase();
  else if (champ === "Site_internet") s = s.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  else if (champ === "Code_postal") s = s.replace(/\s/g, "");
  return s;
}
const TYPES = { Telephone: ' type="tel" inputmode="tel" autocomplete="tel"', Mail: ' type="email" inputmode="email" autocomplete="email"', Code_postal: ' inputmode="numeric" autocomplete="postal-code" maxlength="6"', Site_internet: ' inputmode="url"' };

// Contact repris du catalogue 2026 qui semble mal lu (fonction contenant un nom, un site, une formation, un paragraphe…).
// Règle partagée avec le suivi (window.contactAVerifier). Ne lit que la forme du texte.
function contactAVerifier(c) {
  const f = String(c.Fonction || "").trim();
  if (!f && !String(c.Nom || "").trim()) return "ni nom ni fonction";
  if (/\b[A-ZÉÈ][a-zéèëïî]+(?:-[A-ZÉ][a-zéè]+)?\s+[A-ZÉÈ]{2,}(?:[- ][A-ZÉÈ]{2,})*\b/.test(f)) return "un nom semble mêlé à la fonction";
  if (/^(Site|Sites|Agence|Agences|Antenne)\b/.test(f)) return "la fonction contient un nom de site";
  if (/^(BAC|Bac|CAP|CAPA|CAPa|BP|BTS)\b/.test(f)) return "la fonction contient un intitulé de formation";
  if (f.length > 90) return "fonction trop longue";
  const lettres = f.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (lettres.length > 6 && lettres === lettres.toUpperCase()) return "fonction en majuscules, peut-être tronquée";
  return "";
}
window.contactAVerifier = contactAVerifier;
const libRef = r => (r.Diplome ? r.Diplome + " " : "") + r.Intitule;
const simple = s => String(s ?? "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase(); // apostrophe droite ou typographique
const trouverRef = v => REF.find(r => simple(libRef(r)) === simple(v));

// ---------- Affichage ----------
function champ(table, idx, c, libelle, ligne) {
  const v = ligne[c] ?? "";
  const ch = changeChamp(table, ligne, c);
  const err = controle(c, v);
  return `<label class="champ${ch ? " change" : ""}">${esc(libelle)}
    <input data-t="${table}" data-i="${idx}" data-c="${c}" value="${esc(v)}"${TYPES[c] || ""}>
    <span class="invalide">${esc(err)}</span></label>`;
}

function pli(cle, titre, pastilles, corps) {
  return `<details class="pli" data-pli="${esc(cle)}"${OUVERTS.has(cle) ? " open" : ""}>
    <summary><span class="nomgrp">${esc(titre)}</span>${pastilles}</summary><div class="corps">${corps}</div></details>`;
}

const CATEGORIES_ACC = ["Information", "Candidature et entretien", "Découverte et immersion", "Recherche d'entreprise", "Signature du contrat et suivi", "Aides et conditions de formation", "Autres actions"];
const rangAcc = g => { const i = CATEGORIES_ACC.indexOf(g); return i < 0 ? CATEGORIES_ACC.length : i; };
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
  elTitre().textContent = `${INTEGRE ? "" : "Votre fiche — "}${FICHE.Etablissement || ""}${FICHE.Site ? ", " + FICHE.Site : ""}`;
  elResume().innerHTML = (FICHE.Soumise_le ? `<span class="pill">Envoyée</span> ` : "") +
    (n ? `<span class="pill modif">${n} modification${n > 1 ? "s" : ""}</span>` : `<span class="pill">Aucune modification</span>`);

  const choix = ""; // la fiche se choisit en cliquant sur l'établissement dans le tableau de suivi

  // Établissement
  const etab = pli("etab", "Établissement", "", CHAMPS_FICHE.filter(([c]) => c in FICHE).map(([c, lib]) => champ("fiche", 0, c, lib, FICHE)).join(""));

  // Contacts
  const vivants = ETAT.contacts.map((l, i) => [l, i]).filter(([l]) => !l._suppr);
  const titreContact = l => { const t = [l.Fonction, l.Nom].filter(Boolean).join(" · ") || "Nouveau contact"; return t.length > 70 ? t.slice(0, 67).replace(/\s+\S*$/, "") + "…" : t; };
  const aVerifier = vivants.filter(([l]) => l.id && contactAVerifier(l)).length;
  const contacts = vivants.map(([l, i]) => pli("contact" + i, titreContact(l),
      (!l.id ? `<span class="pill new">Nouveau</span>` : "") + (l.id && contactAVerifier(l) ? `<span class="pill a-verifier" title="${esc(contactAVerifier(l))}">À vérifier</span>` : ""),
      CHAMPS_CONTACT.map(([c, lib]) => champ("contacts", i, c, lib, l)).join("") +
      `<button class="mini" data-suppr="contacts" data-i="${i}">Retirer ce contact</button>`)).join("");
  const blocContacts = pli("contacts", "Contacts", `<span class="pill">${vivants.length}</span>`,
    (aVerifier ? `<p class="note-verif">${aVerifier > 1 ? `${aVerifier} contacts repris du catalogue de l'an dernier semblent mal lus` : "Un contact repris du catalogue de l'an dernier semble mal lu"} (pastille « À vérifier ») : corrigez la fonction et le nom, ou retirez le contact s'il n'est plus d'actualité.</p>` : "") +
    contacts + `<button class="ajout" data-ajout="contacts">+ Ajouter un contact</button>`);

  // Formations par filière
  const gf = grouper(ETAT.formations, "Filiere");
  // CFA à plusieurs sites : le lieu de chaque formation est modifiable (colonne Formations.Lieu)
  const MULTI = ETAT.formations.some(l => !l._suppr && l.Lieu);
  let nbF = 0;
  const filieres = [...gf].map(([fil, items]) => {
    const vis = items.filter(([l]) => !l._suppr);
    nbF += vis.filter(([l]) => l.Statut !== "Fermée").length;
    const nbFerm = vis.filter(([l]) => l.Statut === "Fermée").length, nbNew = vis.filter(([l]) => !l.id).length;
    const corps = vis.map(([l, i]) => {
      const cl = !l.id ? "new" : l.Statut === "Fermée" ? "ferme" : changeChamp("formations", l, "Remarque") || changeChamp("formations", l, "Lieu") ? "change" : "";
      const lieu = MULTI ? `<label class="lieu-ligne${changeChamp("formations", l, "Lieu") ? " change" : ""}">Site<input data-t="formations" data-i="${i}" data-c="Lieu" value="${esc(l.Lieu || "")}" placeholder="Site de formation"><span class="invalide"></span></label>` : "";
      const statut = !l.id ? `<span class="pill new">Nouvelle</span><button class="mini" data-suppr="formations" data-i="${i}">Retirer</button>`
        : `<span class="seg" role="group" aria-label="Statut"><button data-statut="Maintenue" data-i="${i}" aria-pressed="${l.Statut !== "Fermée"}">Maintenue</button><button class="fermee" data-statut="Fermée" data-i="${i}" aria-pressed="${l.Statut === "Fermée"}">Fermée</button></span>`;
      return `<div class="ligne ${cl}"><span class="nom">${esc(l.Intitule)}${l.Remarque ? `<span class="rem">${esc(l.Remarque)}</span>` : ""}${lieu}</span>${statut}</div>`;
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
      <label class="champ">Site de formation (si votre établissement a plusieurs sites)<input id="nvLieu" placeholder="Ex. : Site de Bayonne"></label>
      <label class="champ">Remarque (facultatif)<input id="nvRemarque" placeholder="Ex. : en 2 ans"></label>
      <span class="invalide" id="nvErreur"></span>
      <button class="btn sec" id="ajoutFormation"${CHOIX ? "" : " disabled"}>Ajouter cette formation</button></div></section>`;

  // Accompagnement par groupe
  // catégories d'accompagnement dans l'ordre du parcours du jeune (les autres à la suite)
  const ga = new Map([...grouper(ETAT.accomp, "Groupe")].sort(([a], [b]) => rangAcc(a) - rangAcc(b)));
  const groupes = [...ga].map(([g, items]) => {
    const vis = items.filter(([l]) => !l._suppr);
    const corps = vis.map(([l, i]) => `<label class="coche"><input type="checkbox" data-coche="${i}"${l.Cochee ? " checked" : ""}>${esc(l.Action)}${!l.id ? ` <span class="pill new">Ajoutée</span>` : ""}</label>`).join("");
    return pli("acc:" + g, g, `<span class="pill">${vis.filter(([l]) => l.Cochee).length}/${vis.length} cochées</span>`, corps);
  }).join("");
  const blocAccomp = `<section class="carte"><div class="entete"><h2>Modalités d'accompagnement</h2>
      <span><button class="mini" data-tout="acc:" data-ouvre="1">Tout déplier</button> <button class="mini" data-tout="acc:" data-ouvre="">Tout replier</button></span></div>
    ${PRESENTATION in FICHE ? `<label class="champ${changeChamp("fiche", FICHE, PRESENTATION) ? " change" : ""}">Présentation de votre accompagnement (quelques lignes)
      <textarea data-t="fiche" data-i="0" data-c="${PRESENTATION}" rows="4">${esc(FICHE[PRESENTATION])}</textarea><span class="invalide"></span></label>` : ""}
    ${groupes}
    <div class="nouvelle"><label class="champ">Autre action proposée<input id="nvAction" placeholder="Décrivez l'action en une phrase courte"></label>
      <label class="champ">Catégorie<select id="nvGroupe">${CATEGORIES_ACC.map(c => `<option${c === "Autres actions" ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <button class="btn sec" id="ajoutAction">Ajouter cette action</button></div></section>`;

  const envoi = SAIO() ? `<section class="carte"><h2>Modification par le SAIO</h2>
    <label class="champ">Origine de la demande (facultatif)<input id="motif" value="${esc(MOTIF)}" placeholder="Ex. : appel du CFA le 12/01, erreur de téléphone"></label>
    ${bandeau()}
    <div class="actions"><button class="btn" id="enregistrerSaio">Enregistrer les modifications</button></div>
    <p class="etat">L'enregistrement est noté dans les correspondances de la fiche.</p></section>` : `<section class="carte">
    <label class="coche"><input type="checkbox" id="certif"${CERTIF ? " checked" : ""}>Je certifie l'exactitude de ces informations.</label>
    ${bandeau()}
    <div class="actions">
      <button class="btn sec" id="enregistrer">Enregistrer et finir plus tard</button>
      <button class="btn" id="envoyer">Envoyer ma fiche</button></div>
    <p class="etat">Rien n'a changé ? Cochez la case et envoyez la fiche telle quelle.</p></section>`;

  app.innerHTML = `${choix}${bandeau("haut")}${FICHE && /^autre|^tous d/i.test(FICHE.Departement || "") ? `<p class="bandeau ok" style="margin-bottom:12px;font-size:15px">${SAIO() ? "Fiche fournie en PDF par l'établissement : déposez le PDF reçu avec « Déposer le PDF reçu » dans le suivi ; c'est lui qui figure dans le catalogue, tel quel." : "Votre fiche figure dans le catalogue sous la forme du document PDF que vous transmettez au SAIO : envoyez-lui la version à jour par mail."}</p>` : ""}<p class="info">${fermee() ? "Fiche d'une campagne close, en consultation seule : elle sert de base de comparaison." : SAIO() ? "Mode SAIO : vous modifiez directement la fiche de l'établissement (par exemple à sa demande, par téléphone ou par mail), puis cliquez sur « Enregistrer les modifications » en bas de page." : "Vos informations de l'an dernier sont déjà remplies. Modifiez seulement ce qui a changé, puis cliquez sur « Envoyer ma fiche ». Vous pouvez enregistrer et revenir plus tard avec le même lien."}</p>
    <div class="colonnes"><div class="cote"><section class="carte">${etab}</section><section class="carte">${blocContacts}</section></div>
    <div class="principal">${blocFormations}${blocAccomp}${envoi}</div></div>`;
  // Fiche d'une campagne close : consultation seule (base de comparaison)
  if (SAIO() && "Code_actif" in FICHE && !FICHE.Code_actif) {
    app.querySelectorAll("input, textarea, button").forEach(el => { if (!el.dataset.tout) el.disabled = true; });
    const sec = app.querySelector(".principal > section:last-child"); if (sec) sec.innerHTML = `<p class="info" style="margin:0">Fiche d'une campagne close : consultation seule. Elle sert de base de comparaison.</p>`;
  }
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
  elResume().innerHTML = n ? `<span class="pill modif">${n} modification${n > 1 ? "s" : ""}</span>` : `<span class="pill">Aucune modification</span>`;
});

app.addEventListener("change", e => {
  const el = e.target;
  if (el.id === "certif") { CERTIF = el.checked; return; }
  if (el.id === "motif") { MOTIF = el.value; return; }
  if (el.dataset.coche !== undefined) { ETAT.accomp[+el.dataset.coche].Cochee = el.checked; afficher(); }
  const { t, i, c } = el.dataset;
  if (t === "contacts" && (c === "Fonction" || c === "Nom")) { const v = formater(c, el.value); ETAT.contacts[+i][c] = v; OUVERTS.add("contact" + i); return afficher(); }
  if (t && c && el.tagName === "INPUT") { // sortie du champ : mise en forme (téléphone 05 56 00 00 00, mail en minuscules…)
    const v = formater(c, el.value);
    if (v !== el.value) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }
  }
});

app.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = b.dataset;
  if (d.statut) { ETAT.formations[+d.i].Statut = d.statut; return afficher(); }
  if (d.suppr) { const l = ETAT[d.suppr][+d.i]; if (l.id) l._suppr = true; else ETAT[d.suppr].splice(+d.i, 1); return afficher(); }
  if (d.ajout === "contacts") { ETAT.contacts.push({ Fiche: FICHE.id, Fonction: "", Nom: "", Telephone: "", Mail: "" }); OUVERTS.add("contacts"); OUVERTS.add("contact" + (ETAT.contacts.length - 1)); return afficher(); }
  if (d.tout !== undefined) { app.querySelectorAll(`details[data-pli^="${d.tout}"]`).forEach(x => { x.open = !!d.ouvre; }); return; }
  if (b.id === "ajoutFormation") return ajouterFormation();
  if (b.id === "changerFormation") { CHOIX = null; afficher(); const f = document.getElementById("nvFormation"); if (f) f.focus(); return; }
  if (b.id === "ajoutAction") {
    const v = document.getElementById("nvAction").value.trim(); if (!v) return;
    const grp = (document.getElementById("nvGroupe") || {}).value || "Autres actions";
    ETAT.accomp.push({ Fiche: FICHE.id, Groupe: grp, Action: v, Cochee: true }); OUVERTS.add("acc:" + grp); return afficher();
  }
  if (b.id === "enregistrer") return enregistrer(false);
  if (b.id === "enregistrerSaio") return enregistrer(false, true);
  if (b.id === "envoyer") {
    if (!CERTIF) { MESSAGE = { cl: "err", txt: "Cochez la case de certification avant d'envoyer." }; return afficher(); }
    if (!String(FICHE.Etablissement || "").trim()) { MESSAGE = { cl: "err", txt: "Indiquez le nom de l'établissement avant d'envoyer." }; return afficher(); }
    const fautes = erreursFormat();
    if (fautes) { MESSAGE = { cl: "err", txt: `${fautes} champ${fautes > 1 ? "s ont" : " a"} un format à corriger (signalé${fautes > 1 ? "s" : ""} en rouge). Vous pouvez aussi enregistrer et finir plus tard.` }; return afficher(); }
    return enregistrer(true);
  }
});

function ajouterFormation() {
  const ref = CHOIX;
  if (!ref) { document.getElementById("nvErreur").textContent = "Choisissez un intitulé dans la liste proposée (formation absente : signalez-la au SAIO)."; return; }
  const intitule = libRef(ref);
  const lieuNv = ((document.getElementById("nvLieu") || {}).value || "").trim();
  if (ETAT.formations.some(l => !l._suppr && simple(l.Intitule) === simple(intitule) && String(l.Lieu || "").trim() === lieuNv)) { CHOIX = null; afficher(); document.getElementById("nvErreur").textContent = "Cette formation figure déjà dans la fiche."; return; }
  const lieu = (document.getElementById("nvLieu") || {}).value || "";
  ETAT.formations.push({ Fiche: FICHE.id, Intitule: intitule, Filiere: ref.Filiere || "Autres", Statut: "Nouvelle", Remarque: document.getElementById("nvRemarque").value.trim(), ...(lieu.trim() ? { Lieu: lieu.trim() } : {}) });
  OUVERTS.add("fil:" + (ref.Filiere || "Autres"));
  CHOIX = null;
  afficher();
}

// Nombre de champs au format incorrect (fiche et contacts conservés)
function erreursFormat() {
  let n = CHAMPS_FICHE.filter(([c]) => controle(c, FICHE[c])).length;
  for (const l of ETAT.contacts) if (!l._suppr) n += CHAMPS_CONTACT.filter(([c]) => controle(c, l[c])).length;
  return n;
}

// ---------- Enregistrement dans Grist ----------
const TABLES = { contacts: "Contacts", formations: "Formations", accomp: "Accompagnement" };
const COLS = { contacts: ["Fonction", "Nom", "Telephone", "Mail"], formations: ["Intitule", "Filiere", "Statut", "Remarque", "Lieu"], accomp: ["Groupe", "Action", "Cochee"] };

function actions(soumettre) {
  for (const [c] of CHAMPS_FICHE) if (c in FICHE) FICHE[c] = formater(c, FICHE[c]);
  for (const t of ["contacts", "formations"]) for (const l of ETAT[t]) for (const c of COLS[t]) if (c in l) l[c] = formater(c, l[c]);
  const a = [];
  const majFiche = {};
  for (const [c] of [...CHAMPS_FICHE, [PRESENTATION]]) if (c in FICHE && changeChamp("fiche", null, c)) majFiche[c] = FICHE[c];
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

async function enregistrer(soumettre, parSaio) {
  const a = actions(soumettre);
  if (parSaio) {
    if (!a.length) { MESSAGE = { cl: "err", txt: "Aucune modification à enregistrer." }; return afficher(); }
    a.push(["AddRecord", "Correspondances", null, { Fiche: FICHE.id, Date: Math.floor(Date.now() / 86400000) * 86400, Type: "Note",
      Objet: "Fiche modifiée par le SAIO", Resume: `${MOTIF ? MOTIF + " — " : ""}${a.length} modification${a.length > 1 ? "s" : ""} enregistrée${a.length > 1 ? "s" : ""}` }]);
  }
  if (!DANS_GRIST) {
    MESSAGE = { cl: "ok", txt: soumettre ? `Fiche envoyée au SAIO. Merci ! (démonstration : ${a.length} changement${a.length > 1 ? "s" : ""})` : `Enregistré (démonstration : ${a.length} changement${a.length > 1 ? "s" : ""}).` };
    afficher(); const h = document.getElementById("haut"); if (h) h.scrollIntoView({ block: "start" }); return;
  }
  try {
    if (a.length) await grist.docApi.applyUserActions(a);
    MESSAGE = { cl: "ok", txt: parSaio ? "Modifications enregistrées et notées dans les correspondances." : soumettre ? "Fiche envoyée au SAIO. Merci ! Vous pouvez encore la corriger avec le même lien." : "Enregistré. Vous pouvez revenir plus tard avec le même lien." };
    if (parSaio) MOTIF = "";
    await charger();
  } catch (err) {
    MESSAGE = { cl: "err", txt: "L'enregistrement a été refusé : " + (err && err.message ? err.message : err) };
    afficher();
  }
  const h = document.getElementById("haut"); if (h) h.scrollIntoView({ behavior: "smooth", block: "start" });
}

if (INTEGRE) {
  window.FormulaireFiche = {
    ouvrir(id) { ATTENTE = false; FICHE = { id }; ORIG = null; MESSAGE = null; MOTIF = ""; CHOIX = null; OUVERTS = new Set(["etab", "contacts"]); return charger(); },
    modifie() { return !!(ORIG && FICHE && nbModifs()); },
    rafraichir() { if (FICHE && (!ORIG || !nbModifs())) charger(); },
  };
} else if (DANS_GRIST) {
  grist.ready({ requiredAccess: "full" });
  grist.onRecords(() => { if (!ORIG || !nbModifs()) charger(); });
  // Fiche choisie dans le tableau de suivi (widget relié « Sélectionner par »)
  grist.onRecord(r => {
    if (r && FICHE && r.id === FICHE.id && !ATTENTE) return;
    if (ORIG && !ATTENTE && nbModifs()) { MESSAGE = { cl: "err", txt: "Des modifications ne sont pas enregistrées : enregistrez-les avant d'ouvrir une autre fiche." }; return afficher(); }
    ATTENTE = !r; FICHE = r ? { id: r.id } : null; ORIG = r ? ORIG : null; MESSAGE = null; charger();
  });
}
if (!INTEGRE) charger();
})();
