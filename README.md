# Magi

**Magi** est un logiciel auto-hébergé d'enregistrement et d'exploitation de cours magistraux par IA.

On lance un enregistrement au début du cours, on l'arrête à la fin, et Magi s'occupe du reste : transcription complète,
classement automatique dans la bonne matière, labellisation par tags, et à terme résumé, chat de révision et génération
de quiz.

Tout tourne sur **votre** machine. Aucun audio de cours, aucune transcription et aucune donnée personnelle ne quitte
votre réseau : ni cloud, ni API tierce, ni abonnement.

---

## Pourquoi Magi

Les outils de prise de notes par IA existants sont des SaaS : l'audio de vos cours part sur des serveurs distants, la
facture tombe tous les mois, et la donnée ne vous appartient plus.

Magi part du principe inverse. Le traitement IA est aujourd'hui suffisamment mature pour tourner en local sur une
machine grand public équipée d'un GPU. Le seul coût est celui de l'électricité, et la bibliothèque de cours reste un
dossier de fichiers sur un disque que vous contrôlez.

---

## Principes d'architecture

### Self-hosté de bout en bout

Magi s'installe sur une machine que vous possédez : PC fixe, serveur maison, NAS avec GPU. Cette machine héberge la base
de données, les fichiers audio, les transcriptions et les modèles d'IA. Aucune dépendance à un service en ligne pour
fonctionner.

### Dissociation client / worker

L'architecture sépare deux rôles, ce qui permet d'enregistrer un cours depuis un appareil léger tout en faisant
travailler une machine puissante restée à la maison.

| Rôle                            | Où il tourne                                           | Ce qu'il fait                                                             |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Client** (`apps/dashboard`)   | Laptop, téléphone, tablette, n'importe quel navigateur | Capture le micro, streame l'audio, affiche la bibliothèque de cours       |
| **Worker / noeud** (`apps/api`) | Machine locale avec GPU, allumée à la maison           | Stocke l'audio et la base, exécute la transcription et les traitements IA |

Le client ne fait que capturer et afficher : il n'a besoin ni de GPU, ni d'espace disque, ni de rester allumé pendant le
traitement. Un cours enregistré depuis un téléphone en amphi est transcrit par la machine du domicile, et le résultat
est disponible sur tous les appareils connectés au noeud.

