# Magi

Logiciel auto-hébergé d'enregistrement et d'exploitation de cours magistraux par IA.

On lance un enregistrement au début du cours, on l'arrête à la fin : Magi transcrit, classe le cours dans la bonne
matière, propose des étiquettes, rédige une fiche, et permet de poser des questions à un « prof » local.

Tout tourne sur **votre** machine. Aucun audio, aucune transcription et aucune donnée personnelle ne quitte votre réseau
: ni cloud, ni API tierce, ni abonnement.

L'API n'a **pas d'authentification**. Elle est prévue pour un usage local ou LAN de confiance. Ne l'exposez pas sur
Internet.

## Pourquoi Magi

Les outils de prise de notes par IA existants sont des SaaS : l'audio de vos cours part sur des serveurs distants, la
facture tombe tous les mois, et la donnée ne vous appartient plus.

Magi part du principe inverse. Le traitement IA tourne en local sur une machine équipée d'un GPU. Le seul coût est celui
de l'électricité, et la bibliothèque de cours reste un dossier de fichiers sur un disque que vous contrôlez.

## Fonctionnalités

- **Enregistrement** depuis le navigateur (pause, reprise, streaming par fragments). Pas d'application à installer.
- **Bibliothèque** : recherche, filtres, matières, étiquettes, lecteur audio.
- **Transcription** locale via [WhisperX](https://github.com/m-bain/whisperX) dès l'arrêt de l'enregistrement, avec
  diarisation (qui parle).
- **Classement** via [Ollama](https://ollama.com/) : titre, matière, étiquettes proposés automatiquement (modifiables).
- **Fiche de cours** structurée (définitions, théorèmes, propositions, démonstrations).
- **Chat prof** sur un cours, y compris avec des images.

Pas encore : quiz, banque de théorèmes, carte mentale.

## Prérequis

- [Docker](https://docs.docker.com/get-docker/) avec Compose
- Un GPU **NVIDIA** est recommandé (8 Go de VRAM mini, 12 Go conseillés)

## Installation

```bash
git clone https://github.com/8borane8/magi.git
cd magi
cp .env.example .env
docker compose --profile all up --build
```

Le premier lancement télécharge l'image PyTorch, WhisperX, Ollama et les modèles (`llama3.2`, `llava`). Comptez
plusieurs gigaoctets. Après une modification du code, reconstruisez les images (`--build`).

La diarisation WhisperX utilise le modèle
[pyannote speaker-diarization-community-1](https://huggingface.co/pyannote/speaker-diarization-community-1). Créez un
jeton Hugging Face en lecture, acceptez les conditions du modèle, puis renseignez `HF_TOKEN` dans `.env`. Le modèle est
téléchargé une fois ; l'audio reste local.

Puis ouvrez [http://localhost:5000](http://localhost:5000). Avec le profil `all`, le dashboard est déjà branché sur
`http://localhost:5050`. Enregistrez un cours.

Sans GPU, WhisperX tourne en CPU (`WHISPERX_DEVICE=cpu`). C'est nettement plus lent.

### GPU NVIDIA

Docker doit voir la carte. Sous Windows : driver NVIDIA à jour, Docker Desktop en WSL2, et `nvidia-smi` doit marcher
**dans WSL**. Ensuite :

```bash
# dans .env : WHISPERX_DEVICE=cuda et WHISPERX_COMPUTE_TYPE=float16
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile all up --build
```

## Modes

Ollama et WhisperX sont inclus dans le nœud. On ne les lance jamais à part.

| Commande                                | Ce qui tourne                     | Connexion                                                            |
| --------------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| `docker compose --profile all up`       | nœud + dashboard                  | déjà configurée (`http://localhost:5050`)                            |
| `docker compose --profile api up`       | nœud seul (API, WhisperX, Ollama) | un dashboard ailleurs s'y connecte                                   |
| `docker compose --profile dashboard up` | dashboard seul                    | `localhost:5050` par défaut, ou `MAGI_NODE_URL` pour un nœud distant |

## Configuration

Copiez `.env.example` vers `.env` à la racine, puis ajustez au besoin.

| Variable                | Défaut Docker | Rôle                                                      |
| ----------------------- | ------------- | --------------------------------------------------------- |
| `DASHBOARD_PORT`        | `5000`        | Port du dashboard                                         |
| `API_PORT`              | `5050`        | Port du nœud                                              |
| `OLLAMA_CHAT_MODEL`     | `llama3.2`    | Classement, fiche, chat texte                             |
| `OLLAMA_VISION_MODEL`   | `llava`       | Chat avec images                                          |
| `OLLAMA_NUM_CTX`        | `131072`      | Fenêtre de contexte Ollama (baisser si la VRAM manque)    |
| `WHISPERX_MODEL`        | `large-v2`    | Modèle de transcription                                   |
| `WHISPERX_LANGUAGE`     | `fr`          | Langue                                                    |
| `WHISPERX_DEVICE`       | `cpu`         | `cpu` par défaut, `cuda` avec l'overlay GPU               |
| `WHISPERX_COMPUTE_TYPE` | `int8`        | `int8` (CPU) ou `float16` (GPU)                           |
| `HF_TOKEN`              | (vide)        | Jeton Hugging Face (lecture) pour la diarisation pyannote |

Les cours, la base SQLite et l'audio sont dans le volume Docker `magi-data`. En développement Deno : `apps/api/data/`
(non versionné).

## Architecture

| Rôle                          | Où                             | Rôle réel                                        |
| ----------------------------- | ------------------------------ | ------------------------------------------------ |
| **Client** (`apps/dashboard`) | Navigateur (laptop, téléphone) | Capture le micro, affiche la bibliothèque        |
| **Nœud** (`apps/api`)         | Machine avec GPU               | Stocke l'audio et la base, transcrit, lance l'IA |

Le client n'a besoin ni de GPU ni de rester allumé pendant le traitement. Un cours enregistré depuis un téléphone est
transcrit par la machine restée à la maison.

Cycle de vie d'un cours : `recording` → `paused` → `processing` → `completed` ou `failed`. Après l'arrêt : WhisperX,
puis classement Ollama, puis fiche. Un cours en `failed` peut être relancé depuis l'accueil.

## Développement sans Docker

Prérequis : [Deno](https://deno.com/) 2.x, [WhisperX](https://github.com/m-bain/whisperX) dans le `PATH`,
[Ollama](https://ollama.com/) en local avec les modèles `llama3.2` et `llava`, et `HF_TOKEN` pour la diarisation.

```bash
cd apps/api
cp .env.example .env
deno task dev
```

```bash
cd apps/dashboard
cp .env.example .env
deno task dev
```

Ouvrir `http://localhost:5000` et indiquer `http://localhost:5050`.

```
magi/
├── apps/
│   ├── api/          # Nœud : HTTP, SQLite, WhisperX, Ollama
│   └── dashboard/    # Client web (Slick + Preact)
├── shared/           # Types partagés
├── docker/           # Images Compose
└── docker-compose.yml
```

| Couche        | Technologie                                |
| ------------- | ------------------------------------------ |
| Runtime       | Deno (monorepo en workspace)               |
| API           | `@webtools/expressapi`, SQLite (Sequelize) |
| Frontend      | Slick + Preact                             |
| Transcription | WhisperX                                   |
| LLM           | Ollama                                     |

## Contribuer

Le projet est en développement actif. `deno fmt` à la racine avant une PR. L'interface est en français.

## Licence

[MIT](LICENCE) Copyright (c) 2026-present, Borane
