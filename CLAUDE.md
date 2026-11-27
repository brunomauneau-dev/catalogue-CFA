# Consignes pour Claude — fiches de renseignement des CFA

Fiches remplies chaque année par les établissements (CFA) : formations, modalités d'accompagnement,
contacts et éléments administratifs (adresse, téléphone…).

- **Données des fiches : lecture autorisée** (décision de l'utilisateur, novembre 2026). Ce sont des coordonnées et des
  contacts administratifs d'établissements, publiés dans le catalogue en accès libre sur le site de l'académie :
  on peut les lire et les afficher dans les échanges pour les vérifier et les corriger.
- **Dépôt public : aucune donnée réelle.** Ni dans le code, ni dans les tests, ni dans les messages de commit, ni dans
  les fichiers versionnés : exemples et tests avec des données fictives uniquement.
- Les données réelles restent dans Grist ; les fichiers de travail (extractions, sauvegardes) restent dans l'espace
  temporaire de la session, jamais dans le dépôt.

## Tests

- Avant chaque push : `node tests/lancer.js` (comportements, erreurs JavaScript, débordements à 3 largeurs, comparaison
  visuelle avec `tests/references/`). Ne pousser que si tout passe.
- Chaque évolution poussée ajoute ou adapte au moins un test dans `tests/lancer.js` (données fictives uniquement).
- Changement d'affichage voulu : vérifier les images de `tests/sortie/diff/`, puis `node tests/lancer.js --maj-references`.

## Accords

- Ne rien écrire dans un document Grist, n'envoyer aucun mail et ne rien pousser sur GitHub sans l'accord explicite de l'utilisateur.
