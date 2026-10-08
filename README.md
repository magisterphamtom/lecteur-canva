# Lecteur Canva

Module Foundry VTT (v13 / v14) qui affiche un ou plusieurs tableaux Canva — timeline, handouts, tableau d'enquête — dans une fenêtre Foundry.

- **Lecture** directement dans Foundry.
- **Modifier** : ouvre le tableau dans Canva, dans un nouvel onglet.
- **Rafraîchir** : recharge le tableau après une modification.
- **Montrer à tous** (MJ) : ouvre le tableau chez tous les joueurs connectés.

> Canva interdit l'affichage de son éditeur dans une autre page : la modification se fait donc toujours dans Canva, jamais dans la fenêtre Foundry.

## Préparer le Canva

1. **Lien de lecture** : dans Canva, *Partager → Intégrer*. Copie le lien ou tout le code d'intégration, le module accepte les deux.
2. **Lien d'édition** : *Partager*, puis accès « Toute personne disposant du lien » réglé sur *Peut modifier*, puis *Copier le lien*.

Chaque joueur doit être connecté à un compte Canva (gratuit) pour modifier.

## Configurer dans Foundry

*Paramètres → Configurer les modules → Lecteur Canva → Configurer les tableaux*, puis colle les deux liens. On peut déclarer plusieurs tableaux, par exemple « Timeline » et « Handouts ».

Le réglage **Les joueurs peuvent modifier** affiche ou masque le bouton « Modifier » pour les joueurs.

## Ouvrir le lecteur

- Bouton palette dans les outils de jetons (barre de gauche) ;
- Bouton « Tableau Canva » en haut de l'onglet Journal ;
- Raccourci clavier, à définir dans *Configurer les contrôles* ;
- Macro : `game.modules.get("lecteur-canva").api.open()`.

## Dépannage

- **Cadre blanc ou « refus de connexion »** : le lien de lecture n'est pas un lien d'intégration. Refais *Partager → Intégrer*.
- **Modification absente** : clique sur « Rafraîchir ». Canva peut mettre quelques secondes à publier.
