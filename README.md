# Catalogue CFA — fiches de renseignement

Outil du SAIO pour la mise à jour annuelle des fiches de renseignement des CFA
qui composent le catalogue « Accompagnement apprentissage ».

## Formulaire de l'établissement (widget Grist)

`index.html` (+ `formulaire.js`, `formulaire.css`) : formulaire prérempli que l'établissement ouvre
avec son lien personnel `…?Code_=<code>`. Il modifie ses coordonnées, ses contacts, ses formations
(choisies dans le référentiel) et ses modalités d'accompagnement, puis envoie sa fiche : tout est
enregistré directement dans le document Grist.

Dans Grist : Ajouter une page → Widget personnalisé → URL personnalisée → adresse GitHub Pages de ce dépôt,
données : table *Fiches*, accès : **accès complet au document**.

Tables attendues : `Fiches` (dont `Code`, `Soumise_le`), `Formations`, `Contacts`, `Accompagnement`
(colonne `Fiche` = référence vers Fiches, colonne `CodeFiche` = `$Fiche.Code`), `Referentiel`.
Les règles d'accès du document limitent chaque lien à sa propre fiche (`user.LinkKey.Code`).

Hors de Grist, la page s'affiche avec des données fictives (démonstration).

## Tableau de suivi du SAIO (widget Grist)

`suivi.html` (+ `suivi.js`, `suivi.css`) : deux onglets.
- *Campagne en cours* : une ligne par fiche, regroupées par département, avec les étapes (lien envoyé, ouverte,
  soumise, en discussion, finalisée), les changements par rapport à la fiche de l'an dernier, les correspondances
  et la prochaine action. « En discussion » est déduite des mails et appels enregistrés après la soumission.
  « Envoyer » et « Relancer » préparent le mail dans la messagerie (rien n'est envoyé automatiquement).
- *Campagnes closes* : consultation seule ; pour chaque fiche, comparaison avec sa fiche de la campagne en cours.

Les deux onglets ont la même présentation : sous-onglets par département (« Toutes les fiches » par défaut), filtre d'étape, recherche, « avec changements », « sans réponse ».
Chaque ligne a un bouton « PDF » qui télécharge la fiche avec la mise en page du catalogue (moteur commun `pdf-fiches.js`).

Un clic sur un établissement ouvre sa fiche dans un panneau latéral (formulaire intégré, `window.FORMULAIRE_INTEGRE`) :
le SAIO peut la corriger (modification notée dans les correspondances) ; une fiche close est en lecture seule.
« ✕ Fermer » ou Échap referme le panneau (alerte si des modifications ne sont pas enregistrées).

Troisième onglet « Catalogue » : génération du PDF (catalogue intégré, `window.CATALOGUE_INTEGRE`).

Dans Grist : Widget personnalisé → URL `…/suivi.html`, données : table *Fiches*, accès complet.
Tables utilisées en plus : `Campagnes` (Annee, Date_limite, Active, URL_formulaire), `Correspondances`
(Fiche, Date, Type, Objet, Resume) ; colonnes de suivi dans `Fiches` (Campagne, Fiche_precedente,
Lien_envoye_le, Ouverte_le, Soumise_le, Finalisee_le, Prochaine_action, Code_actif).

« Préparer une nouvelle campagne » recopie les fiches (dernière version finalisée) dans une nouvelle campagne,
avec de nouveaux codes et un lien vers la fiche d'origine (formations fermées non reprises), et la lance :
la campagne précédente est close et ses liens cessent de fonctionner.

## Génération du catalogue (widget Grist)

`catalogue.html` (+ `catalogue.js`, bibliothèque `lib/jspdf.umd.min.js`, licence MIT) : produit le PDF du catalogue
à partir des fiches de la campagne choisie (fiches finalisées, ou leur dernière version finalisée) :
couverture, pages d'information, sommaire cliquable par département, page de séparation par département,
une fiche par établissement (coordonnées et contacts en colonne de côté ; formations par filière et
modalités d'accompagnement). Les formations fermées n'apparaissent pas.

Pages d'information : table `Pages_catalogue` (Ordre, Titre, Texte, Afficher), modifiables dans le widget ;
mise en forme : `**gras**`, `- ` liste, `## ` intertitre, `[texte](adresse)`.
Colonne facultative `Presentation_accompagnement` dans `Fiches` (texte d'introduction de l'accompagnement).

## Référentiel des intitulés

`referentiel/intitules.json` : référentiel **provisoire**, construit à partir des libellés du catalogue 2026,
en attendant la référence officielle du SAIO.

## Import du catalogue 2026 (outils/)

Scripts Python (pdfplumber) qui lisent le catalogue PDF et créent le document Grist de production,
sans jamais afficher de valeur (seulement des comptes) :
`lecture.py` (PDF → fiches), `preparer.py` (noms provisoires, filières, alertes « A_verifier »),
`pages_info.py` (pages d'information), `creer_document.py` (structure, règles d'accès, import).

## Données

Aucune donnée réelle (nom, adresse, téléphone, mail) dans ce dépôt public : elles restent dans Grist.
