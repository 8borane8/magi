# Magi

Logiciel auto-hébergé d'enregistrement et d'exploitation de cours magistraux par IA.

On lance un enregistrement au début du cours, on l'arrête à la fin : Magi transcrit, classe le cours dans la bonne matière, propose des étiquettes, rédige une fiche, et permet de poser des questions à un « prof » local.

Tout tourne sur **votre** machine. Aucun audio, aucune transcription et aucune donnée personnelle ne quitte votre réseau : ni cloud, ni API tierce, ni abonnement.

## Pourquoi Magi

Les outils de prise de notes par IA existants sont des SaaS : l'audio de vos cours part sur des serveurs distants, la facture tombe tous les mois, et la donnée ne vous appartient plus.

Magi part du principe inverse. Le traitement IA tourne en local sur une machine équipée d'un GPU. Le seul coût est celui de l'électricité, et la bibliothèque de cours reste un dossier de fichiers sur un disque que vous contrôlez.

## Fonctionnalités

- **Enregistrement** depuis le navigateur (pause, reprise, streaming par fragments). Pas d'application à installer.
- **Bibliothèque** : recherche, filtres, matières, étiquettes, lecteur audio.
- **Transcription** locale via [WhisperX](https://github.com/m-bain/whisperX) dès l'arrêt de l'enregistrement.
- **Classement** via [Ollama](https://ollama.com/) : titre, matière, étiquettes proposés automatiquement (modifiables).
- **Fiche de cours** structurée (définitions, théorèmes, propositions, démonstrations).
- **Chat prof** sur un cours, y compris avec des images.

Pas encore : quiz, diarisation, banque de théorèmes, carte mentale.

## Prérequis

- [Docker](https://docs.docker.com/get-docker/) avec Compose
- Un GPU **NVIDIA** et le [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) (sous Windows : Docker Desktop + WSL2)
- Environ 8 Go de VRAM minimum, 12 Go conseillés (`large-v2` + `llama3.2` + `llava`)

Sans GPU, mettez `WHISPERX_DEVICE=cpu` et `WHISPERX_COMPUTE_TYPE=int8` dans `.env`. C'est nettement plus lent, et il faudra retirer la réserve GPU dans `docker-compose.yml`.

## Installation

```bash
git clone https://github.com/8borane8/magi.git
cd magi
cp .env.example .env
docker compose --profile all up
```

Le premier lancement télécharge l'image PyTorch/CUDA, WhisperX, Ollama et les modèles (`llama3.2`, `llava`). Comptez plusieurs gigaoctets. Les rebuilds suivants ne rechargent que le code Magi.

Puis ouvrez [http://localhost:5000](http://localhost:5000), indiquez l'URL du nœud (`http://localhost:5050` en local), et enregistrez un cours.

## Modes

Ollama et WhisperX sont inclus dans le nœud. On ne les lance jamais à part.

| Commande | Ce qui tourne | set-node |
| --- | --- | --- |
| `docker compose --profile all up` | nœud + dashboard | `http://localhost:5050` |
| `docker compose --profile api up` | nœud seul (API, WhisperX, Ollama) | un dashboard ailleurs s'y connecte |
| `docker compose --profile dashboard up` | dashboard seul | **obligatoire** : URL du nœud distant |

## Configuration

Copiez `.env.example` vers `.env` à la racine, puis ajustez au besoin.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `DASHBOARD_PORT` | `5000` | Port du dashboard |
| `API_PORT` | `5050` | Port du nœud |
| `OLLAMA_CHAT_MODEL` | `llama3.2` | Classement, fiche, chat texte |
| `OLLAMA_VISION_MODEL` | `llava` | Chat avec images |
| `WHISPERX_MODEL` | `large-v2` | Modèle de transcription |
| `WHISPERX_LANGUAGE` | `fr` | Langue |
| `WHISPERX_DEVICE` | `cuda` | `cuda` ou `cpu` |
| `WHISPERX_COMPUTE_TYPE` | `float16` | `float16` (GPU) ou `int8` (CPU) |

Les cours, la base SQLite et l'audio sont dans le volume Docker `magi-data`. En développement Deno : `apps/api/data/` (non versionné).

## Architecture

| Rôle | Où | Rôle réel |
| --- | --- | --- |
| **Client** (`apps/dashboard`) | Navigateur (laptop, téléphone) | Capture le micro, affiche la bibliothèque |
| **Nœud** (`apps/api`) | Machine avec GPU | Stocke l'audio et la base, transcrit, lance l'IA |

Le client n'a besoin ni de GPU ni de rester allumé pendant le traitement. Un cours enregistré depuis un téléphone est transcrit par la machine restée à la maison.

Cycle de vie d'un cours : `recording` → `paused` → `processing` → `completed` ou `failed`. Après l'arrêt : WhisperX, puis classement Ollama, puis fiche.

## Développement sans Docker

Prérequis : [Deno](https://deno.com/) 2.x, [WhisperX](https://github.com/m-bain/whisperX) dans le `PATH`, [Ollama](https://ollama.com/) en local avec les modèles `llama3.2` et `llava`.

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

| Couche | Technologie |
| --- | --- |
| Runtime | Deno (monorepo en workspace) |
| API | `@webtools/expressapi`, SQLite (Sequelize) |
| Frontend | Slick + Preact |
| Transcription | WhisperX |
| LLM | Ollama |

## Contribuer

Le projet est en développement actif. `deno fmt` à la racine avant une PR. L'interface est en français.

## Licence

[MIT](LICENCE) Copyright (c) 2026–present, Borane
