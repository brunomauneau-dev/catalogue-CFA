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

## Référentiel des intitulés

`referentiel/intitules.json` : référentiel **provisoire**, construit à partir des libellés du catalogue 2026,
en attendant la référence officielle du SAIO.

## Données

Aucune donnée réelle (nom, adresse, téléphone, mail) dans ce dépôt public : elles restent dans Grist.
