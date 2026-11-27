// Batterie de tests (données fictives uniquement) : à lancer avant chaque push.
//   node tests/lancer.js                  tous les tests
//   node tests/lancer.js suivi page       seulement les groupes dont le nom contient « suivi » ou « page »
//   node tests/lancer.js --maj-references met à jour les captures de référence (après un changement d'affichage voulu)
// Chaque page est ouverte hors de Grist : les widgets affichent alors leurs données de démonstration.
// Contrôles : comportements, absence d'erreur JavaScript, absence de débordement horizontal (3 largeurs),
// et comparaison des captures d'écran avec tests/references/ (tests/comparer.py).
"use strict";
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs"), { execFileSync } = require("child_process");

const RACINE = path.resolve(__dirname, "..");
const SORTIE = path.join(__dirname, "sortie"); fs.mkdirSync(path.join(SORTIE, "captures"), { recursive: true });
const url = (f, q = "") => "file://" + path.join(RACINE, f) + q;
const ARGS = process.argv.slice(2), MAJ_REF = ARGS.includes("--maj-references"), FILTRES = ARGS.filter(a => !a.startsWith("--"));
const LARGEURS = [["telephone", 390, 844], ["tablette", 800, 1000], ["ordinateur", 1440, 900]];

const resultats = [];
let navigateur;
async function page(fichier, { largeur = 1280, hauteur = 900, q = "" } = {}) {
  const p = await navigateur.newPage({ viewport: { width: largeur, height: hauteur }, acceptDownloads: true });
  p._erreurs = [];
  p.on("pageerror", e => p._erreurs.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::|URL scheme "file" is not supported/.test(m.text())) p._erreurs.push("console : " + m.text()); });
  await p.route("**/grist-plugin-api.js", r => r.fulfill({ body: "" }));
  await p.route(/^https?:\/\//, r => r.abort()); // aucun appel réseau pendant les tests
  await p.goto(url(fichier, q)); await p.waitForTimeout(500);
  return p;
}
function verifier(cond, msg) { if (!cond) throw new Error(msg); }
const egal = (a, b, msg) => verifier(JSON.stringify(a) === JSON.stringify(b), `${msg} : attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
async function sansErreur(p) { verifier(!p._erreurs.length, "erreurs JavaScript : " + p._erreurs.join(" | ")); }
async function capture(p, nom, pleine = false) { await p.screenshot({ path: path.join(SORTIE, "captures", nom + ".png"), fullPage: pleine }); }
const T = {}; const test = (groupe, nom, fn) => { (T[groupe] = T[groupe] || []).push([nom, fn]); };

// ---------------------------------------------------------------- formulaire : page « catalogue »
test("page", "ouverture : fiche affichée comme dans le catalogue, choix « Rien n'a changé »", async () => {
  const p = await page("index.html");
  egal(await p.locator(".page-fiche").count(), 1, "page de fiche");
  egal(await p.locator("[data-rien]").count(), 1, "bouton « Rien n'a changé »");
  egal(await p.locator(".signal textarea").count(), 1, "zone « Autre chose à signaler »");
  verifier((await p.locator(".ct.a-verif").count()) === 1, "contact « À vérifier » signalé");
  await capture(p, "page-ouverture"); await sansErreur(p); await p.close();
});
test("page", "correction en place, mise en forme du téléphone et contrôle", async () => {
  const p = await page("index.html");
  const tel = () => p.locator('.cote-fiche [data-c="Telephone"]').first();
  await tel().click(); await p.keyboard.press("Control+A"); await p.keyboard.type("0556"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  egal(await p.locator(".err-txt").count(), 1, "erreur de format affichée");
  await tel().click(); await p.keyboard.press("Control+A"); await p.keyboard.type("+33 5 56 12 34 56"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  egal(await tel().innerText(), "05 56 12 34 56", "téléphone remis en forme");
  verifier(await tel().evaluate(e => e.classList.contains("mod")), "téléphone surligné comme modifié");
  await sansErreur(p); await p.close();
});
test("page", "retrait / remise / ajout de formation, action modifiée et ajoutée, message, envoi et récapitulatif", async () => {
  const p = await page("index.html");
  await p.locator(".corps-fiche li").first().hover(); await p.locator('[data-retirer="formations"]').first().click();
  egal(await p.locator('[data-remettre="formations"]').count(), 1, "formation retirée (barrée, « remettre »)");
  await p.click('[data-remettre="formations"]'); egal(await p.locator('[data-remettre="formations"]').count(), 0, "formation remise");
  await p.locator(".corps-fiche li").first().hover(); await p.locator('[data-retirer="formations"]').first().click();
  await p.click('[data-plus="formation"]'); await p.fill("#chercheForm", "peintre");
  verifier((await p.locator(".resultat").count()) >= 1, "recherche dans la liste officielle"); await p.locator(".resultat").first().click();
  await p.fill("#chercheForm", "").catch(() => {});
  const act = p.locator('.corps-fiche [data-t="accomp"]').first(); await act.click(); await p.keyboard.press("End"); await p.keyboard.type(" sur rendez-vous"); await p.keyboard.press("Enter");
  await p.click('[data-plus="action"]'); await p.fill("#nvActionPage", "Action fictive"); await p.click("[data-valider-action]");
  await p.fill("#msgCfa", "Message fictif"); await p.waitForTimeout(1800);
  verifier(/Enregistré automatiquement/.test(await p.locator("#resume").innerText()), "enregistrement automatique signalé");
  egal(await p.locator(".compte").innerText(), "5 modifications", "compteur (formation retirée et ajoutée, action modifiée et ajoutée, message)");
  await capture(p, "page-correction", true);
  await p.click("[data-envoyer-page]"); egal(await p.locator(".modale").count(), 1, "confirmation avant envoi"); await p.click("[data-oui]"); await p.waitForTimeout(300);
  egal(await p.locator(".merci li").count(), 5, "récapitulatif des changements");
  await capture(p, "page-merci");
  await p.click("[data-revoir]"); egal(await p.locator(".choix.envoye").count(), 1, "fiche marquée envoyée, encore corrigeable");
  await sansErreur(p); await p.close();
});
test("page", "envoi refusé si un format est faux ; « Rien n'a changé » envoie après confirmation", async () => {
  const p = await page("index.html");
  await p.locator('.cote-fiche [data-c="Mail"]').first().click(); await p.keyboard.press("Control+A"); await p.keyboard.type("mail-sans-arobase"); await p.keyboard.press("Enter");
  await p.click("[data-envoyer-page]"); await p.waitForTimeout(150);
  egal(await p.locator(".modale").count(), 0, "pas de confirmation"); verifier(/format à corriger/.test(await p.locator(".bandeau").first().innerText()), "message d'erreur");
  await p.close();
  const q = await page("index.html");
  await q.click("[data-rien]"); await q.click("[data-oui]"); await q.waitForTimeout(300);
  verifier(/sans changement/.test(await q.locator(".merci .recap").innerText()), "confirmation sans changement");
  await sansErreur(q); await q.close();
});

test("page", "retour de l'établissement après une correction : bandeau de reprise au lieu de la question", async () => {
  const p = await page("index.html", { q: "?demo=reprise" });
  egal(await p.locator(".choix.reprise").count(), 1, "bandeau de reprise");
  egal(await p.locator("[data-rien]").count(), 0, "pas de « Rien n'a changé » (il enverrait les corrections)");
  verifier(/commencé à corriger votre fiche le/.test(await p.locator(".choix.reprise h2").innerText()), "date de la dernière correction");
  egal(await p.locator(".choix.reprise [data-envoyer-page]").count(), 1, "bouton d'envoi dans le bandeau");
  await capture(p, "page-reprise"); await sansErreur(p); await p.close();
});

// ---------------------------------------------------------------- formulaire classique (SAIO et lien « formulaire classique »)
async function classique() { const p = await page("index.html"); await p.click("[data-classique]"); await p.waitForTimeout(200); return p; }
test("classique", "mise en forme, plusieurs numéros, envoi bloqué puis accepté", async () => {
  const p = await classique();
  const tel = p.locator('input[data-t="fiche"][data-c="Telephone"]');
  await tel.fill("0556123456"); await tel.blur(); egal(await tel.inputValue(), "05 56 12 34 56", "format du téléphone");
  await tel.fill("05 56 12 34 56 / +33 6 12 34 56 78"); await tel.blur(); egal(await tel.inputValue(), "05 56 12 34 56 / 06 12 34 56 78", "deux numéros");
  const mail = p.locator('input[data-t="fiche"][data-c="Mail"]'); await mail.fill(" Contact@Exemple.FR "); await mail.blur(); egal(await mail.inputValue(), "contact@exemple.fr", "mail");
  await tel.fill("05 56"); await tel.blur(); await p.check("#certif"); await p.click("#envoyer");
  verifier(/format à corriger/.test(await p.locator(".bandeau").first().innerText()), "envoi bloqué");
  await tel.fill("0556123456"); await tel.blur(); await p.click("#envoyer"); await p.waitForTimeout(200);
  verifier(/Fiche envoyée/.test(await p.locator(".bandeau").first().innerText()), "envoi accepté");
  await sansErreur(p); await p.close();
});
test("classique", "site par formation, catégorie et texte des actions, contact à vérifier", async () => {
  const p = await classique();
  egal(await p.locator("#nvLieu").count(), 1, "champ site à l'ajout");
  const opt = await p.evaluate(() => document.querySelector("#listeRef option").value);
  await p.fill("#nvFormation", opt); await p.fill("#nvLieu", "Site fictif"); await p.click("#ajoutFormation");
  await p.click('[data-tout="fil:"][data-ouvre="1"]'); verifier((await p.locator(".lieu-ligne input").count()) >= 2, "champ site par formation");
  await p.fill("#nvAction", "Action fictive"); await p.selectOption("#nvGroupe", "Information"); await p.click("#ajoutAction");
  const groupes = await p.$$eval('details.pli[data-pli^="acc:"] summary .nomgrp', l => l.map(x => x.textContent));
  egal(groupes[0], "Information", "catégories dans l'ordre du parcours");
  egal(await p.locator(".pill.a-verifier").count(), 1, "contact à vérifier");
  await capture(p, "classique", true); await sansErreur(p); await p.close();
});

// ---------------------------------------------------------------- suivi
test("suivi", "récapitulatif et filtres, chevron, cellules cliquables, logo PDF", async () => {
  const p = await page("suivi.html", { largeur: 1440 });
  const lignes = () => p.locator("table.suivi tbody tr:not(.dep):not(.detail)").count();
  egal(await lignes(), 3, "lignes"); await p.click('[data-recap="0"]'); egal(await lignes(), 1, "filtre « À envoyer »");
  await p.click('[data-recap="0"]'); egal(await lignes(), 3, "retour à toutes les fiches");
  egal(await p.locator('button:has-text("Détails")').count(), 0, "plus de bouton « Détails »");
  await p.locator(".pli-ligne").first().click(); egal(await p.locator("tr.detail").count(), 1, "chevron : dépliage");
  await p.locator(".pli-ligne").first().click(); egal(await p.locator("tr.detail").count(), 0, "chevron : repli");
  await p.locator('[data-vers="echanges"]').first().click(); await p.waitForTimeout(300);
  egal(await p.evaluate(() => document.activeElement && document.activeElement.id), "eObjet", "« Noter un échange » place le curseur");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.locator(".ico-pdf").first().click()]);
  verifier(/\.pdf$/.test(dl.suggestedFilename()), "export PDF d'une fiche");
  await capture(p, "suivi-encours"); await sansErreur(p); await p.close();
});
test("suivi", "mails : repli sur les contacts, fiche sans adresse signalée, phrase « vérifier vos contacts »", async () => {
  const p = await page("suivi.html", { largeur: 1440 });
  await p.evaluate(() => { window.__o = []; window.open = u => { window.__o.push(u); return null; };
    const f = D.fiches.find(x => x.id === 4); f.Mail = "";
    D.contacts.push({ id: 991, Fiche: 4, Fonction: "Accueil", Nom: "Fictif", Mail: "a@fictif.fr" }, { id: 992, Fiche: 4, Fonction: "Direction", Nom: "Fictif 2", Mail: "b@fictif.fr / a@fictif.fr" }); afficher(); });
  await p.click("[data-envoyer]"); await p.waitForTimeout(200);
  const u = await p.evaluate(() => decodeURIComponent(window.__o[0]));
  egal(u.split("?")[0].replace("mailto:", "").split(",").length, 2, "deux destinataires sans doublon");
  verifier(u.includes("vérifier en particulier vos contacts"), "phrase sur les contacts");
  await p.evaluate(() => { D.contacts.filter(c => c.Fiche === 4).forEach(c => c.Mail = ""); D.fiches.find(x => x.id === 4).Lien_envoye_le = null; afficher(); });
  verifier((await p.locator(".sous.retard", { hasText: "aucune adresse mail" }).count()) === 1, "fiche sans adresse signalée");
  await sansErreur(p); await p.close();
});
test("suivi", "lien du formulaire en mode intégré (embed=true) ; fiche « en cours de correction »", async () => {
  const p = await page("suivi.html", { largeur: 1440 });
  await p.evaluate(() => { window.__o = []; window.open = u => { window.__o.push(u); return null; }; });
  await p.click("[data-envoyer]"); await p.waitForTimeout(200);
  const corps = await p.evaluate(() => decodeURIComponent(window.__o[0]));
  verifier(/Code_=[^&\s]+&embed=true/.test(corps), "lien avec Code_ et embed=true");
  await p.evaluate(() => { const f = D.fiches.find(x => x.Etablissement === "CFA Démo B" && x.Campagne === (D.campagnes.find(c => c.Active) || {}).id); f.Brouillon_le = Date.now() / 1000; afficher(); });
  egal(await p.locator(".sous.en-cours", { hasText: "en cours de correction" }).count(), 1, "repère « en cours de correction »");
  await sansErreur(p); await p.close();
});
test("suivi", "comparaison : doublons multi-sites, changement de site, action modifiée, décochée, nouvelle", async () => {
  const p = await page("suivi.html");
  const r = await p.evaluate(() => {
    D.fiches.push({ id: 901, Campagne: 1, Etablissement: "Fictif", Departement: "Gironde" }, { id: 902, Campagne: 2, Fiche_precedente: 901, Etablissement: "Fictif", Departement: "Gironde" });
    const fo = (id, Fiche, Intitule, Lieu, Remarque = "") => ({ id, Fiche, Intitule, Lieu, Filiere: "X", Remarque, Statut: "Maintenue" });
    D.formations.push(fo(9001, 901, "CAP X", "Site A"), fo(9002, 901, "CAP X", "Site B", "en 2 ans"), fo(9003, 901, "CAP Y", "Site A"),
                      fo(9004, 902, "CAP X", "Site A"), fo(9005, 902, "CAP X", "Site B", "en 2 ans"), fo(9006, 902, "CAP Y", "Site C"));
    const ac = (id, Fiche, Groupe, Action, Cochee = true) => ({ id, Fiche, Groupe, Action, Cochee });
    D.accomp.push(ac(9101, 901, "Information", "JPO le 14 mars 2026"), ac(9102, 901, "Recherche d'entreprise", "Job dating"),
                  ac(9201, 902, "Information", "JPO le 13 mars 2027"), ac(9202, 902, "Recherche d'entreprise", "Job dating", false), ac(9203, 902, "Recherche d'entreprise", "Atelier CV"));
    const ct = (id, Fiche, Telephone) => ({ id, Fiche, Nom: "", Fonction: "Accueil", Telephone, Mail: "" });
    D.contacts.push(ct(9301, 901, "01 00 00 00 01"), ct(9302, 901, "01 00 00 00 02"), ct(9303, 902, "01 00 00 00 02"), ct(9304, 902, "01 00 00 00 01"));
    return changements(D.fiches.find(f => f.id === 902)).map(c => c.lib);
  });
  egal(r.sort(), ["Action modifiée", "Décochée", "Nouvelle action", "Site · CAP Y"].sort(), "changements détectés");
  await sansErreur(p); await p.close();
});
test("suivi", "GRETA : PDF téléchargé à l'identique, visionneuse, onglet 2026", async () => {
  const p = await page("suivi.html", { largeur: 1440 });
  await p.addScriptTag({ path: path.join(RACINE, "lib/pdf-lib.min.js") });
  await p.evaluate(async () => {
    const d = await PDFLib.PDFDocument.create(); d.addPage([595, 842]).drawText("GRETA fictif", { x: 50, y: 780, size: 24 });
    window.__ORIG = await d.saveAsBase64();
    for (const f of D.fiches.filter(f => f.Etablissement === "CFA Démo A")) { f.Departement = "Autre (Greta)"; f.Etablissement = "GRETA fictif"; }
    D.fiches.find(f => f.Etablissement === "GRETA fictif" && f.Campagne === 1).PDF_depose = "data:application/pdf;base64," + window.__ORIG; afficher();
  });
  const ligne = p.locator("tr", { hasText: "GRETA fictif" }).first();
  const [dl] = await Promise.all([p.waitForEvent("download"), ligne.locator(".ico-pdf").click()]);
  egal(fs.readFileSync(await dl.path()).toString("base64"), await p.evaluate(() => window.__ORIG), "PDF identique à l'original");
  await ligne.locator("[data-voir-pdf]").first().click(); await p.waitForTimeout(300);
  egal(await p.locator(".visionneuse").count(), 1, "visionneuse"); await p.keyboard.press("Escape");
  await p.click('[data-onglet="closes"]'); await p.waitForTimeout(200);
  egal(await p.locator("table.suivi thead th").count(), 4, "onglet 2026 : 4 colonnes");
  await capture(p, "suivi-closes"); await sansErreur(p); await p.close();
});

// ---------------------------------------------------------------- catalogue
test("catalogue", "onglet : alertes, brouillon conservé, aperçu de la page de garde", async () => {
  const p = await page("catalogue.html");
  verifier((await p.locator(".bandeau.err").count()) >= 1, "alerte fiches exclues");
  await p.click("details.pli summary"); await p.fill('[data-c="Titre"]', "Titre fictif");
  await p.check('input[name="mode"][value="actuelle"]'); egal(await p.inputValue('[data-c="Titre"]'), "Titre fictif", "saisie conservée");
  egal(await p.locator(".pill.modif").count(), 1, "pastille « non enregistrée »");
  await capture(p, "catalogue", true); await sansErreur(p); await p.close();
});
test("catalogue", "PDF complet (données fictives riches) : pages, rubriques, titres non coupés", async () => {
  const p = await page("catalogue.html");
  await p.addScriptTag({ path: path.join(RACINE, "lib/pdf-lib.min.js") });
  await p.evaluate(async () => {
    const D = window.CATALOGUE_DEMO;
    const g = await PDFLib.PDFDocument.create(); for (const n of [1, 2]) g.addPage([595, 842]).drawText("GRETA fictif " + n, { x: 50, y: 780, size: 20 });
    const greta = "data:application/pdf;base64," + await g.saveAsBase64();
    const F = [], FO = [], CO = [], AC = []; let id = 1, fid = 1;
    const fiche = (Etablissement, Departement, extra = {}) => { const f = { id: fid++, Campagne: 1, Etablissement, Departement, Adresse: "12 avenue Fictive", Code_postal: "00000", Ville: "Villefictive", Telephone: "05 00 00 00 00", Finalisee_le: 1, ...extra }; F.push(f); return f; };
    const forms = (f, l) => l.forEach(([Intitule, Filiere, Lieu]) => FO.push({ id: id++, Fiche: f.id, Intitule, Filiere, Lieu: Lieu || "", Remarque: "", Statut: "Maintenue" }));
    // PDF du GRETA stocké en morceaux (table Pdf_morceaux), comme les PDF de plus de 1 Mo
    const gr = fiche("GRETA-CFA fictif", "Autre (Greta)"); const b64 = greta.split(",")[1], t = Math.ceil(b64.length / 3);
    definirMorceaux([0, 1, 2].map(k => ({ id: 800 + k, Fiche: gr.id, Rang: 3 - k, Donnees: b64.slice((2 - k) * t, (3 - k) * t) })).reverse().reverse());
    ["Dordogne", "Gironde", "Landes", "Lot-et-Garonne", "Pyrénées-Atlantiques"].forEach(d => { for (let j = 0; j < 3; j++) { const f = fiche(`CFA fictif ${d} ${j + 1}${j === 0 ? " – Campus des métiers et des qualifications" : ""}`, d); forms(f, [["CAP Maçon", "Bâtiment, Travaux publics"], ["CAP Cuisine", "Hôtellerie, Restauration"]]); CO.push({ id: id++, Fiche: f.id, Nom: "Prénom NOM", Fonction: "Accueil" }); AC.push({ id: id++, Fiche: f.id, Action: "Entretien individuel", Cochee: true }); } });
    const multi = fiche("CFA fictif multi-sites", "Gironde"); forms(multi, ["Site A", "Site B"].flatMap(s => [["CAP Maçon", "Bâtiment, Travaux publics", s], ["CAP Couvreur", "Bâtiment, Travaux publics", s]]));
    const long = fiche("CFA fictif très complet", "Landes"); forms(long, Array.from({ length: 70 }, (_, i) => ["CAP Formation fictive " + (i + 1), ["Agriculture, Paysage, Forêt", "Industrie, Maintenance"][i % 2]]));
    Object.assign(D, { fiches: F, formations: FO, contacts: CO, accomp: AC });
  });
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), p.click("#generer")]);
  const fic = path.join(SORTIE, "catalogue-test.pdf"); await dl.saveAs(fic);
  const txt = execFileSync("pdftotext", ["-layout", fic, "-"]).toString();
  const pages = (txt.match(/\f/g) || []).length;
  verifier(pages >= 25 && pages <= 34, "nombre de pages plausible : " + pages);
  verifier(/AUTRE \(GRETA\)/.test(txt) && !/Tous d[ée]partements/i.test(txt), "rubrique « Autre (Greta) »");
  verifier(txt.includes("qualifications"), "noms longs non coupés (sommaire et titres)");
  verifier(/\(suite\)/.test(txt), "page de suite avec rappel");
  verifier(/GRETA fictif 1/.test(txt) && /GRETA fictif 2/.test(txt), "les 2 pages du PDF GRETA insérées");
  verifier(/Site A/.test(txt) && /Site B/.test(txt), "regroupement par site");
  await sansErreur(p); await p.close();
});

// ---------------------------------------------------------------- affichage : 3 largeurs, sans débordement
for (const [fichier, nom, avant] of [["index.html", "formulaire"], ["suivi.html", "suivi"], ["suivi.html", "suivi-catalogue", async p => { await p.click('[data-onglet="catalogue"]'); await p.waitForTimeout(400); }], ["catalogue.html", "catalogue"]]) {
  for (const [lib, l, h] of LARGEURS) test("affichage", `${nom} · ${lib} (${l} px) : pas de débordement horizontal`, async () => {
    const p = await page(fichier, { largeur: l, hauteur: h }); if (avant) await avant(p);
    const deb = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    verifier(deb <= 1, `débordement de ${deb} px`);
    const coupes = await p.evaluate(() => [...document.querySelectorAll("button, .pill, .etat-fiche")].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== "visible").length);
    verifier(!coupes, `${coupes} bouton(s) ou pastille(s) au texte coupé`);
    await capture(p, `${nom}-${lib}`); await sansErreur(p); await p.close();
  });
}

// ---------------------------------------------------------------- lancement
(async () => {
  navigateur = await chromium.launch();
  const groupes = Object.keys(T).filter(g => !FILTRES.length || FILTRES.some(f => g.includes(f)));
  for (const g of groupes) for (const [nom, fn] of T[g]) {
    const t0 = Date.now();
    try { await fn(); resultats.push([g, nom, null]); process.stdout.write(`  ✓ [${g}] ${nom} (${Date.now() - t0} ms)\n`); }
    catch (e) { resultats.push([g, nom, e.message]); process.stdout.write(`  ✗ [${g}] ${nom}\n      → ${e.message.split("\n")[0]}\n`); }
  }
  await navigateur.close();
  // comparaison visuelle avec les références (seulement quand toute la batterie a tourné : les captures en dépendent)
  let visuel = 0;
  if (FILTRES.length) { const e = resultats.filter(r => r[2]).length; console.log(`\n${resultats.length - e}/${resultats.length} tests réussis (comparaison visuelle : lancer sans filtre).`); process.exit(e ? 1 : 0); }
  try { execFileSync("python3", ["-I", path.join(__dirname, "comparer.py"), ...(MAJ_REF ? ["--maj"] : [])], { stdio: "inherit" }); }
  catch (e) { visuel = 1; }
  const echecs = resultats.filter(r => r[2]);
  console.log(`\n${resultats.length - echecs.length}/${resultats.length} tests réussis${visuel ? " · différences visuelles à examiner (tests/sortie/diff)" : ""}.`);
  process.exit(echecs.length || visuel ? 1 : 0);
})();
