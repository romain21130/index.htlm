# RM Home V2.1 — fiche de reprise (à coller au début d'une nouvelle conversation)

## 1. Le projet
Interface murale Home Assistant pour iPad Air 2 (9,7", paysage), avec un jumeau numérique fidèle de ma maison (vue du dessus 2D soignée, états HA en overlays). Ce n'est PAS une V3 : fusion de la fiabilité de la V1 et du design de la V2 (noir / bleu très sombre, cyan discret, sobre). Priorité : FIDÉLITÉ > FIABILITÉ > SIMPLICITÉ > ESTHÉTIQUE. Je réponds en français, je préfère avancer concrètement et visuellement.

## 2. Règles absolues
- Home Assistant (http://192.168.1.117) reste le cerveau. Ne rien modifier sans mon accord : réseau, Freebox/Tenda, DHCP, appareils, intégrations, entités, automatisations, YAML, dashboard actuel. Pas de HACS/extension sans demander.
- Ne jamais inventer un nom d'entité ni un flux : placeholder `PLACEHOLDER_...` tant que je n'ai pas donné le vrai `entity_id`.
- Géométrie = RM-Home-RDC-base-propre-v16.html (1 m = 100 unités SVG), verrouillée. Mobilier/apparence = mes photos. Fonctionnement = HA réel / V1. Je tolère un ajout au v16 seulement si je le confirme (ex. porte cellier, porte extérieure véranda).
- Travailler pièce par pièce, corrections locales uniquement, ce qui est validé est verrouillé.
- Vérifier le rendu AVANT de me le montrer (rendu Playwright/Chromium dans le conteneur), puis publier en MISE À JOUR du même lien.
- Style : « nickel, droit, carré » (alignements, centrages, symétries). Omettre les objets posés/chantier/linge/jouets, les objets muraux (cadres, miroirs, TV murales sauf si demandé) et les fenêtres (absentes du v16).

## 3. Fichiers à me redonner / à relire
- RM-Home-RDC-base-propre-v16.html, RM-Ultimate-V6_7.js, RM-Home-Ultimate-Twin-V1.html (V1 = logique HA, gestes du portail).
- Les pages ci-dessous sont publiées : relire leurs sources avec l'outil Artifact (action "read") puis republier avec `url`.

## 4. Pages publiées (liens)
- App (ambiant + accueil + maison RDC/étage + clim) : https://claude.ai/artifact/HrSmezPYoanLduGujAL5du
- RDC complet (référence) : https://claude.ai/artifact/3tYJXrai3KymYRsnMrNrEE
- Portail (verrouillé) : https://claude.ai/artifact/5PSz4SFkw4Bu1M7oGXkeQG
- Salon : https://claude.ai/artifact/Wa7ZKxjzaEDxrH7W6R4ztY · Cuisine : https://claude.ai/artifact/7AERWrH4cDHu6aM9kRMccb · Cellier : https://claude.ai/artifact/9bi4xyUWb8DFAVwpenhKyy · Véranda : https://claude.ai/artifact/E5pqXgxHTUNyKpKyQDqhh4
- Couloir : https://claude.ai/artifact/VWw5uYQpr9EibwyiqAvVJa · Chambre : https://claude.ai/artifact/EPhqdXGVCibsBdLmwJBUTw · WC : https://claude.ai/artifact/TAhoVF4gf5obCPCu4BEchQ · Salle de bain : https://claude.ai/artifact/Aodqt6ubZ6cGGe1PUVqrFv · Salle de jeu : https://claude.ai/artifact/P9GXLiB5wgv7wFAxWwNrxL
La page RDC fait foi ; l'App embarque une copie du SVG du RDC (à re-synchroniser après chaque modif du RDC).

## 5. Architecture du plan RDC (coordonnées « salon-local », origine = coin nord-ouest du salon)
Salon (0,0) 410×977 · Cuisine (410,424) · Cellier (410,0) · Véranda (333,977) · Couloir (-108,253) · Chambre (-451,501) · WC (-257,390) · Salle de bain (-211,0) · Salle de jeu (-451,0) · Dalle béton x -451..333, y 977..1123 (escalier en béton de 6 marches côté ouest, rambarde au sud).
Lumières : groupes `<g class="lamp" data-ha="live|planned" data-entity="PLACEHOLDER_...">` avec `.halo` (overlay), `.spot`/`.bulb`, zone tactile invisible ; script commun `RM.setLight(id,on,luminosité,[r,g,b])`. 24 lumières, démo locale ; seules A1 et A2 (couloir) sont réellement connectées (`data-ha="live"`).

## 6. Home Assistant réel
- Portail : `cover.10028e9559_motor_control`, course ≈ 20,5 s, animation linéaire sans saut (logique V1 : open/closed/opening/closing + cover.open_cover/close_cover/stop_cover).
- Couloir : `light.a1` (plus basse) et `light.a2` (plus haute) = appliques Tapo RÉELLES, déjà reportées dans le plan/app (data-entity, data-ha="live"). A0 : à venir, même hauteur que A1 (pas encore dans HA).
- Climatisations (4, Thermor, unité IM35-NS) : Clim salon CONNECTÉE via Smart Life + intégration officielle Tuya de HA (clé wifi Tuya, code 292X) → `climate.clim_salon` : modes off/heat_cool/cool/dry/heat/fan_only, consigne 16–30 pas 1, ventil high/low/auto/strong. ATTENTION : la mesure remonte DOUBLÉE (46 pour ~23 °C) → afficher mesure/2 (à confirmer). Les 3 autres clims : à connecter (une clé wifi bugge → 3 connectables au total). Entité déjà reportée dans l'app (data-entity, data-ha="live"). Chambre Ellie + Chambre Evan = groupe lié ; Mezzanine + Salon = groupe lié. Passage FROID/CHAUD obligatoirement simultané dans un groupe ; températures indépendantes. Marque/modèle et mode de contrôle actuel à préciser avant de choisir l'intégration.
- Visiophone reçu, câblé « demain » : tuile réservée à l'accueil, entités/flux à fournir.
- Inventaire lecture seule fait (Outils de développement > Modèle). Entités trouvées : `cover.10028e9559_motor_control` (portail), `light.a1`…`light.a7` (A3 à A7 = ÉTAGE, positions à préciser), `media_player.tv` (TV, indisponible), `media_player.salon` (inconnu), `switch.tapo_h100_led`, interrupteurs « mise à jour automatique » (inutiles). Aucune caméra, aucune clim, aucune autre lumière RDC. HACS est installé : ne pas y toucher.
- Modèle Jinja d'inventaire (lecture seule) : `{% for s in states | selectattr('domain','in',['light','switch','climate','cover','camera','media_player']) | sort(attribute='entity_id') %}{{ s.entity_id }} | {{ s.name }} | {{ s.state }}
{% endfor %}` (à l'adresse http://192.168.1.117/config/tools/template).
- Prochain inventaire utile : entité météo (apparaît indisponible), capteurs, caméra/sonnette du visiophone une fois câblé.

## 7. App (iPad Air 2, 1024×768 paysage)
Mode ambiant : heure/date/météo (démo)/état portail ; liseré bleu fixe + halo bleu qui part des 4 coins vers le centre, vitesse CONSTANTE, ~18 s, nouvelle vague toutes les 10–15 s (ambiance zen). Toucher = accueil ; retour ambiant après 30 s (démo).
Accueil : tuile visiophone (réservée), tuile portail (dessin + animation + gros boutons), météo Saint-Seine-en-Bâche (démo). Barre d'onglets : ACCUEIL / MAISON (RDC, ÉTAGE à venir, bouton TOUT ÉTEINDRE) / CLIMATISATION.
Contraintes : fluidité iPad Air 2 (transform/opacity seulement, pas de WebGL, ombres statiques).

## 8. Points à revoir (mon passage de correctifs)
Salon : longueur du meuble TV, canapé/buffet/table/bureau à valider · Cuisine : porte du cellier (absente du v16), longueur réelle 5,53 m ou 4,72 m · Cellier : les 2 lumières · Véranda : porte extérieure, applique double spot (1 entité ?) · Couloir : A0/A1/A2, spot, porte de la salle de bain centrée · Dalle : longueur de l'escalier, raccord véranda · Chambre/SDB/salle de jeu : positions de quelques spots.

## 9. Idées en attente
Easter eggs (déjà : baskets d'Ellie dans la véranda) · intégrer l'aperçu du jumeau à l'accueil · fenêtres (symbole discret ?) · test sur l'iPad réel · étage · météo réelle (prévisions horaires 24 h glissantes) · TV, VEVOR, caméras.
