// Moteur PDF des fiches CFA (jsPDF), partagé par le catalogue et le tableau de suivi.
// genererPdf(opts, donnees) : donnees = { formations, contacts, accomp } (lignes Grist) ;
// opts = { titre, sousTitre, bas, pages, groupes: [[département, [fiches]]], seul } ;
// seul = true : uniquement les fiches (export d'une fiche depuis le suivi).
"use strict";

const TOUS = "Tous départements";
const nomDep = f => f.Departement || "Sans département";
// Ordre des départements (comme le catalogue 2026) : « Tous départements » / « Autre (Greta) » en tête, puis les départements
const horsDep = d => d === TOUS || /^autre/i.test(d); // établissements présents sur plusieurs départements (GRETA)
const rangDep = d => (horsDep(d) ? 0 : 1);
const ARTICLES = { "Dordogne": "de la", "Gironde": "de la", "Landes": "des", "Lot-et-Garonne": "du", "Pyrénées-Atlantiques": "des" };
const libDep = d => (horsDep(d) ? "Tous départements" : ARTICLES[d] ? `Département ${ARTICLES[d]} ${d}` : d);
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

// ---------- Documents PDF fournis tels quels (fiches GRETA) ----------
// Colonne Document_fourni (pièce jointe Grist) : le PDF remplace la fiche générée, page pour page.
let PDFLIB_PRET = null;
function chargerPdfLib() {
  if (window.PDFLib) return Promise.resolve();
  return PDFLIB_PRET = PDFLIB_PRET || new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "lib/pdf-lib.min.js"; s.onload = ok; s.onerror = () => ko(new Error("bibliothèque pdf-lib introuvable")); document.head.appendChild(s); });
}
const idsPieces = v => (Array.isArray(v) ? v.filter(x => typeof x === "number") : typeof v === "number" ? [v] : []);
// fiches -> Map(id de fiche -> { octets, nb }) ; ignore ce qui n'est pas un PDF lisible
async function chargerDocuments(fiches) {
  const docs = new Map(), avec = fiches.filter(f => idsPieces(f.Document_fourni).length);
  if (!avec.length || typeof grist === "undefined" || window.parent === window) return docs;
  await chargerPdfLib();
  const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: true });
  for (const f of avec) {
    try {
      const id = idsPieces(f.Document_fourni)[0];
      const rep = await fetch(`${baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(token)}`);
      const octets = await rep.arrayBuffer();
      const pdf = await window.PDFLib.PDFDocument.load(octets, { ignoreEncryption: true });
      docs.set(f.id, { octets, nb: pdf.getPageCount() });
    } catch (e) { /* pièce jointe illisible : la fiche saisie est utilisée */ }
  }
  return docs;
}
// Remplace les pages réservées par les pages des documents fournis (les liens du sommaire restent valides)
async function finaliserPdf(doc, opts) {
  const places = opts._places || [];
  if (!places.length) return new Uint8Array(doc.output("arraybuffer"));
  await chargerPdfLib();
  const { PDFDocument } = window.PDFLib;
  const sortie = await PDFDocument.load(doc.output("arraybuffer"));
  for (const pl of places) {
    const src = await PDFDocument.load(pl.octets, { ignoreEncryption: true });
    const pages = await sortie.embedPdf(src, src.getPageIndices());
    pages.forEach((pg, k) => {
      const cible = sortie.getPage(pl.pages[k] - 1), { width, height } = cible.getSize();
      const e = Math.min(width / pg.width, height / pg.height);
      cible.drawPage(pg, { x: (width - pg.width * e) / 2, y: (height - pg.height * e) / 2, xScale: e, yScale: e });
    });
  }
  return await sortie.save();
}
async function telechargerPdf(doc, opts, nom) {
  const octets = await finaliserPdf(doc, opts);
  const url = URL.createObjectURL(new Blob([octets], { type: "application/pdf" }));
  const a = document.createElement("a"); a.href = url; a.download = nom; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

// Polices standard du PDF : jeu de caractères WinAnsi. On remplace ce qui n'y est pas.
const REMPL = { "’": "'", "‘": "'", "“": "\"", "”": "\"", "–": "-", "—": "-", "…": "...", " ": " ", " ": " ", "→": "->", "≈": "~", "✓": "", "•": "•" };
const OK_WINANSI = new Set([..."€‚ƒ„†‡ˆ‰Š‹ŒŽ˜™š›œžŸ•"]);
const net = s => [...String(s ?? "").normalize("NFC")].map(c => REMPL[c] ?? c).join("").split("").map(c => (c.charCodeAt(0) < 256 || OK_WINANSI.has(c) ? c : "?")).join("");

const A4 = { l: 210, h: 297, marge: 15, bas: 280 };
const COUL = { bleu: [0, 0, 145], bleuPale: [234, 241, 251], gris: [241, 244, 249], texte: [17, 24, 39], doux: [75, 85, 99], blanc: [255, 255, 255] };
const lh = (taille, inter = 1.4) => taille * 0.3528 * inter; // interligne 1,4 : texte aéré

// Deux habillages : « original » (vert et framboise, comme le catalogue 2026) et « moderne » (bleu France, filet rouge)
const STYLES = {
  original: { section: [0, 125, 58], sectionPale: [228, 244, 234], accent: [190, 30, 100], panneau: [250, 230, 238], lien: [0, 0, 145],
              couvFond: [222, 230, 236], couvTitre: [84, 108, 138], couvBadge: [52, 73, 110], filet: null },
  guide:    { section: [40, 52, 72], sectionPale: [240, 242, 246], accent: [40, 52, 72], panneau: [246, 247, 249], lien: [0, 0, 145],
              couvFond: [255, 255, 255], couvTitre: [40, 52, 72], couvBadge: [40, 52, 72], filet: null },
  moderne:  { section: [0, 0, 145], sectionPale: [232, 236, 252], accent: [0, 0, 145], panneau: [241, 244, 249], lien: [0, 0, 145],
              couvFond: [0, 0, 145], couvTitre: [255, 255, 255], couvBadge: [225, 0, 15], filet: [225, 0, 15] },
};
// Numéro de fiche comme dans le catalogue 2026 : code du département et rang (33-03), « AC » pour « Tous départements »
const CODES_DEP = { "Dordogne": "24", "Gironde": "33", "Landes": "40", "Lot-et-Garonne": "47", "Pyrénées-Atlantiques": "64" };
const DEP_COUL = { "Dordogne": [123, 63, 152], "Gironde": [139, 21, 56], "Landes": [26, 115, 70], "Lot-et-Garonne": [166, 72, 8], "Pyrénées-Atlantiques": [0, 98, 124] };
const palir = (c, t = 0.88) => c.map(v => Math.round(v + (255 - v) * t));
const codeDep = d => (horsDep(d) ? "AC" : CODES_DEP[d] || String(d).slice(0, 2).toUpperCase());

function genererPdf(opts, donnees) {
  DONNEES = donnees;
  opts._places = []; // pages réservées aux documents fournis
  const reservee = n => opts._places.some(pl => pl.pages.includes(n));
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const coul = c => { doc.setTextColor(...c); };
  const police = (style, taille) => { doc.setFont("helvetica", style); doc.setFontSize(taille); };
  const P = STYLES[opts.style] || STYLES.original;
  const GUIDE = opts.style === "guide";
  const CD = dep => (GUIDE ? (horsDep(dep) ? [0, 0, 145] : DEP_COUL[dep] || P.section) : P.section); // couleur de la rubrique
  const ordreRub = opts.groupes.map(([d]) => d);
  // onglet de couleur en bord de page (style « guide ») : position propre à chaque rubrique, comme un guide
  const ongletBord = dep => {
    if (!GUIDE) return;
    const i = Math.max(0, ordreRub.indexOf(dep)), h = Math.min(30, (A4.bas - 40) / Math.max(1, ordreRub.length)), y = 30 + i * (h + 2);
    doc.setFillColor(...CD(dep)); doc.rect(A4.l - 8, y, 8, h, "F");
    police("bold", 9); coul(COUL.blanc); doc.text(codeDep(dep), A4.l - 3, y + h / 2 + 3, { angle: 90 });
  };
  const NUMS = new Map(); // fiche -> numéro (24-01…)
  for (const [dep, fiches] of opts.groupes) fiches.forEach((f, i) => NUMS.set(f.id, `${codeDep(dep)}-${String(i + 1).padStart(2, "0")}`));
  const pied = opts.pied || `Rectorat de Bordeaux - SRAIOLDS  ·  Accompagnement vers l'apprentissage ${opts.annee || ""}`.trim();
  // bandeau d'en-tête des pages de sommaire et de séparation (comme l'original)
  const bandeauCatalogue = y => {
    doc.setFillColor(...P.section); doc.rect(A4.marge, y, A4.l - 2 * A4.marge, 15, "F");
    police("bold", 12); coul(COUL.blanc); doc.text(net(`ACCOMPAGNEMENT - APPRENTISSAGE ${opts.annee || ""}`.trim()), A4.l / 2, y + 3, { align: "center", baseline: "top" });
    police("italic", 9); doc.text("CATALOGUE DES CFA PARTENAIRES", A4.l / 2, y + 9.2, { align: "center", baseline: "top" });
    if (P.filet) { doc.setFillColor(...P.filet); doc.rect(A4.marge, y + 15, A4.l - 2 * A4.marge, 0.9, "F"); }
    return y + 20;
  };
  // tableau Fiche | Site de formation | Nom du CFA (| Page)
  const COLS = [{ t: "Fiche", w: 19 }, { t: "Site de formation", w: 48 }, { t: "Nom du CFA", w: 0 }, { t: "Page", w: 14 }];
  const larg = () => { const tot = A4.l - 2 * A4.marge; COLS[2].w = tot - COLS[0].w - COLS[1].w - COLS[3].w; return COLS; };
  const enteteTableau = (y, avecPage, c0 = P.section) => {
    doc.setFillColor(...c0); doc.rect(A4.marge, y, A4.l - 2 * A4.marge, 7, "F");
    police("bold", 9.5); coul(COUL.blanc); let x = A4.marge;
    for (const c of larg()) { if (c.t === "Page" && !avecPage) break; doc.text(c.t, x + 2.5, y + 1.9, { baseline: "top" }); x += c.w; }
    return y + 7;
  };
  const ligneTableau = (y, f, i, page, pale = P.sectionPale) => {
    if (i % 2) { doc.setFillColor(...pale); doc.rect(A4.marge, y, A4.l - 2 * A4.marge, 6.6, "F"); }
    police("normal", 9.5); coul(COUL.texte); let x = A4.marge; const c = larg();
    const vals = [NUMS.get(f.id) || "", f.Ville || f.Site || "", f.Etablissement || "", page ? String(page) : ""];
    vals.forEach((v, k) => { if (k === 3 && !page) return; doc.text(doc.splitTextToSize(net(v), c[k].w - 3)[0] || "", k === 3 ? x + c[k].w - 3 : x + 2.5, y + 1.8, { baseline: "top", align: k === 3 ? "right" : "left" }); x += c[k].w; });
    if (page) doc.link(A4.marge, y, A4.l - 2 * A4.marge, 6.6, { pageNumber: page });
    return y + 6.6;
  };

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
      if (/^##\s+/.test(ligne)) { col.y += 2; texte(col, ligne.replace(/^##\s+/, ""), { taille: 12.5, style: "bold", c: P.section, apres: 1.5 }); continue; }
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
    opts._places.forEach(pl => { pl.pages = pl.pages.map(n => n - 1); }); // la page 1 a été retirée
    for (let i = 1; i <= nb; i++) { if (reservee(i)) continue; doc.setPage(i); police("normal", 8); coul([140, 150, 165]); doc.text(`${net(opts.titre)}  -  ${i}/${nb}`, A4.l / 2, A4.h - 9, { align: "center", baseline: "top" }); }
    return doc;
  }

  // 1. Couverture : image fournie (page entière) ou couverture composée selon le style
  if (opts.seulementPages) opts.couverture = null; // aperçu des pages d'information : pas de couverture (page 1 supprimée ensuite)
  if (opts.couverture) {
    try { doc.addImage(opts.couverture, /^data:image\/png/i.test(opts.couverture) ? "PNG" : "JPEG", 0, 0, A4.l, A4.h); } catch (e) { /* image illisible : couverture composée */ opts.couverture = null; }
  }
  if (!opts.couverture && !opts.seulementPages) {
    doc.setFillColor(...P.couvFond); doc.rect(0, 0, A4.l, A4.h, "F");
    if (opts.style === "moderne") { doc.setFillColor(255, 255, 255); doc.rect(A4.marge, 18, 52, 42, "F"); }
    else { doc.setFillColor(255, 255, 255); doc.rect(0, 0, A4.l, 62, "F"); }
    if (LOGO) { try { doc.addImage(LOGO, "PNG", A4.marge + 5, 22, 42, 42 * 147 / 198); } catch (e) { /* sans logo */ } }
    police("bold", 30); coul(P.couvTitre);
    const lignesTitre = doc.splitTextToSize(net((opts.titre || "").toUpperCase()), A4.l - 2 * A4.marge - 10);
    doc.text(lignesTitre, A4.marge + 5, 90, { baseline: "top", lineHeightFactor: 1.15 });
    const yb = 90 + lignesTitre.length * lh(30, 1.15) + 6;
    doc.setFillColor(...P.couvBadge); doc.rect(A4.marge + 5, yb, 34, 14, "F");
    police("bold", 22); coul(COUL.blanc); doc.text(String(opts.annee || ""), A4.marge + 22, yb + 2.5, { align: "center", baseline: "top" });
    if (opts.sousTitre) { police("normal", 14); coul(P.couvTitre); doc.text(net(opts.sousTitre), A4.marge + 5, yb + 24, { baseline: "top" }); }
    if (P.filet) { doc.setFillColor(...P.filet); doc.rect(A4.marge + 5, A4.h - 40, 40, 1.2, "F"); }
    if (GUIDE) {
      const rub = ordreRub, w = (A4.l - 2 * A4.marge - 10) / Math.max(1, rub.length);
      rub.forEach((d, i) => {
        doc.setFillColor(...CD(d)); doc.rect(A4.marge + 5 + i * w, 200, w - 2, 34, "F");
        police("bold", 16); coul(COUL.blanc); doc.text(codeDep(d), A4.marge + 8 + i * w, 204, { baseline: "top" });
        police("normal", 7.5); doc.text(doc.splitTextToSize(net(horsDep(d) ? "Tous départements" : d), w - 7), A4.marge + 8 + i * w, 220, { baseline: "top" });
      });
    }
    police("bold", 11); coul(P.couvTitre); doc.text(doc.splitTextToSize(net(opts.bas || ""), A4.l - 2 * A4.marge - 10), A4.marge + 5, A4.h - 34, { baseline: "top" });
  }

  // 2. Pages d'information
  for (const p of opts.pages) {
    doc.addPage();
    const ctx = { pages: [doc.getNumberOfPages()], ySuite: 20, nouvelle: () => { doc.addPage(); return doc.getNumberOfPages(); } };
    const col = colonne(A4.marge + 5, A4.l - 2 * A4.marge - 10, 25, ctx);
    texte(col, p.Titre || "", { taille: 20, style: "bold", c: P.section, apres: 2 });
    doc.setFillColor(...(P.filet || P.section)); doc.rect(col.x, col.y, 25, 0.8, "F"); col.y += 7;
    riche(col, p.Texte);
  }

  if (opts.seulementPages) {
    doc.deletePage(1);
    const nb = doc.getNumberOfPages();
    for (let i = 1; i <= nb; i++) { doc.setPage(i); police("normal", 8); coul([95, 104, 118]); doc.text(`${net(pied)}  ·  aperçu ${i}/${nb}`, A4.l / 2, A4.h - 9, { align: "center", baseline: "top" }); }
    return doc;
  }

  // 3. Sommaire (pages réservées, remplies à la fin quand les numéros sont connus)
  const groupes = opts.groupes;
  const nbLignes = groupes.reduce((n, [, l]) => n + 4 + l.length, 0); // bandeau + en-tête de tableau ≈ 4 lignes
  const parPage = 30, nbSommaire = Math.max(1, Math.ceil(nbLignes / parPage)); // ≈ 34 lignes de 6,6 mm tiennent
  const debutSommaire = doc.getNumberOfPages() + 1;
  for (let i = 0; i < nbSommaire; i++) doc.addPage();

  // 4. Départements et fiches
  const numeros = [];
  for (const [dep, fiches] of groupes) {
    // « Tous départements » : pas de page de séparation (comme le catalogue 2026), les fiches suivent le sommaire
    if (horsDep(dep)) {
      const entree = { dep, page: 0, fiches: [] };
      for (const f of fiches) entree.fiches.push({ f, page: fichePdf(f) });
      entree.page = entree.fiches.length ? entree.fiches[0].page : doc.getNumberOfPages();
      numeros.push(entree); continue;
    }
    doc.addPage();
    const pDep = doc.getNumberOfPages();
    let y = bandeauCatalogue(18);
    if (GUIDE) { // grande page de couleur, comme l'intercalaire d'un guide
      doc.setFillColor(...CD(dep)); doc.rect(0, 40, A4.l, 58, "F");
      police("bold", 40); coul(COUL.blanc); doc.text(codeDep(dep), A4.marge + 5, 50, { baseline: "top" });
      police("bold", 18); doc.text(net(libDep(dep).toUpperCase()), A4.marge + 5, 72, { baseline: "top" });
      police("normal", 11); doc.text(`${fiches.length} établissement${fiches.length > 1 ? "s" : ""}`, A4.marge + 5, 84, { baseline: "top" });
      y = 106;
    } else {
      y += 6; doc.setFillColor(...P.section); doc.rect(A4.marge, y, A4.l - 2 * A4.marge, 13, "F");
      police("bold", 16); coul(COUL.blanc); doc.text(net(libDep(dep).toUpperCase()), A4.l / 2, y + 3.6, { align: "center", baseline: "top" });
      y += 19;
    }
    y = enteteTableau(y, false, CD(dep));
    fiches.forEach((f, i) => { if (y < A4.bas - 6) y = ligneTableau(y, f, i, 0, palir(CD(dep))); });
    ongletBord(dep);
    const entree = { dep, page: pDep, fiches: [] };
    for (const f of fiches) entree.fiches.push({ f, page: fichePdf(f) });
    numeros.push(entree);
  }

  function fichePdf(f) {
    const fourni = opts.documents && opts.documents.get(f.id);
    if (fourni) { // pages blanches réservées, remplies ensuite par le document fourni (finaliserPdf)
      const pages = [];
      for (let k = 0; k < fourni.nb; k++) { doc.addPage(); pages.push(doc.getNumberOfPages()); }
      opts._places.push({ octets: fourni.octets, pages });
      return pages[0];
    }
    const titre = net(f.Etablissement || "");
    const C0 = CD(nomDep(f));
    const enTete = (suite) => {
      ongletBord(nomDep(f));
      const num = NUMS.get(f.id) || "", dep = horsDep(nomDep(f)) ? "Tous départements" : `Département : ${CODES_DEP[nomDep(f)] || nomDep(f)}`;
      if (opts.style === "moderne") {
        doc.setFillColor(...P.section); doc.rect(0, 0, A4.l, suite ? 16 : 30, "F");
        if (P.filet) { doc.setFillColor(...P.filet); doc.rect(0, suite ? 16 : 30, A4.l, 0.9, "F"); }
        coul(COUL.blanc);
      }
      if (suite) { police("bold", 11); coul(opts.style === "moderne" ? COUL.blanc : P.accent); doc.text(doc.splitTextToSize(titre + " (suite)", A4.l - 2 * A4.marge - 30)[0], A4.marge, 6, { baseline: "top" }); }
      else {
        police("normal", 8.5); coul(opts.style === "moderne" ? COUL.blanc : COUL.doux); doc.text(net(dep), A4.marge, 5, { baseline: "top" });
        police("bold", 17); coul(opts.style === "moderne" ? COUL.blanc : GUIDE ? C0 : P.accent); doc.text(doc.splitTextToSize(titre, A4.l - 2 * A4.marge - 30)[0], A4.marge, 10.5, { baseline: "top" });
        police("normal", 10.5); coul(opts.style === "moderne" ? COUL.blanc : COUL.texte); doc.text(net(f.Site || ""), A4.marge, 19.5, { baseline: "top" });
        if (opts.style !== "moderne") { doc.setFillColor(...(GUIDE ? C0 : P.accent)); doc.rect(A4.marge, 27, A4.l - 2 * A4.marge - (GUIDE ? 6 : 0), GUIDE ? 1.2 : 0.6, "F"); }
      }
      if (num) {
        if (GUIDE) { doc.setFillColor(...C0); doc.roundedRect(A4.l - A4.marge - 24, 3, 18, 7, 1.5, 1.5, "F"); police("bold", 10); coul(COUL.blanc); doc.text(num, A4.l - A4.marge - 15, 4.4, { baseline: "top", align: "center" }); }
        else { police("bold", 10); coul(opts.style === "moderne" ? COUL.blanc : P.accent); doc.text(num, A4.l - A4.marge, 5, { baseline: "top", align: "right" }); }
      }
      if (!suite) fondCote(36);
    };
    const fondCote = y0 => { doc.setFillColor(...(GUIDE ? palir(C0, 0.92) : P.panneau)); doc.rect(A4.marge - 3, y0, 64, A4.bas - y0 + 3, "F"); };
    doc.addPage(); enTete(false);
    const premiere = doc.getNumberOfPages();
    const ctx = { pages: [premiere], ySuite: 26, nouvelle: () => { doc.addPage(); enTete(true); return doc.getNumberOfPages(); } };
    const intertitre = (col, s) => { col.y += 1.5; texte(col, s.toUpperCase(), { taille: 10, style: "bold", c: GUIDE ? C0 : P.accent, apres: 2.5 }); };

    // Colonne principale : formations, puis accompagnement
    const main = colonne(84, A4.l - 84 - A4.marge, 41, ctx);
    intertitre(main, "Formations proposées");
    const forms = DONNEES.formations.filter(x => x.Fiche === f.id && x.Statut !== "Fermée");
    const fil = new Map(); for (const x of forms) { const k = x.Filiere || "Autres formations"; if (!fil.has(k)) fil.set(k, []); fil.get(k).push(x); }
    if (!forms.length) texte(main, "Aucune formation renseignée.", { c: COUL.doux });
    for (const [k, l] of fil) {
      place(main, lh(10.5) * 3);
      texte(main, "> " + k, { taille: 10.5, style: "bold", c: opts.style === "moderne" || GUIDE ? COUL.texte : P.section, apres: 0.8 });
      for (const x of l) {
        police("normal", 10);
        police("normal", 10.5);
        const hauteur = doc.splitTextToSize(net(x.Intitule || ""), main.w - 5).length * lh(10.5) + (x.Remarque ? lh(9) : 0);
        place(main, hauteur); // la formation et sa remarque restent sur la même page
        texte(main, x.Intitule || "", { taille: 10.5, retrait: 5, puce: "•", apres: 0.6 });
        if (x.Remarque) texte(main, x.Remarque, { taille: 9, style: "italic", c: COUL.doux, retrait: 5, apres: 0.6 });
      }
      main.y += 4;
    }
    main.y += 3;
    const acts = DONNEES.accomp.filter(x => x.Fiche === f.id && x.Cochee);
    if (f.Presentation_accompagnement || acts.length) {
      place(main, lh(10) * 4);
      intertitre(main, "Modalités d'accompagnement");
      if (f.Presentation_accompagnement) texte(main, f.Presentation_accompagnement, { taille: 10.5, apres: 3 });
      for (const x of acts) texte(main, x.Action || "", { taille: 10.5, retrait: 5, puce: "•", apres: 0.6 });
    }

    // Colonne de côté : coordonnées et contacts
    doc.setPage(premiere);
    const cote = colonne(A4.marge, 58, 41, ctx);
    cote.fond = () => fondCote(22);
    intertitre(cote, "Coordonnées");
    const ville = [f.Code_postal, f.Ville].filter(Boolean).join(" ");
    for (const v of [f.Adresse, ville]) if (v) texte(cote, v, { taille: 9.5 });
    cote.y += 2;
    if (f.Telephone) texte(cote, "Tél. " + f.Telephone, { taille: 9.5 });
    if (f.Mail) texte(cote, f.Mail, { taille: 9.5, c: P.lien });
    if (f.Site_internet) texte(cote, f.Site_internet, { taille: 9.5, c: P.lien });
    const cts = DONNEES.contacts.filter(x => x.Fiche === f.id);
    if (cts.length) {
      cote.y += 6; intertitre(cote, cts.length > 1 ? "Contacts" : "Contact");
      for (const x of cts) {
        place(cote, lh(9.5) * 4);
        if (x.Nom) texte(cote, x.Nom, { taille: 9.5, style: "bold" });
        if (x.Fonction) texte(cote, x.Fonction, { taille: 9, style: "italic", c: COUL.doux });
        if (x.Telephone) texte(cote, x.Telephone, { taille: 9.5 });
        if (x.Mail) texte(cote, x.Mail, { taille: 9.5, c: P.lien });
        cote.y += 4.5;
      }
    }
    doc.setPage(doc.getNumberOfPages());
    return premiere;
  }

  // 5. Remplissage du sommaire : bandeau, puis par rubrique un intitulé et un tableau (comme l'original)
  {
    let page = debutSommaire, y = 0;
    const nouvellePage = avecEnTete => { doc.setPage(page); y = bandeauCatalogue(18) + 2; };
    nouvellePage();
    const reste = h => { if (y + h > A4.bas - 2) { if (page + 1 >= debutSommaire + nbSommaire) return false; page++; nouvellePage(); } return true; };
    for (const e of numeros) {
      if (!reste(7 + 7 + 6.6 + 6)) break;
      y += 6; doc.setFillColor(...CD(e.dep)); doc.rect(A4.marge, y, A4.l - 2 * A4.marge, 7, "F");
      police("bold", 10.5); coul(COUL.blanc); doc.text(net(libDep(e.dep).toUpperCase()), A4.l / 2, y + 1.7, { align: "center", baseline: "top" });
      doc.link(A4.marge, y, A4.l - 2 * A4.marge, 7, { pageNumber: e.page });
      y += 7.6; y = enteteTableau(y, true, GUIDE ? CD(e.dep) : P.section); // couleur pleine : texte blanc bien contrasté
      e.fiches.forEach((x, i) => {
        const avant = page;
        if (!reste(6.6)) return;
        if (page !== avant) y = enteteTableau(y, true, GUIDE ? CD(e.dep) : P.section); // tableau coupé : on répète l'en-tête
        y = ligneTableau(y, x.f, i, x.page, GUIDE ? palir(CD(e.dep)) : P.sectionPale);
      });
    }
  }

  // 6. Pieds de page
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    if (reservee(i)) continue; // page d'un document fourni : il a son propre pied de page
    doc.setPage(i); police("normal", 8); coul([95, 104, 118]);
    doc.text(`${net(pied)}  ·  ${i}`, A4.l / 2, A4.h - 9, { align: "center", baseline: "top" });
  }
  return doc;
}
