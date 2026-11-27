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
let BASE = null;          // fiche telle qu'à l'ouverture (surlignage des changements de la séance)
let CLASSIQUE = false;    // l'établissement préfère le formulaire classique
let CAMPAGNE = null;      // campagne de la fiche (date limite)
const MSG_CFA = "Message_CFA"; // message libre de l'établissement au SAIO (colonne facultative de Fiches)
const PAGE = () => !INTEGRE && !SAIO() && !CLASSIQUE; // présentation « page du catalogue » pour l'établissement
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
  const [f, fo, co, ac, re, ca] = await Promise.all(["Fiches", "Formations", "Contacts", "Accompagnement", "Referentiel", "Campagnes"].map(lire));
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
  if (!BASE || BASE.fiche.id !== FICHE.id) BASE = copie(ORIG);
  CAMPAGNE = (ca || []).find(c => c.id === FICHE.Campagne) || null;
  afficher();
  // Première ouverture par l'établissement : on coche l'étape « Ouverte » du suivi.
  if (FICHES.length === 1 && "Ouverte_le" in FICHE && !FICHE.Ouverte_le) {
    grist.docApi.applyUserActions([["UpdateRecord", "Fiches", FICHE.id, { Ouverte_le: Date.now() / 1000 }]]).catch(() => {});
  }
}

