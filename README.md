# RM Home V2.1

Interface murale Home Assistant (iPad Air 2, paysage) avec jumeau numérique de la maison (vue du dessus).
Fusion de la fiabilité de la V1 et du design de la V2 (noir / bleu très sombre, cyan discret). Ce n'est pas une V3.

## Où est quoi
- `app/RM-Home-App-v1.html` : l'application complète (mode ambiant, accueil, maison RDC/étage, climatisation). **Fichier maître.**
- `plan/RM-Home-RDC-vue-dessus-v1.html` : le plan du RDC (référence du plan ; l'app en embarque une copie du SVG).
- `portail/RM-Home-Portail-v1.html` : le portail (dessin + animation 20,5 s), verrouillé.
- `pieces/` : une page par pièce (salon, cuisine, cellier, véranda, couloir, chambre, WC, salle de bain, salle de jeu).
- `reference/` : géométrie officielle (`RM-Home-RDC-base-propre-v16.html`), logique Home Assistant de la V1 (`RM-Ultimate-V6_7.js`, `RM-Home-Ultimate-Twin-V1.html`), rendu validé du salon.
- `docs/fiche-reprise.md` : fiche de reprise historique. `archive/` : anciennes versions remplacées.

## Utilisation
Chaque fichier est une page HTML autonome : l'ouvrir dans un navigateur. Aucune compilation.

## Règles
Lire `PROJECT_STATUS.md` avant toute tâche, puis `CLAUDE.md` / `AGENTS.md`.
