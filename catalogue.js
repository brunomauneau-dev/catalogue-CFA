// Génération du catalogue « Accompagnement apprentissage » en PDF (widget Grist réservé au SAIO).
// Couverture, pages d'information (table Pages_catalogue, modifiables ici), sommaire par département,
// page de séparation par département, puis une fiche par établissement (formations fermées exclues).
// Bibliothèque jsPDF (lib/, licence MIT), chargée au moment de la génération.
// Hors de Grist, la page s'affiche avec des données fictives (démonstration).
"use strict";

const DANS_GRIST = window.parent !== window;
let D = { fiches: [], formations: [], contacts: [], accomp: [], campagnes: [], pages: [] };
let CAMP = null, MODE = "derniere", MSG = null, OUVERTES = new Set();

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lignes = t => !t || !t.id ? [] : t.id.map((id, i) => { const r = { id }; for (const k in t) r[k] = t[k][i]; return r; });
const app = document.getElementById("app");
const TOUS = "Tous départements";

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
    contacts: [1, 2, 3, 4].map(n => ({ id: n, Fiche: n, Pole: "Accueil des candidats", Nom: "Prénom NOM", Telephone: "05 00 00 00 0" + n, Mail: "contact" + n + "@exemple.fr" })),
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
const nomDep = f => f.Departement || "Sans département";
function parDepartement(fiches) {
  const g = new Map();
  for (const f of fiches) { if (!g.has(nomDep(f))) g.set(nomDep(f), []); g.get(nomDep(f)).push(f); }
  const ordre = [...g.keys()].sort((a, b) => (a === TOUS ? -1 : b === TOUS ? 1 : a.localeCompare(b, "fr")));
  return ordre.map(d => [d, g.get(d).sort((a, b) => String(a.Etablissement).localeCompare(b.Etablissement, "fr", { numeric: true }) || String(a.Site).localeCompare(b.Site, "fr", { numeric: true }))]);
}