function demo() {
  FICHES = [{ id: 1, Presentation_accompagnement: "Le service accompagne les candidats dans leur recherche d'entreprise (texte fictif).", Etablissement: "CFA Exemple (démonstration)", Site: "Site de Villeneuve", Departement: "Dordogne", Adresse: "1 rue Imaginaire", Code_postal: "00000", Ville: "Villeneuve", Telephone: "05 00 00 00 00", Mail: "contact@exemple.fr", Site_internet: "www.exemple.fr", Message_CFA: "" }];
  if (INTEGRE) FICHES.push({ id: 2, Etablissement: "Autre CFA (démonstration)" }); // mode SAIO
  FICHE = FICHES[0];
  REF = [["CAP", "Maçon", "Bâtiment, Travaux publics"], ["CAP", "Couvreur", "Bâtiment, Travaux publics"], ["CAP", "Carreleur mosaïste", "Bâtiment, Travaux publics"], ["CAP", "Peintre applicateur de revêtements", "Bâtiment, Travaux publics"], ["CAP", "Cuisine", "Hôtellerie, Restauration"], ["Bac pro", "Métiers de l’accueil", "Commerce, Vente, Logistique"], ["CAP", "Maintenance des matériels, option C matériels d’espaces verts", "Automobile, Engins, Nautisme"]]
    .map(([Diplome, Intitule, Filiere], i) => ({ id: i + 1, Diplome, Intitule, Filiere }));
  ETAT = {
    contacts: [{ id: 1, Fiche: 1, Fonction: "Bâtiment", Nom: "Prénom NOM", Telephone: "05 00 00 00 01", Mail: "contact1@exemple.fr" },
               { id: 2, Fiche: 1, Fonction: "Coordinatrice Prénom FICTIF", Nom: "", Telephone: "05 00 00 00 02", Mail: "" }], // exemple de contact mal lu (« À vérifier ») : nom mêlé à la fonction
    formations: [{ id: 1, Fiche: 1, Intitule: "CAP Maçon", Filiere: "Bâtiment, Travaux publics", Statut: "Maintenue" },
                 { id: 2, Fiche: 1, Intitule: "CAP Couvreur", Filiere: "Bâtiment, Travaux publics", Statut: "Maintenue" }],
    accomp: [{ id: 1, Fiche: 1, Groupe: "Candidature et entretien", Action: "Entretien individuel", Cochee: true },
             { id: 2, Fiche: 1, Groupe: "Recherche d'entreprise", Action: "Job dating", Cochee: false }],
  };
  ORIG = copie({ fiche: FICHE, ...ETAT });
  BASE = copie(ORIG);
  CAMPAGNE = { Annee: "2027", Date_limite: Date.UTC(2026, 11, 16) / 1000 };
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
  // « Prénom NOM » dans la fonction (les sigles courts comme CAP, MNA ou BTP ne comptent pas)
  if (/\b[A-ZÉÈ][a-zéèëïî]+(?:-[A-ZÉ][a-zéè]+)?\s+[A-ZÉÈ]{4,}(?:[- ][A-ZÉÈ]{2,})*\b/.test(f.replace(/\b(CAPA|SAPAT|CFAI|AFTRAL|INHNI|GRETA)\b/g, ""))) return "un nom semble mêlé à la fonction";
  if (String(c.Nom || "").trim() && /^(Site|Sites|Agence|Agences|Antenne)\b/.test(f)) return "la fonction contient un nom de site"; // contact générique d'un site : normal
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
  if (PAGE()) return afficherPage();
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
    // case : l'action figure ou non au catalogue ; texte modifiable (ex. mettre à jour une date)
    const corps = vis.map(([l, i]) => `<div class="action-ligne${l.Cochee ? "" : " decochee"}"><input type="checkbox" data-coche="${i}"${l.Cochee ? " checked" : ""} aria-label="Afficher cette action dans le catalogue">
      <label class="champ action-texte${changeChamp("accomp", l, "Action") ? " change" : ""}"><textarea rows="1" data-t="accomp" data-i="${i}" data-c="Action" aria-label="Texte de l'action">${esc(l.Action)}</textarea><span class="invalide"></span></label>
      ${!l.id ? `<span class="pill new">Ajoutée</span>` : ""}</div>`).join("");
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
    <p class="etat">Rien n'a changé ? Cochez la case et envoyez la fiche telle quelle.</p>
    ${CLASSIQUE ? `<button class="mini" id="versPage">Revenir à la présentation « catalogue »</button>` : ""}</section>`;

  app.innerHTML = `${choix}${bandeau("haut")}${FICHE && /^autre|^tous d/i.test(FICHE.Departement || "") ? `<p class="bandeau ok" style="margin-bottom:12px;font-size:15px">${SAIO() ? "Fiche fournie en PDF par l'établissement : déposez le PDF reçu avec « Déposer le PDF reçu » dans le suivi ; c'est lui qui figure dans le catalogue, tel quel." : "Votre fiche figure dans le catalogue sous la forme du document PDF que vous transmettez au SAIO : envoyez-lui la version à jour par mail."}</p>` : ""}<p class="info">${fermee() ? "Fiche d'une campagne close, en consultation seule : elle sert de base de comparaison." : SAIO() ? "Mode SAIO : vous modifiez directement la fiche de l'établissement (par exemple à sa demande, par téléphone ou par mail), puis cliquez sur « Enregistrer les modifications » en bas de page." : "Vos informations de l'an dernier sont déjà remplies. Modifiez seulement ce qui a changé, puis cliquez sur « Envoyer ma fiche ». Vous pouvez enregistrer et revenir plus tard avec le même lien."}</p>
    <div class="colonnes"><div class="cote"><section class="carte">${etab}</section><section class="carte">${blocContacts}</section></div>
    <div class="principal">${blocFormations}${blocAccomp}${envoi}</div></div>`;
  // Fiche d'une campagne close : consultation seule (base de comparaison)
  if (SAIO() && "Code_actif" in FICHE && !FICHE.Code_actif) {
    app.querySelectorAll("input, textarea, button").forEach(el => { if (!el.dataset.tout) el.disabled = true; });
    const sec = app.querySelector(".principal > section:last-child"); if (sec) sec.innerHTML = `<p class="info" style="margin:0">Fiche d'une campagne close : consultation seule. Elle sert de base de comparaison.</p>`;
  }
}

// ---------- Présentation « page du catalogue » (établissement) ----------
// La fiche s'affiche comme dans le catalogue ; chaque texte se corrige en cliquant dessus. Enregistrement automatique.
const COUL_DEP = { "Dordogne": "#7B3F98", "Gironde": "#8B1538", "Landes": "#1A7346", "Lot-et-Garonne": "#A64808", "Pyrénées-Atlantiques": "#00627C" };
let ETAT_SAUVE = "", MINUTERIE = null, EN_COURS = null, MERCI = null, AJOUT = null; // AJOUT : "formation" | "action" | null
const baseDe = (t, id) => (BASE[t] || []).find(r => r.id === id);
// différence avec la fiche à l'ouverture
function diffBase(t, l, c) {
  if (t === "fiche") return String(FICHE[c] ?? "") !== String(BASE.fiche[c] ?? "");
  const o = l._base ? baseDe(t, l._base) : null;
  return !!o && String(o[c] ?? "") !== String(l[c] ?? "");
}
const estNouveau = l => !l._base;
// à l'ouverture, chaque ligne garde l'identifiant de sa version de départ (pour le surlignage, même après enregistrement)
function marquerBase() { for (const t of ["contacts", "formations", "accomp"]) for (const l of ETAT[t]) if (l.id && l._base === undefined && baseDe(t, l.id)) l._base = l.id; }

