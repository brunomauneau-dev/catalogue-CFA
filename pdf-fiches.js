// Moteur PDF des fiches CFA (jsPDF), partagé par le catalogue et le tableau de suivi.
// genererPdf(opts, donnees) : donnees = { formations, contacts, accomp } (lignes Grist) ;
// opts = { titre, sousTitre, bas, pages, groupes: [[département, [fiches]]], seul } ;
// seul = true : uniquement les fiches (export d'une fiche depuis le suivi).
"use strict";

const TOUS = "Tous départements";
const nomDep = f => f.Departement || "Sans département";
// Ordre des départements : « Tous départements » en tête, les rubriques « Autre… » (ex. « Autre (Greta) ») à la fin
const rangDep = d => (d === TOUS ? 0 : /^autre/i.test(d) ? 2 : 1);
const ordreDep = (a, b) => rangDep(a) - rangDep(b) || String(a).localeCompare(String(b), "fr");
let DONNEES = null;

let PDF_PRET = null;
let LOGO = null; // logo de l'académie (image PNG en data URL), pour la couverture
function chargerLogo() {
  return fetch("img/logo-academie.png").then(r => (r.ok ? r.blob() : null)).then(b => b && new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(b); }))
    .then(d => { LOGO = d || null; }).catch(() => { LOGO = null; });
}
function chargerPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return LOGO ? Promise.resolve() : chargerLogo();
  return PDF_PRET = PDF_PRET || chargerLogo().then(() => undefined).then(() => new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "lib/jspdf.umd.min.js"; s.onload = ok; s.onerror = () => ko(new Error("bibliothèque PDF introuvable")); document.head.appendChild(s); }));
}

// Polices standard du PDF : jeu de caractères WinAnsi. On remplace ce qui n'y est pas.
const REMPL = { "’": "'", "‘": "'", "“": "\"", "”": "\"", "–": "-", "—": "-", "…": "...", " ": " ", " ": " ", "→": "->", "≈": "~", "✓": "", "•": "•" };
const OK_WINANSI = new Set([..."€‚ƒ„†‡ˆ‰Š‹ŒŽ˜™š›œžŸ•"]);
const net = s => [...String(s ?? "").normalize("NFC")].map(c => REMPL[c] ?? c).join("").split("").map(c => (c.charCodeAt(0) < 256 || OK_WINANSI.has(c) ? c : "?")).join("");

const A4 = { l: 210, h: 297, marge: 15, bas: 280 };
const COUL = { bleu: [0, 0, 145], bleuPale: [234, 241, 251], gris: [241, 244, 249], texte: [17, 24, 39], doux: [75, 85, 99], blanc: [255, 255, 255] };
const lh = (taille, inter = 1.3) => taille * 0.3528 * inter;

function genererPdf(opts, donnees) {
  DONNEES = donnees;
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

  if (opts.seul) {
    for (const [, fiches] of opts.groupes) for (const f of fiches) fichePdf(f);
    doc.deletePage(1);
    const nb = doc.getNumberOfPages();
    for (let i = 1; i <= nb; i++) { doc.setPage(i); police("normal", 8); coul([140, 150, 165]); doc.text(`${net(opts.titre)}  -  ${i}/${nb}`, A4.l / 2, A4.h - 9, { align: "center", baseline: "top" }); }
    return doc;
  }

  // 1. Couverture (logo de l'académie sur une tuile blanche)
  doc.setFillColor(...COUL.bleu); doc.rect(0, 0, A4.l, A4.h, "F");
  if (LOGO) { try { doc.setFillColor(255, 255, 255); doc.rect(A4.marge, 18, 52, 42, "F"); doc.addImage(LOGO, "PNG", A4.marge + 5, 22, 42, 42 * 147 / 198); } catch (e) { /* logo illisible : couverture sans logo */ } }
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
    police("normal", 12); coul(COUL.blanc); doc.text(net(dep === TOUS ? "CFA présents sur plusieurs départements" : /^autre/i.test(dep) ? "Autres établissements" : "Département"), A4.marge + 5, 70, { baseline: "top" });
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
    const forms = DONNEES.formations.filter(x => x.Fiche === f.id && x.Statut !== "Fermée");
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
    const acts = DONNEES.accomp.filter(x => x.Fiche === f.id && x.Cochee);
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
    const cts = DONNEES.contacts.filter(x => x.Fiche === f.id);
    if (cts.length) {
      cote.y += 4; intertitre(cote, cts.length > 1 ? "Contacts" : "Contact");
      for (const x of cts) {
        place(cote, lh(9) * 4);
        if (x.Nom) texte(cote, x.Nom, { taille: 9, style: "bold" });
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