Le lien entre les deux se fait sur le réseau local, ou à distance via un VPN maillé type
[Tailscale](https://tailscale.com/), sans ouvrir de port sur Internet.

### Traitement IA 100 % local (prévu)

| Brique                                             | Rôle                                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **[WhisperX](https://github.com/m-bain/whisperX)** | Transcription de l'audio, alignement des mots sur la timeline, séparation des locuteurs (professeur, questions de la salle)              |
| **[Ollama](https://ollama.com/)**                  | Exécution des modèles de langage locaux pour le classement automatique, les tags, et les futures fonctionnalités de résumé, chat et quiz |

Les deux s'exécuteront comme des services locaux appelés par le noeud. Le choix des modèles sera libre et se réglera
selon le GPU disponible.

---

## Démarrage rapide

Prérequis : [Deno](https://deno.com/) 2.x installé.

### 1. Lancer le noeud

```bash
cd apps/api
cp .env.example .env   # API_PORT=5050, MAGI_DATA_DIR=./data
deno task dev
```

Le noeud écoute sur `http://localhost:5050`. Les cours et la base SQLite sont stockés dans `apps/api/data/`.

### 2. Lancer le dashboard

Dans un second terminal :

```bash
cd apps/dashboard
cp .env.example .env   # DASHBOARD_PORT=5000
deno task dev
```

Ouvrir `http://localhost:5000`, renseigner l'URL du noeud (`http://localhost:5050` en local), puis accéder à l'accueil.

### 3. Enregistrer un cours

Depuis l'accueil, cliquer sur **Nouveau cours** (ou le bouton micro en mobile). L'audio est capturé dans le navigateur
et envoyé au noeud par fragments toutes les 5 secondes. La barre d'enregistrement reste visible pendant la navigation
dans l'application. Pause, reprise et arrêt sont disponibles depuis cette barre ou en cliquant un cours en pause dans la
liste.

---

## Fonctionnalités

### Enregistrement des cours (disponible)

Enregistrement audio depuis le navigateur, sans application à installer. La session supporte la pause et la reprise ;
l'audio est streamé au noeud au fil de l'eau. Si le navigateur se ferme sans arrêt propre, le noeud met la session en
pause automatiquement après 15 secondes sans fragment reçu.

Cycle de vie côté noeud : `recording`, `paused`, `processing`, `completed`, `failed`.

Comportements notables côté client :

- barre d'enregistrement globale, persistante lors des navigations SPA ;
- reprise d'une session en pause (micro + barre) ;
- sauvegarde locale légère (`sessionStorage`) pour retrouver une session après rechargement de page.

### Bibliothèque (disponible)

Accueil avec liste des cours, recherche plein texte, filtres (statut, étiquette, dates), navigation par matière. Lecture
audio des segments enregistrés. Page cours pour les sessions terminées (métadonnées, notes, lecteur audio).

### Matières et étiquettes (disponible)

CRUD des matières et des étiquettes (nom, couleur, archivage pour les matières). Compteur de cours par matière.

### Transcription automatique (à venir)

Dès la fin de l'enregistrement, le cours partira en file de traitement. WhisperX produira une transcription horodatée
mot à mot, avec recherche plein texte et synchronisation audio/texte.

### Rangement et labellisation automatiques (à venir)

Un modèle local analysera la transcription pour proposer matière, titre, tags et description. Le classement restera
modifiable à la main.

---

## Fonctionnalités à venir

- **Pipeline WhisperX** : transcription et diarisation après l'arrêt d'un enregistrement.
- **Classement Ollama** : titre, matière, tags et description proposés automatiquement.
- **Résumé automatique** : synthèse structurée exportable en Markdown.
- **Chat IA sur les cours** : questions en langage naturel avec citations horodatées.
- **Génération de quiz et d'exercices** : révision active à partir du contenu du cours.
- **Fiches de révision** : agrégation de plusieurs cours d'une matière.
- **Export** : Markdown, PDF, intégration avec les outils de prise de notes existants.

---

## Stack technique

| Couche             | Technologie                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Runtime            | [Deno](https://deno.com/) (monorepo en workspace)                                                           |
| Langage            | TypeScript                                                                                                  |
| API                | `@webtools/expressapi`                                                                                      |
| Base de données    | SQLite via [Sequelize](https://sequelize.org/) v7                                                           |
| Frontend           | [Slick](https://jsr.io/@webtools/slick-server) et [Preact](https://preactjs.com/) (rendu serveur + islands) |
| Transcription      | WhisperX (prévu)                                                                                            |
| Modèles de langage | Ollama (prévu)                                                                                              |

### Organisation du dépôt

```
magi/
├── apps/
│   ├── api/              # Noeud : API HTTP, SQLite, stockage audio
│   │   └── src/
│   │       ├── models/       # Modèles Sequelize (cours, matières, tags)
│   │       ├── routes/       # Endpoints REST
│   │       └── services/     # Enregistrement, stockage disque
│   └── dashboard/        # Client web Slick + Preact
│       └── src/
│           ├── pages/        # Routes SSR
│           ├── templates/    # Layouts (app, auth)
│           ├── islands/      # UI interactive hydratée
│           ├── components/   # Markup réutilisable
│           ├── utils/        # Session d'enregistrement, client HTTP
│           └── static/       # CSS (tokens, ui, pages), scripts, assets
└── shared/               # Types partagés (`SessionStatus`, etc.)
```

---

## État du projet

Magi est en **développement actif**. Le socle d'enregistrement et de bibliothèque est utilisable en local ; le pipeline
IA n'est pas encore branché.

| Domaine                        | État                      |
| ------------------------------ | ------------------------- |
| Noeud HTTP + SQLite            | OK                        |
| Streaming audio par chunks     | OK                        |
| Pause / reprise / arrêt        | OK                        |
| Dashboard (accueil, catalogue) | OK                        |
| Matières et étiquettes         | OK                        |
| Page cours + lecteur audio     | OK (sessions `completed`) |
| Transcription WhisperX         | Non démarré               |
| Classement et tags via Ollama  | Non démarré               |
| Résumé, chat, quiz             | Maquettes / placeholders  |

Les données de développement (SQLite, fichiers `.webm`) vivent dans `apps/api/data/` et ne doivent pas être versionnées.

---

## Licence

[MIT](LICENCE) Copyright (c) 2026–present, Borane