function recapChangements() {
  const out = [];
  for (const [c, lib] of [...CHAMPS_FICHE, [PRESENTATION, "Présentation de l’accompagnement"]]) if (c in FICHE && diffBase("fiche", null, c)) out.push(`${lib} modifié${/Adresse|Présentation/.test(lib) ? "e" : ""}`);
  for (const l of ETAT.formations) {
    if (estNouveau(l) && !l._suppr) out.push(`Formation ajoutée : ${l.Intitule}`);
    else if (!estNouveau(l) && l.Statut === "Fermée" && baseDe("formations", l._base).Statut !== "Fermée") out.push(`Formation retirée : ${l.Intitule}`);
    else if (!estNouveau(l) && diffBase("formations", l, "Remarque")) out.push(`Précision modifiée : ${l.Intitule}`);
  }
  const ctNv = ETAT.contacts.filter(l => estNouveau(l) && !l._suppr).length, ctSup = ETAT.contacts.filter(l => !estNouveau(l) && l._suppr).length;
  const ctMod = ETAT.contacts.filter(l => !estNouveau(l) && !l._suppr && CHAMPS_CONTACT.some(([c]) => diffBase("contacts", l, c))).length;
  if (ctNv) out.push(`${ctNv} contact${ctNv > 1 ? "s" : ""} ajouté${ctNv > 1 ? "s" : ""}`);
  if (ctSup) out.push(`${ctSup} contact${ctSup > 1 ? "s" : ""} retiré${ctSup > 1 ? "s" : ""}`);
  if (ctMod) out.push(`${ctMod} contact${ctMod > 1 ? "s" : ""} modifié${ctMod > 1 ? "s" : ""}`);
  for (const l of ETAT.accomp) {
    if (estNouveau(l) && !l._suppr) out.push(`Action ajoutée : ${l.Action}`);
    else if (!estNouveau(l) && !l.Cochee && baseDe("accomp", l._base).Cochee) out.push(`Action retirée : ${l.Action}`);
    else if (!estNouveau(l) && diffBase("accomp", l, "Action")) out.push(`Action modifiée : ${l.Action}`);
  }
  if (String(FICHE[MSG_CFA] || "").trim() && diffBase("fiche", null, MSG_CFA)) out.push(`Message au SAIO : « ${String(FICHE[MSG_CFA]).trim().slice(0, 80)}${String(FICHE[MSG_CFA]).trim().length > 80 ? "…" : ""} »`);
  return out;
}

// texte modifiable en place
function ed(t, i, c, v, ph, cls = "", multi = false) {
  const l = t === "fiche" ? null : ETAT[t][i];
  const mod = t === "fiche" ? diffBase("fiche", null, c) : l && !estNouveau(l) && diffBase(t, l, c);
  const err = controle(c, v);
  return `<span class="ed${mod ? " mod" : ""}${err ? " erreur" : ""}${cls ? " " + cls : ""}" contenteditable="true" spellcheck="true"
    data-t="${t}" data-i="${i}" data-c="${c}" data-ph="${esc(ph)}"${multi ? ' data-multi="1"' : ""} role="textbox" aria-label="${esc(ph)}">${esc(v ?? "")}</span>${err ? `<span class="err-txt">${esc(err)}</span>` : ""}`;
}
const btnX = (quoi, i, lib = "retirer") => `<button class="x" data-retirer="${quoi}" data-i="${i}" title="${lib === "retirer" ? "Retirer" : lib}">✕ ${lib}</button>`;
const btnRemettre = (quoi, i) => `<button class="remettre" data-remettre="${quoi}" data-i="${i}">↶ remettre</button>`;

