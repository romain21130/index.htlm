# Règles communes (Claude, ChatGPT/Codex, tout autre assistant)
## Avant de commencer
- Lis `PROJECT_STATUS.md` en entier : il dit où le travail s'est arrêté. Vérifie les derniers commits. Ne suppose jamais que les fichiers n'ont pas changé.
## Home Assistant (http://192.168.1.117, sans port)
- Home Assistant reste le cerveau. Ne modifie JAMAIS Home Assistant sans l'accord explicite de l'utilisateur : réseau, Freebox/Tenda, DHCP, appareils, intégrations, entités, automatisations, YAML, dashboard actuel. HACS est installé : n'y touche pas.
- N'invente jamais un nom d'entité ni un flux : placeholder `PLACEHOLDER_...` tant que l'identifiant réel n'est pas fourni.
## Design et géométrie (validés, ne pas casser)
- Géométrie = `reference/RM-Home-RDC-base-propre-v16.html` (1 m = 100 unités SVG). Ne déplace aucun mur, aucune porte, aucune arche.
- Ne change pas le design validé, ne simplifie pas l'app, ne supprime aucune fonctionnalité. Corrections locales uniquement ; ce qui est validé est verrouillé.
- Style : « nickel, droit, carré ». Les objets posés, le chantier, les fenêtres et les objets muraux ne sont pas dessinés.
- Performance iPad Air 2 : CSS/SVG léger, animations en transform/opacity, pas de WebGL.
## Réel / démo
- Ne transforme pas les données de démonstration en données réelles sans demande. Une page publiée ou ouverte hors Home Assistant ne peut pas joindre le réseau local : le branchement réel se fait à l'intégration finale dans Home Assistant, avec accord de l'utilisateur.
## Fin de tâche
- Vérifie le rendu avant de le montrer. Commit clair. Mets à jour `PROJECT_STATUS.md`.