// ---------- Écran ----------
function afficher() {
  document.getElementById("campagne").innerHTML = `<select id="choixCampagne" aria-label="Campagne" style="width:auto">${D.campagnes.map(c => `<option value="${c.id}"${CAMP && c.id === CAMP.id ? " selected" : ""}>Campagne ${esc(c.Annee)}${c.Active ? " (active)" : ""}</option>`).join("")}</select>`;
  if (!CAMP) { app.innerHTML = `<p class="alerte">Aucune campagne.</p>`; return; }
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
  app.innerHTML = `${bandeau}<div class="colonnes">
    <div class="principal">
      <section class="carte"><h2>Fiches du catalogue ${esc(CAMP.Annee)}</h2>
        <p class="etat">${toutes.length} fiche(s) dans la campagne, dont ${toutes.filter(f => f.Finalisee_le).length} finalisée(s). ${ret.length} retenue(s) pour le catalogue.</p>
        <label class="coche"><input type="radio" name="mode" value="derniere"${MODE === "derniere" ? " checked" : ""}>Fiches non finalisées : reprendre leur dernière version finalisée (sinon les laisser hors du catalogue)</label>
        <label class="coche"><input type="radio" name="mode" value="actuelle"${MODE === "actuelle" ? " checked" : ""}>Prendre toutes les fiches telles quelles, même non finalisées (version de travail)</label>
        ${lignesDep || `<p class="etat">Aucune fiche retenue.</p>`}
        <p class="etat">Ordre : « ${TOUS} » d'abord, puis les départements, et dans chacun les établissements par ordre alphabétique. Les formations « Fermée » n'apparaissent pas.</p>
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

// ---------- PDF ----------
let PDF_PRET = null;
function chargerPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
  return PDF_PRET = PDF_PRET || new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "lib/jspdf.umd.min.js"; s.onload = ok; s.onerror = () => ko(new Error("bibliothèque PDF introuvable")); document.head.appendChild(s); });
}

// Polices standard du PDF : jeu de caractères WinAnsi. On remplace ce qui n'y est pas.
const REMPL = { "’": "'", "‘": "'", "“": "\"", "”": "\"", "–": "-", "—": "-", "…": "...", " ": " ", " ": " ", "→": "->", "≈": "~", "✓": "", "•": "•" };
const OK_WINANSI = new Set([..."€‚ƒ„†‡ˆ‰Š‹ŒŽ˜™š›œžŸ•"]);
const net = s => [...String(s ?? "").normalize("NFC")].map(c => REMPL[c] ?? c).join("").split("").map(c => (c.charCodeAt(0) < 256 || OK_WINANSI.has(c) ? c : "?")).join("");

const A4 = { l: 210, h: 297, marge: 15, bas: 280 };
const COUL = { bleu: [31, 78, 140], bleuPale: [234, 241, 251], gris: [241, 244, 249], texte: [17, 24, 39], doux: [75, 85, 99], blanc: [255, 255, 255] };
const lh = (taille, inter = 1.3) => taille * 0.3528 * inter;

function genererPdf(opts) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const coul = c => { doc.setTextColor(...c); };
  const police = (style, taille) => { doc.setFont("helvetica", style); doc.setFontSize(taille); };

  // Colonne de texte qui passe à la page suivante (pages partagées entre colonnes d'une même fiche).
  function colonne(x, w, y, ctx) { return { x, w, y, ctx, idx: 0 }; }
  function place(col, h) {
    if (col.y + h <= A4.bas) return;
    col.idx++;
    if (col.idx >= col.ctx.pages.length) col.ctx.pages.push(col.ctx.nouvelle());
    doc.setPage(col.ctx.pages[col.idx]);
    col.y = col.ctx.ySuite;
    if (col.fond) col.fond();
  }
  function texte(col, s, { taille = 10, style = "normal", c = COUL.texte, retrait = 0, puce = null, apres = 0 } = {}) {
    police(style, taille); coul(c);
    const ls = doc.splitTextToSize(net(s), col.w - retrait);
    ls.forEach((l, i) => {
      place(col, lh(taille));
      if (puce && i === 0) doc.text(puce, col.x + retrait - 3.5, col.y, { baseline: "top" });
      doc.text(l, col.x + retrait, col.y, { baseline: "top" });
      col.y += lh(taille);
    });
    col.y += apres;
  }
  // Texte enrichi des pages d'information : **gras**, [lien](url), listes « - », intertitres « ## ».
  function riche(col, src) {
    for (const brut of String(src || "").split(/\r?\n/)) {
      const ligne = brut.trimEnd();
      if (!ligne.trim()) { col.y += 2.5; continue; }
      if (/^##\s+/.test(ligne)) { col.y += 2; texte(col, ligne.replace(/^##\s+/, ""), { taille: 12.5, style: "bold", c: COUL.bleu, apres: 1.5 }); continue; }
      const puce = /^\s*[-*]\s+/.test(ligne);
      enLigne(col, puce ? ligne.replace(/^\s*[-*]\s+/, "") : ligne, puce ? 6 : 0, puce);
      col.y += 1;
    }
  }
  function enLigne(col, s, retrait, puce) {
    const taille = 10.5, hl = lh(taille, 1.4), mots = [];
    for (const m of net(s).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/)) {
      if (!m) continue;
      let t = m, gras = false, url = null;
      if (/^\*\*.*\*\*$/.test(m)) { t = m.slice(2, -2); gras = true; }
      const lien = m.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/); if (lien) { t = lien[1]; url = lien[2]; }
      for (const p of t.split(/(\s+)/)) if (p) mots.push({ t: p, gras, url });
    }
    let ligne = [], larg = 0, premiere = true;
    const largeur = m => { police(m.gras ? "bold" : "normal", taille); return doc.getTextWidth(m.t); };
    const vider = () => {
      while (ligne.length && /^\s+$/.test(ligne[ligne.length - 1].t)) ligne.pop();
      place(col, hl);
      let x = col.x + retrait;
      if (puce && premiere) { police("normal", taille); coul(COUL.bleu); doc.text("•", x - 4, col.y, { baseline: "top" }); }
      for (const m of ligne) {
        police(m.gras ? "bold" : "normal", taille); coul(m.url ? COUL.bleu : COUL.texte);
        const w = doc.getTextWidth(m.t);
        doc.text(m.t, x, col.y, { baseline: "top" });
        if (m.url && !/^\s+$/.test(m.t)) { doc.link(x, col.y, w, hl, { url: m.url }); doc.setDrawColor(...COUL.bleu); doc.line(x, col.y + lh(taille) * 0.85, x + w, col.y + lh(taille) * 0.85); }
        x += w;
      }
      col.y += hl; ligne = []; larg = 0; premiere = false;
    };
    for (const m of mots) {
      if (!ligne.length && /^\s+$/.test(m.t)) continue;
      const w = largeur(m);
      if (larg + w > col.w - retrait && ligne.length) { vider(); if (/^\s+$/.test(m.t)) continue; }
      ligne.push(m); larg += largeur(m);
    }
    if (ligne.length) vider();
  }

  // 1. Couverture
  doc.setFillColor(...COUL.bleu); doc.rect(0, 0, A4.l, A4.h, "F");
  doc.setFillColor(255, 255, 255); doc.rect(A4.marge, 150, 40, 1.2, "F");
  police("bold", 30); coul(COUL.blanc);
  doc.text(doc.splitTextToSize(net(opts.titre), A4.l - 2 * A4.marge), A4.marge, 110, { baseline: "top" });
  police("normal", 16); doc.text(net(opts.sousTitre), A4.marge, 158, { baseline: "top" });
  police("normal", 11); doc.text(net(opts.bas), A4.marge, A4.h - 25, { baseline: "top" });

  // 2. Pages d'information
  for (const p of opts.pages) {
    doc.addPage();
    const ctx = { pages: [doc.getNumberOfPages()], ySuite: 20, nouvelle: () => { doc.addPage(); return doc.getNumberOfPages(); } };
    const col = colonne(A4.marge + 5, A4.l - 2 * A4.marge - 10, 25, ctx);
    texte(col, p.Titre || "", { taille: 20, style: "bold", c: COUL.bleu, apres: 2 });
    doc.setFillColor(...COUL.bleu); doc.rect(col.x, col.y, 25, 0.8, "F"); col.y += 7;
    riche(col, p.Texte);
  }

  // 3. Sommaire (pages réservées, remplies à la fin quand les numéros sont connus)
  const groupes = opts.groupes;
  const nbLignes = groupes.reduce((n, [, l]) => n + 2 + l.length, 0);
  const parPage = 32, nbSommaire = Math.max(1, Math.ceil(nbLignes / parPage)); // estimation prudente (≈ 38 lignes tiennent)
  const debutSommaire = doc.getNumberOfPages() + 1;
  for (let i = 0; i < nbSommaire; i++) doc.addPage();

  // 4. Départements et fiches
  const numeros = [];
  for (const [dep, fiches] of groupes) {
    doc.addPage();
    const pDep = doc.getNumberOfPages();
    doc.setFillColor(...COUL.bleu); doc.rect(0, 0, A4.l, A4.h, "F");
    police("normal", 12); coul(COUL.blanc); doc.text(net(dep === TOUS ? "CFA présents sur plusieurs départements" : "Département"), A4.marge + 5, 70, { baseline: "top" });
    police("bold", 30); doc.text(doc.splitTextToSize(net(dep), A4.l - 2 * A4.marge - 10), A4.marge + 5, 80, { baseline: "top" });
    doc.setFillColor(255, 255, 255); doc.rect(A4.marge + 5, 102, 30, 1, "F");
    const deuxCol = fiches.length > 22, taille = fiches.length > 44 ? 8.5 : deuxCol ? 9.5 : 11, pas = lh(taille, 1.5);
    const parCol = deuxCol ? Math.ceil(fiches.length / 2) : fiches.length, largCol = deuxCol ? (A4.l - 2 * A4.marge - 15) / 2 : A4.l - 2 * A4.marge - 10;
    police("normal", taille);
    fiches.forEach((f, i) => {
      const x = A4.marge + 5 + (deuxCol && i >= parCol ? largCol + 5 : 0), y = 112 + (i % parCol) * pas;
      if (y <= A4.bas - 3) doc.text(doc.splitTextToSize(net(`${f.Etablissement || ""}${f.Site ? " - " + f.Site : ""}`), largCol)[0], x, y, { baseline: "top" });
    });
    const entree = { dep, page: pDep, fiches: [] };
    for (const f of fiches) entree.fiches.push({ f, page: fichePdf(f) });
    numeros.push(entree);
  }

  function fichePdf(f) {
    const titre = net(f.Etablissement || "");
    const enTete = (suite) => {
      doc.setFillColor(...COUL.bleu); doc.rect(0, 0, A4.l, suite ? 16 : 30, "F");
      coul(COUL.blanc);
      if (suite) { police("bold", 11); doc.text(doc.splitTextToSize(titre + " (suite)", A4.l - 2 * A4.marge)[0], A4.marge, 6, { baseline: "top" }); }
      else {
        police("bold", 17); doc.text(doc.splitTextToSize(titre, A4.l - 2 * A4.marge - 40)[0], A4.marge, 8, { baseline: "top" });
        police("normal", 11); doc.text(net(f.Site || ""), A4.marge, 18, { baseline: "top" });
        police("normal", 9); doc.text(net(nomDep(f)), A4.l - A4.marge, 9, { baseline: "top", align: "right" });
      }
      if (!suite) fondCote(36);
    };
    const fondCote = y0 => { doc.setFillColor(...COUL.gris); doc.rect(A4.marge - 3, y0, 64, A4.bas - y0 + 3, "F"); };
    doc.addPage(); enTete(false);
    const premiere = doc.getNumberOfPages();
    const ctx = { pages: [premiere], ySuite: 26, nouvelle: () => { doc.addPage(); enTete(true); return doc.getNumberOfPages(); } };
    const intertitre = (col, s) => { col.y += 1; texte(col, s.toUpperCase(), { taille: 9.5, style: "bold", c: COUL.bleu, apres: 2 }); };

    // Colonne principale : formations, puis accompagnement
    const main = colonne(84, A4.l - 84 - A4.marge, 41, ctx);
    intertitre(main, "Formations proposées");
    const forms = D.formations.filter(x => x.Fiche === f.id && x.Statut !== "Fermée");
    const fil = new Map(); for (const x of forms) { const k = x.Filiere || "Autres formations"; if (!fil.has(k)) fil.set(k, []); fil.get(k).push(x); }
    if (!forms.length) texte(main, "Aucune formation renseignée.", { c: COUL.doux });
    for (const [k, l] of fil) {
      place(main, lh(10.5) * 3);
      texte(main, k, { taille: 10.5, style: "bold", apres: 0.8 });
      for (const x of l) {
        police("normal", 10);
        const hauteur = doc.splitTextToSize(net(x.Intitule || ""), main.w - 5).length * lh(10) + (x.Remarque ? lh(8.5) : 0);
        place(main, hauteur); // la formation et sa remarque restent sur la même page
        texte(main, x.Intitule || "", { taille: 10, retrait: 5, puce: "•" });
        if (x.Remarque) texte(main, x.Remarque, { taille: 8.5, style: "italic", c: COUL.doux, retrait: 5 });
      }
      main.y += 2.5;
    }
    main.y += 3;
    const acts = D.accomp.filter(x => x.Fiche === f.id && x.Cochee);
    if (f.Presentation_accompagnement || acts.length) {
      place(main, lh(10) * 4);
      intertitre(main, "Modalités d'accompagnement");
      if (f.Presentation_accompagnement) texte(main, f.Presentation_accompagnement, { taille: 10, apres: 2 });
      for (const x of acts) texte(main, x.Action || "", { taille: 10, retrait: 5, puce: "•" });
    }

    // Colonne de côté : coordonnées et contacts
    doc.setPage(premiere);
    const cote = colonne(A4.marge, 58, 41, ctx);
    cote.fond = () => fondCote(22);
    intertitre(cote, "Coordonnées");
    const ville = [f.Code_postal, f.Ville].filter(Boolean).join(" ");
    for (const v of [f.Adresse, ville]) if (v) texte(cote, v, { taille: 9 });
    cote.y += 1.5;
    if (f.Telephone) texte(cote, "Tél. " + f.Telephone, { taille: 9 });
    if (f.Mail) texte(cote, f.Mail, { taille: 9, c: COUL.bleu });
    if (f.Site_internet) texte(cote, f.Site_internet, { taille: 9, c: COUL.bleu });
    const cts = D.contacts.filter(x => x.Fiche === f.id);
    if (cts.length) {
      cote.y += 4; intertitre(cote, cts.length > 1 ? "Contacts" : "Contact");
      for (const x of cts) {
        place(cote, lh(9) * 4);
        if (x.Pole) texte(cote, x.Pole, { taille: 9, style: "bold" });
        if (x.Nom) texte(cote, x.Nom, { taille: 9, style: x.Pole ? "normal" : "bold" });
        if (x.Fonction) texte(cote, x.Fonction, { taille: 8.5, style: "italic", c: COUL.doux });
        if (x.Telephone) texte(cote, x.Telephone, { taille: 9 });
        if (x.Mail) texte(cote, x.Mail, { taille: 9, c: COUL.bleu });
        cote.y += 3;
      }
    }
    doc.setPage(doc.getNumberOfPages());
    return premiere;
  }

  // 5. Remplissage du sommaire
  {
    let n = 0, page = debutSommaire, y = 0;
    const nouvellePage = () => { doc.setPage(page); y = 25; if (page === debutSommaire) { police("bold", 22); coul(COUL.bleu); doc.text("Sommaire", A4.marge + 5, y, { baseline: "top" }); y += 14; } };
    nouvellePage();
    const ligneSom = (txt, num, gras, retrait) => {
      if (y > A4.bas - 6) { if (page + 1 >= debutSommaire + nbSommaire) return; page++; nouvellePage(); }
      police(gras ? "bold" : "normal", gras ? 11.5 : 10); coul(gras ? COUL.bleu : COUL.texte);
      const x0 = A4.marge + 5 + retrait, xN = A4.l - A4.marge - 5;
      const t = doc.splitTextToSize(net(txt), xN - x0 - 15)[0];
      doc.text(t, x0, y, { baseline: "top" });
      doc.text(String(num), xN, y, { baseline: "top", align: "right" });
      const w = doc.getTextWidth(t); doc.setDrawColor(190, 197, 207); doc.setLineDashPattern([0.4, 1.2], 0);
      if (xN - 10 > x0 + w + 2) doc.line(x0 + w + 2, y + 3, xN - 8, y + 3);
      doc.setLineDashPattern([], 0);
      doc.link(x0, y, xN - x0, 5, { pageNumber: num });
      y += gras ? 8 : 6.2;
    };
    for (const e of numeros) {
      y += 2; ligneSom(e.dep, e.page, true, 0);
      for (const x of e.fiches) { ligneSom(`${x.f.Etablissement || ""}${x.f.Site ? " - " + x.f.Site : ""}`, x.page, false, 5); n++; }
    }
  }

  // 6. Pieds de page
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i); police("normal", 8); coul([140, 150, 165]);
    doc.text(`${net(opts.titre)}  -  ${i}`, A4.l / 2, A4.h - 9, { align: "center", baseline: "top" });
  }
  return doc;
}

async function generer() {
  try {
    await chargerPdf();
    const opts = {
      titre: document.getElementById("cTitre").value.trim(), sousTitre: document.getElementById("cSous").value.trim(), bas: document.getElementById("cBas").value.trim(),
      pages: [...D.pages].filter(p => p.Afficher).sort((a, b) => (a.Ordre || 0) - (b.Ordre || 0)),
      groupes: parDepartement(fichesRetenues()),
    };
    const doc = genererPdf(opts);
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
document.addEventListener("change", e => {
  const el = e.target;
  if (el.id === "choixCampagne") { CAMP = D.campagnes.find(c => c.id === +el.value); MSG = null; return afficher(); }
  if (el.name === "mode") { MODE = el.value; return afficher(); }
});
document.addEventListener("click", e => {
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

if (DANS_GRIST) {
  grist.ready({ requiredAccess: "full" });
  grist.onRecords(() => charger());
}
charger();
