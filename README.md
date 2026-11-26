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

`suivi.html` (+ `suivi.js`, `suivi.css`) : une ligne par fiche de la campagne, regroupées par département,
avec les étapes (lien envoyé, ouverte, soumise, mise en forme, en discussion, finalisée), les changements
par rapport à la fiche de l'an dernier, les correspondances et la prochaine action.
« Envoyer » et « Relancer » préparent le mail dans la messagerie (rien n'est envoyé automatiquement).

Dans Grist : Widget personnalisé → URL `…/suivi.html`, données : table *Fiches*, accès complet.
Tables utilisées en plus : `Campagnes` (Annee, Date_limite, Active, URL_formulaire), `Correspondances`
(Fiche, Date, Type, Objet, Resume) ; colonnes de suivi dans `Fiches` (Campagne, Fiche_precedente,
Lien_envoye_le, Ouverte_le, Soumise_le, Finalisee_le, Etape_SAIO, Prochaine_action, Code_actif).

« Préparer une nouvelle campagne » recopie les fiches (dernière version finalisée par défaut) dans une campagne
inactive, avec de nouveaux codes et un lien vers la fiche d'origine ; les formations fermées ne sont pas reprises.
« Activer cette campagne » la rend active : les liens des autres campagnes cessent alors de fonctionner.

## Référentiel des intitulés

`referentiel/intitules.json` : référentiel **provisoire**, construit à partir des libellés du catalogue 2026,
en attendant la référence officielle du SAIO.

## Données

Aucune donnée réelle (nom, adresse, téléphone, mail) dans ce dépôt public : elles restent dans Grist.
