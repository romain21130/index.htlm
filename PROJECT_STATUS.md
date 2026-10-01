# PROJECT_STATUS — RM Home V2.1
Dernière mise à jour : 2026-10-01 (Claude). Source de l'app = copie exacte de l'Artifact « RM Home — App (ambiant, accueil, maison, clim) » (sha256 96256dac80035c3c…).

## État actuel
Prototype complet en démo locale. Rien n'est encore branché à Home Assistant depuis l'interface (une page publiée ne peut pas joindre le réseau local).

## Fonctionnalités terminées
- Mode ambiant : heure, date, météo (démo), état portail ; liseré bleu + halo qui part des 4 coins vers le centre, vitesse constante ~18 s, nouvelle vague toutes les 10–15 s.
- Accueil : tuile visiophone réservée, portail (dessin + animation 20,5 s + boutons), météo Saint-Seine-en-Bâche (démo).
- Maison : plan RDC complet et interactif (24 lumières en démo, easter egg baskets de la véranda, dalle béton avec escalier et rambarde, TOUT ÉTEINDRE) ; sous-onglet ÉTAGE vide.
- Climatisation : 4 cartes en 2 groupes liés (Ellie+Evan ; Mezzanine+Salon), mode FROID/CHAUD/AUTO commun, températures indépendantes (pas 1 °C, 16–30).

## Tâche en cours
Migration du projet vers ce dépôt GitHub (source de vérité Claude + ChatGPT).
- Fait : dossier préparé avec les vrais fichiers de l'Artifact, README, CLAUDE.md, AGENTS.md, ce fichier.
- Reste : envoi sur GitHub par l'utilisateur, vérification, premier commit. Aucune évolution tant que ce n'est pas validé.

## Prochaines étapes (non commencées)
1. Brancher les vraies entités (avec l'accord de l'utilisateur) : light.a1, light.a2, portail, clim salon, Daikin Ellie/Evan (entités à inventorier via Outils de développement > Modèle).
2. Connecter la clim Mezzanine (Thermor) ; une clé wifi bugge, donc 3 clims connectables au total.
3. Étage : dessiner (photos à fournir) et brancher light.a3 à light.a7.
4. Visiophone (câblage prévu) ; météo réelle ; test sur l'iPad Air 2 ; autres équipements (TV, VEVOR, caméras).

## Fichiers concernés
app/RM-Home-App-v1.html (maître) · plan/RM-Home-RDC-vue-dessus-v1.html (le SVG du RDC est dupliqué dans l'app : resynchroniser après toute modif du plan) · portail/ · pieces/ · reference/.

## Bugs / points à vérifier
- Clim salon : la mesure remonte doublée dans Home Assistant (46 pour ~23 °C) ; l'app affiche déjà 23 (à confirmer).
- Positions estimées à valider : meuble TV du salon, canapé/buffet/table/bureau, porte cellier (absente du v16, ajoutée sur confirmation), porte extérieure de la véranda, A0/A1/A2 et spot du couloir, rideau du dressing, spots chambre/SDB/salle de jeu, lumières du cellier, longueur réelle de la cuisine (5,53 m v16 ou 4,72 m).
- Performance iPad Air 2 non testée.

## Décisions importantes
Voir AGENTS.md. Notamment : géométrie v16 verrouillée, design validé intact, aucune entité inventée, aucune modification de Home Assistant sans accord.

## Réel dans Home Assistant (http://192.168.1.117)
- cover.10028e9559_motor_control (portail) ; light.a1 (plus basse), light.a2 (plus haute) = appliques du couloir ; light.a3 à light.a7 = étage.
- climate.clim_salon (Thermor via Smart Life + intégration Tuya) : modes off/heat_cool/cool/dry/heat/fan_only, consigne 16–30 pas 1, ventil high/low/auto/strong.
- Clim chambre Evan et chambre Ellie (Daikin) : intégrées via l'intégration locale Daikin AC (entités climate à relever).
- media_player.tv (indisponible), media_player.salon (inconnu), switch.tapo_h100_led.

## Encore en démo
Toutes les lumières hors A1/A2 (placeholders PLACEHOLDER_light_*), météo, visiophone, cartes clim Mezzanine/Ellie/Evan, portail (animation locale), commandes de l'interface en général.