function afficherPage() {
  marquerBase();
  const coul = COUL_DEP[FICHE.Departement] || "#000091";
  const lim = CAMPAGNE && CAMPAGNE.Date_limite ? new Date(CAMPAGNE.Date_limite * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
  elTitre().textContent = `${FICHE.Etablissement || "Votre fiche"} – votre fiche`;
  majEtatSauve();
  if (MERCI) return afficherMerci(lim);
  const n = recapChangements().length;
  const greta = /^autre|^tous d/i.test(FICHE.Departement || "");

  // coordonnées
  const coord = `<h3>COORDONNÉES</h3>
    <div>${ed("fiche", 0, "Adresse", FICHE.Adresse, "Adresse")}</div>
    <div>${ed("fiche", 0, "Code_postal", FICHE.Code_postal, "Code postal", "cp")} ${ed("fiche", 0, "Ville", FICHE.Ville, "Ville")}</div>
    <div>Tél. ${ed("fiche", 0, "Telephone", FICHE.Telephone, "Téléphone")}</div>
    <div class="lien">${ed("fiche", 0, "Mail", FICHE.Mail, "Mail de l’établissement")}</div>
    <div class="lien">${ed("fiche", 0, "Site_internet", FICHE.Site_internet, "Site internet")}</div>`;
  // contacts
  const cts = ETAT.contacts.map((l, i) => [l, i]).filter(([l]) => !(l._suppr && estNouveau(l)));
  const contacts = `<h3 class="sep">CONTACTS</h3>` + cts.map(([l, i]) => {
    const verif = !l._suppr && !estNouveau(l) && contactAVerifier(l);
    return `<div class="ct${l._suppr ? " barre" : ""}${verif ? " a-verif" : ""}${estNouveau(l) ? " ct-nouv" : ""}">
      ${verif ? `<div class="verif-txt">À vérifier : ${esc(verif)}</div>` : ""}
      <b>${ed("contacts", i, "Nom", l.Nom, "Prénom NOM")}</b>
      <i>${ed("contacts", i, "Fonction", l.Fonction, "Fonction")}</i>
      <div>${ed("contacts", i, "Telephone", l.Telephone, "Téléphone")}</div>
      <div class="lien">${ed("contacts", i, "Mail", l.Mail, "Mail")}</div>
      ${l._suppr ? btnRemettre("contacts", i) : btnX("contacts", i, "retirer ce contact")}</div>`;
  }).join("") + `<button class="plus" data-plus="contact">+ ajouter un contact</button>`;

  // formations : par site s'il y en a, sinon par filière (comme le catalogue)
  const fos = ETAT.formations.map((l, i) => [l, i]).filter(([l]) => !(l._suppr && estNouveau(l)));
  const parSite = fos.some(([l]) => l.Lieu);
  const grp = new Map();
  for (const [l, i] of fos) { const k = (parSite ? l.Lieu : null) || l.Filiere || "Autres formations"; if (!grp.has(k)) grp.set(k, []); grp.get(k).push([l, i]); }
  const forms = [...grp].map(([k, items]) => `<div class="grp">› ${esc(k)}</div><ul>${items.map(([l, i]) => {
    const ferme = l.Statut === "Fermée";
    return `<li class="${ferme ? "barre" : ""}"><span class="${estNouveau(l) ? "nouv" : ""}">${esc(l.Intitule)}</span>${estNouveau(l) ? ` <small class="tag-nouv">nouvelle</small>` : ""}
      ${ferme ? btnRemettre("formations", i) : btnX("formations", i)}
      <div class="rem">${ed("formations", i, "Remarque", l.Remarque, "+ précision (durée, rythme…)", "ph-discret")}</div></li>`;
  }).join("")}</ul>`).join("") || `<p class="vide">Aucune formation.</p>`;
  const lieux = [...new Set(ETAT.formations.map(l => l.Lieu).filter(Boolean))];
  const ajoutForm = AJOUT === "formation" ? `<div class="panneau-ajout" id="panForm">
      <label>Chercher dans la liste officielle<input id="chercheForm" placeholder="Tapez quelques lettres : maçon, cuisine, bac pro…" autocomplete="off"></label>
      ${lieux.length ? `<label>Site<select id="lieuForm">${lieux.map(x => `<option>${esc(x)}</option>`).join("")}</select></label>` : ""}
      <div id="resultatsForm" class="resultats"></div>
      <p class="petit">Formation absente de la liste ? Indiquez-la dans « Autre chose à signaler », en bas de page.</p>
      <button class="lien-btn" data-fermer-ajout>Annuler</button></div>`
    : `<button class="plus" data-plus="formation">+ ajouter une formation</button>`;

  // modalités d'accompagnement (ordre des catégories du parcours)
  const acs = ETAT.accomp.map((l, i) => [l, i]).filter(([l]) => !(l._suppr && estNouveau(l))).sort(([a], [b]) => rangAcc(a.Groupe) - rangAcc(b.Groupe));
  const acts = `<ul>${acs.map(([l, i]) => `<li class="${l.Cochee ? "" : "barre"}">${ed("accomp", i, "Action", l.Action, "Décrivez l’action", estNouveau(l) ? "nouv" : "")}
      ${l.Cochee ? btnX("accomp", i) : btnRemettre("accomp", i)}</li>`).join("")}</ul>`;
  const ajoutAct = AJOUT === "action" ? `<div class="panneau-ajout">
      <label>Nouvelle action<input id="nvActionPage" placeholder="Ex. : journée portes ouvertes le samedi 13 mars"></label>
      <label>Catégorie<select id="nvGroupePage">${CATEGORIES_ACC.map(c => `<option${c === "Autres actions" ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <div class="boutons-ajout"><button class="btn" data-valider-action>Ajouter l’action</button><button class="lien-btn" data-fermer-ajout>Annuler</button></div></div>`
    : `<button class="plus" data-plus="action">+ ajouter une action</button>`;

  const choix = FICHE.Soumise_le
    ? `<div class="choix envoye"><div><h2>Vous avez envoyé votre fiche le ${dateFr(FICHE.Soumise_le)}.</h2><p>Vous pouvez encore la corriger${lim ? ` jusqu’au ${lim}` : ""} : vos corrections sont enregistrées automatiquement. Cliquez ensuite sur « Renvoyer ma fiche ».</p></div></div>`
    : n ? `<div class="choix"><div><h2>Vous corrigez votre fiche</h2><p>Les textes modifiés sont en <span class="mod">jaune</span>, les ajouts en <span class="nouv">vert</span>, les retraits barrés (« ↶ remettre » pour annuler). Tout est enregistré automatiquement.</p></div></div>`
    : `<div class="choix"><div><h2>Votre fiche a-t-elle changé depuis l’an dernier ?</h2><p>Relisez-la ci-dessous, telle qu’elle paraîtra dans le catalogue.</p></div>
       <button class="btn vert gros" data-rien>✓ Rien n’a changé, je la confirme</button>
       <div class="ou">Sinon, <b>cliquez directement sur un texte pour le corriger</b> : ce que vous changez apparaît en jaune. Vos corrections sont enregistrées automatiquement : vous pouvez vous arrêter et revenir plus tard avec le même lien.</div></div>`;

  app.innerHTML = `<div class="vue-page" style="--c:${coul}">
    ${bandeau("haut")}
    ${greta ? `<p class="bandeau ok">Votre fiche figure dans le catalogue sous la forme du document PDF que vous transmettez au SAIO : envoyez-lui la version à jour par mail.</p>` : ""}
    ${choix}
    <article class="page-fiche">
      <div class="dep">${esc(FICHE.Departement ? `Département : ${FICHE.Departement}` : "")}</div>
      <h1 class="titre-fiche">${ed("fiche", 0, "Etablissement", FICHE.Etablissement, "Nom de l’établissement")}</h1>
      <div class="site-fiche">${ed("fiche", 0, "Site", FICHE.Site, "Site (facultatif)", "ph-discret")}</div>
      <div class="filet"></div>
      <div class="cols-fiche">
        <aside class="cote-fiche">${coord}${contacts}</aside>
        <div class="corps-fiche">
          <h3>FORMATIONS PROPOSÉES</h3>${forms}${ajoutForm}
          <h3 class="sep">MODALITÉS D’ACCOMPAGNEMENT</h3>
          ${PRESENTATION in FICHE ? `<p class="pres">${ed("fiche", 0, PRESENTATION, FICHE[PRESENTATION], "Présentez votre accompagnement en quelques lignes (facultatif)", "ph-discret", true)}</p>` : ""}
          ${acts}${ajoutAct}
        </div>
      </div>
    </article>
    ${MSG_CFA in FICHE ? `<section class="signal"><label for="msgCfa">Autre chose à signaler ? <span>(facultatif)</span></label>
      <textarea id="msgCfa" placeholder="Ex. : nous ouvrons une formation qui n’est pas dans la liste, un contact change en cours d’année…">${esc(FICHE[MSG_CFA] || "")}</textarea>
      <small>Le SAIO lira votre message et vous recontactera si besoin.</small></section>` : ""}
    <p class="classique"><button class="lien-btn" data-classique>Préférez-vous un formulaire classique ?</button></p>
    <div class="barre-bas">${n ? `<span class="compte">${n} modification${n > 1 ? "s" : ""}</span>` : ""}
      <button class="btn sec" data-pause>Enregistrer et finir plus tard</button>
      <button class="btn" data-envoyer-page>${FICHE.Soumise_le ? "Renvoyer ma fiche" : "Envoyer ma fiche"}</button></div>
  </div>`;
  if (AJOUT === "formation") { const c = document.getElementById("chercheForm"); if (c) { c.focus(); majResultats(c.value); } }
  if (AJOUT === "action") { const c = document.getElementById("nvActionPage"); if (c) c.focus(); }
}
const dateFr = t => new Date(t * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

function majResultats(q) {
  const box = document.getElementById("resultatsForm"); if (!box) return;
  const mots = simple(q).split(/\s+/).filter(Boolean);
  if (!mots.length) { box.innerHTML = ""; return; }
  const deja = new Set(ETAT.formations.filter(l => !l._suppr).map(l => simple(l.Intitule)));
  const res = REF.filter(r => mots.every(m => simple(libRef(r) + " " + (r.Filiere || "")).includes(m))).slice(0, 8);
  box.innerHTML = res.map(r => `<button class="resultat" data-choisir="${REF.indexOf(r)}"${deja.has(simple(libRef(r))) ? " disabled" : ""}><span>${esc(libRef(r))}</span><small>${esc(r.Filiere || "")}${deja.has(simple(libRef(r))) ? " · déjà dans votre fiche" : ""}</small></button>`).join("")
    || `<p class="petit">Aucune formation trouvée. Essayez un autre mot, ou signalez-la en bas de page.</p>`;
}

function afficherMerci(lim) {
  app.innerHTML = `<div class="vue-page"><div class="merci"><div class="ok">✓</div><h2>Merci, votre fiche est envoyée au SAIO</h2>
    <p>Elle figurera ainsi dans le catalogue ${esc(CAMPAGNE && CAMPAGNE.Annee || "")}.</p>
    <div class="recap"><b>${MERCI.length ? "Ce que vous avez changé :" : "Vous avez confirmé votre fiche sans changement."}</b>${MERCI.length ? `<ul>${MERCI.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>
    <p>Une erreur ? Vous pouvez encore corriger votre fiche avec le même lien${lim ? ` jusqu’au ${lim}` : ""}.</p>
    <button class="btn sec" data-revoir>Revoir ma fiche</button></div></div>`;
}

function majEtatSauve() {
  if (!PAGE()) return;
  elResume().innerHTML = ETAT_SAUVE ? `<span class="etat-sauve${/impossible/.test(ETAT_SAUVE) ? " echec" : ""}">${esc(ETAT_SAUVE)}</span>` : "";
}

// enregistrement automatique (1,5 s après la dernière saisie)
function majCompte() { const n = recapChangements().length, el = app.querySelector(".compte"); if (el) el.textContent = `${n} modification${n > 1 ? "s" : ""}`; }
function planifier() { majCompte(); clearTimeout(MINUTERIE); ETAT_SAUVE = "Modifications en cours…"; majEtatSauve(); MINUTERIE = setTimeout(() => sauver(false), 1500); }
async function sauver(soumettre) {
  clearTimeout(MINUTERIE);
  if (EN_COURS) await EN_COURS.catch(() => {});
  const a = actions(soumettre), cibles = CIBLES.slice();
  if (!a.length) { ETAT_SAUVE = ORIG && !nbModifs() ? ETAT_SAUVE : ""; majEtatSauve(); return true; }
  ETAT_SAUVE = "Enregistrement…"; majEtatSauve();
  const fin = r => {
    (r && r.retValues || []).forEach((v, k) => { const l = cibles[k]; if (!l) return;
      if (a[k][0] === "AddRecord") l.id = v; else { l.id = undefined; l._supprimee = true; } });
    if (!r) cibles.forEach((l, k) => { if (!l) return; if (a[k][0] === "AddRecord") l.id = -(Date.now() + k); else l.id = undefined; }); // démonstration
    if (soumettre) FICHE.Soumise_le = Date.now() / 1000;
    ORIG = copie({ fiche: FICHE, ...ETAT });
    ETAT_SAUVE = `Enregistré automatiquement à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`; majEtatSauve();
  };
  if (!DANS_GRIST) { fin(null); return true; }
  EN_COURS = grist.docApi.applyUserActions(a);
  try { fin(await EN_COURS); return true; }
  catch (err) { ETAT_SAUVE = "Enregistrement impossible : vérifiez votre connexion"; majEtatSauve(); MESSAGE = { cl: "err", txt: "L’enregistrement a échoué : " + (err && err.message ? err.message : err) }; afficher(); return false; }
  finally { EN_COURS = null; }
}
window.addEventListener("beforeunload", e => { if (PAGE() && (MINUTERIE && ETAT_SAUVE === "Modifications en cours…" || EN_COURS)) { e.preventDefault(); e.returnValue = ""; } });

function confirmer(titre, texte, bouton) {
  return new Promise(ok => {
    const d = document.createElement("div"); d.className = "modale";
    d.innerHTML = `<div class="modale-boite" role="dialog" aria-modal="true"><h2>${esc(titre)}</h2><p>${esc(texte)}</p>
      <div class="boutons-ajout"><button class="btn" data-oui>${esc(bouton)}</button><button class="btn sec" data-non>Annuler</button></div></div>`;
    document.body.appendChild(d); d.querySelector("[data-oui]").focus();
    d.addEventListener("click", e => { if (e.target.closest("[data-oui]")) { d.remove(); ok(true); } else if (e.target.closest("[data-non]") || e.target === d) { d.remove(); ok(false); } });
  });
}

// ---- interactions de la page ----
function surSaisiePage(e) {
  const el = e.target;
  if (el.id === "chercheForm") return majResultats(el.value);
  if (el.id === "msgCfa") { FICHE[MSG_CFA] = el.value; return planifier(); }
  const { t, i, c } = el.dataset; if (!t || !el.isContentEditable) return;
  const ligne = t === "fiche" ? FICHE : ETAT[t][+i];
  ligne[c] = el.innerText.replace(/ /g, " ").replace(/\n+$/, "");
  el.classList.toggle("mod", t === "fiche" ? diffBase("fiche", null, c) : !estNouveau(ligne) && diffBase(t, ligne, c));
  planifier();
}
function surChangementPage() {}
app.addEventListener("keydown", e => { // Entrée valide un texte d'une ligne
  if (!PAGE()) return;
  const el = e.target;
  if (el.isContentEditable && e.key === "Enter" && !el.dataset.multi) { e.preventDefault(); el.blur(); }
  if (el.id === "nvActionPage" && e.key === "Enter") { e.preventDefault(); app.querySelector("[data-valider-action]").click(); }
});
app.addEventListener("focusout", e => { // sortie d'un texte : mise en forme et contrôle
  if (!PAGE()) return;
  const el = e.target, { t, i, c } = el.dataset; if (!t || !el.isContentEditable) return;
  const ligne = t === "fiche" ? FICHE : ETAT[t][+i];
  ligne[c] = formater(c, ligne[c]);
  const err = controle(c, ligne[c]);
  if (el.textContent !== ligne[c] || !!err !== el.classList.contains("erreur")) afficher();
});
async function surClicPage(e) {
  const b = e.target.closest("button"); if (!b) return;
  const d = b.dataset;
  if (d.retirer) {
    const l = ETAT[d.retirer][+d.i];
    if (d.retirer === "formations") { if (estNouveau(l)) l._suppr = true; else l.Statut = "Fermée"; }
    else if (d.retirer === "accomp") { if (estNouveau(l)) l._suppr = true; else l.Cochee = false; }
    else l._suppr = true;
    afficher(); return planifier();
  }
  if (d.remettre) {
    const l = ETAT[d.remettre][+d.i];
    if (d.remettre === "formations") l.Statut = "Maintenue"; else if (d.remettre === "accomp") l.Cochee = true;
    else { l._suppr = false; if (l._supprimee) { l.id = undefined; l._supprimee = false; } }
    afficher(); return planifier();
  }
  if (d.plus === "contact") {
    ETAT.contacts.push({ Fiche: FICHE.id, Fonction: "", Nom: "", Telephone: "", Mail: "" }); afficher();
    const els = app.querySelectorAll('[data-t="contacts"][data-c="Nom"]'); els[els.length - 1].focus(); return;
  }
  if (d.plus === "formation" || d.plus === "action") { AJOUT = d.plus; return afficher(); }
  if (d.fermerAjout !== undefined) { AJOUT = null; return afficher(); }
  if (d.choisir !== undefined) {
    const r = REF[+d.choisir], lieu = (document.getElementById("lieuForm") || {}).value || "";
    ETAT.formations.push({ Fiche: FICHE.id, Intitule: libRef(r), Filiere: r.Filiere || "Autres", Statut: "Nouvelle", Remarque: "", ...(lieu ? { Lieu: lieu } : {}) });
    AJOUT = null; afficher(); return planifier();
  }
  if (d.validerAction !== undefined) {
    const v = (document.getElementById("nvActionPage").value || "").trim(); if (!v) return;
    ETAT.accomp.push({ Fiche: FICHE.id, Groupe: document.getElementById("nvGroupePage").value, Action: v, Cochee: true });
    AJOUT = null; afficher(); return planifier();
  }
  if (d.classique !== undefined) { await sauver(false); CLASSIQUE = true; MESSAGE = null; return afficher(); }
  if (d.pause !== undefined) {
    if (await sauver(false)) { MESSAGE = { cl: "ok", txt: "Vos corrections sont enregistrées. Vous pouvez fermer la page et revenir plus tard avec le même lien." }; afficher(); document.getElementById("haut").scrollIntoView({ behavior: "smooth" }); }
    return;
  }
  if (d.rien !== undefined) {
    if (!await confirmer("Confirmer votre fiche ?", "Vous confirmez que les informations de votre fiche sont exactes et à jour. Elle sera envoyée au SAIO telle quelle.", "Oui, je la confirme")) return;
    return envoyerPage();
  }
  if (d.envoyerPage !== undefined) {
    if (!String(FICHE.Etablissement || "").trim()) { MESSAGE = { cl: "err", txt: "Indiquez le nom de l’établissement avant d’envoyer." }; return afficher(); }
    const fautes = erreursFormat();
    if (fautes) { MESSAGE = { cl: "err", txt: `${fautes} information${fautes > 1 ? "s ont" : " a"} un format à corriger (en rouge sur la fiche).` }; afficher(); const x = app.querySelector(".erreur"); if (x) x.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const n = recapChangements().length;
    if (!await confirmer("Envoyer votre fiche au SAIO ?", `Vous certifiez l’exactitude de ces informations${n ? ` (${n} modification${n > 1 ? "s" : ""})` : ""}.`, "Envoyer ma fiche")) return;
    return envoyerPage();
  }
  if (d.revoir !== undefined) { MERCI = null; MESSAGE = null; return afficher(); }
}
async function envoyerPage() {
  const recap = recapChangements();
  if (await sauver(true)) { MERCI = recap; MESSAGE = null; afficher(); window.scrollTo({ top: 0 }); }
}

// ---------- Interactions ----------
app.addEventListener("toggle", e => {
  const d = e.target; if (!d.dataset || !d.dataset.pli) return;
  d.open ? OUVERTS.add(d.dataset.pli) : OUVERTS.delete(d.dataset.pli);
}, true);

app.addEventListener("input", e => {
  if (PAGE()) return surSaisiePage(e);
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
  if (PAGE()) return surChangementPage(e);
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
  if (PAGE()) return surClicPage(e);
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "versPage") { CLASSIQUE = false; MESSAGE = null; return afficher(); }
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

let CIBLES = []; // ligne visée par chaque action (pour reporter les identifiants après un enregistrement automatique)
function actions(soumettre) {
  CIBLES = [];
  for (const [c] of CHAMPS_FICHE) if (c in FICHE) FICHE[c] = formater(c, FICHE[c]);
  for (const t of ["contacts", "formations"]) for (const l of ETAT[t]) for (const c of COLS[t]) if (c in l) l[c] = formater(c, l[c]);
  const a = [];
  const majFiche = {};
  for (const [c] of [...CHAMPS_FICHE, [PRESENTATION], [MSG_CFA]]) if (c in FICHE && changeChamp("fiche", null, c)) majFiche[c] = FICHE[c];
  if (soumettre) majFiche.Soumise_le = Date.now() / 1000;
  if (Object.keys(majFiche).length) a.push(["UpdateRecord", "Fiches", FICHE.id, majFiche]);
  for (const t in TABLES) for (const l of ETAT[t]) {
    const champs = {}; COLS[t].forEach(c => { if (c in l) champs[c] = l[c]; });
    if (!l.id) { if (!l._suppr) { a.push(["AddRecord", TABLES[t], null, { Fiche: FICHE.id, ...champs }]); CIBLES[a.length - 1] = l; } continue; }
    if (l._suppr) { a.push(["RemoveRecord", TABLES[t], l.id]); CIBLES[a.length - 1] = l; continue; }
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
