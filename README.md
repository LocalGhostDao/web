# > LOCALGHOST: THE TERMINAL

[![LocalGhost on Anchor Terminal](https://www.anchorterminal.com/badges/localghost.svg)](https://www.anchorterminal.com/tools/localghost)

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ HTML/CSS/JS     │ │ DEPENDENCIES: 0 │ │ TRACKING: OFF   │ │ LICENSE: MIT    │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

> **"The Only Cloud Is You."**

This is the public-facing terminal for [LocalGhost](https://github.com/LocalGhostDao/localghost), a private AI server that runs on your own hardware, with no cloud, no subscription and no surveillance.

**[LIVE TERMINAL](https://www.localghost.ai)** · **[MANIFESTO](https://www.localghost.ai/manifesto)** · **[BRAND GUIDELINES](https://www.localghost.ai/brand-guidelines)**

---

## 🔐 VERIFY THE DEPLOYMENT

To deploy, just run ./deploy/deploy.sh assuming you have the same setup of folders as this this repo.

Trust no one. Verify everything. Every deployment is cryptographically signed.

```bash
TMPKEY=$(mktemp) && \
curl -s https://www.localghost.ai/.well-known/pgp-key.asc | gpg --dearmor > "$TMPKEY" && \
gpgv --keyring "$TMPKEY" \
  <(curl -s https://www.localghost.ai/ghost/deploy-manifest.txt.asc) \
  <(curl -s https://www.localghost.ai/ghost/deploy-manifest.txt) && \
rm "$TMPKEY"
```

---

## 🪞 SETUP MIRROR

`https://www.localghost.ai/mirror` carries every file a LocalGhost box downloads once at setup (GeoNames, Natural Earth, OpenStreetMap's land polygons and Geofabrik's road extracts, the Go toolchain, pinned releases of llama.cpp and whisper.cpp, Gemma 4 12B as every box runs it, Gemma 4 E2B for the phone, EmbeddingGemma, Whisper large-v3-turbo for voice notes, the world's time zones, the Copernicus DEM for elevation, English Wikipedia, and LocalGhost's own releases, starting with wisp 0.0.1), each with the terms it's published under. It's signed the same way as the site: a sha256sum `MANIFEST.txt`, detach-signed with `gpg --local-user info@localghost.ai`.

The scripts, conf and terms live in [`deploy/mirror/`](deploy/mirror/README.md), never served. The data lives on the big pool, `/bulk/localghost/mirror`, and the web root's `/mirror` is a symlink to it, so nothing sits on the root SSD. [`public/mirror/index.html`](https://www.localghost.ai/mirror) explains what the mirror carries, why, and how a box verifies it. On every deploy `deploy.sh` runs the publish, but it asks upstream for changes at most once a month (the first deploy on or after the 1st); the other deploys publish only what `mirror.conf` or the terms added or changed. A new build goes live the moment its signed manifest is written.

```bash
./deploy/deploy.sh                                # site + mirror (upstream at most monthly)
MIRROR=refresh ./deploy/deploy.sh                 # site + mirror, ask upstream now
MIRROR_SETS="geo landpolygons" ./deploy/deploy.sh # site + only those mirror sets, upstream now
MIRROR=off ./deploy/deploy.sh                     # site only
```

Verify the mirror by hand:

```bash
TMPKEY=$(mktemp) && \
curl -s https://www.localghost.ai/.well-known/pgp-key.asc | gpg --dearmor > "$TMPKEY" && \
gpgv --keyring "$TMPKEY" \
  <(curl -s https://www.localghost.ai/mirror/MANIFEST.txt.asc) \
  <(curl -s https://www.localghost.ai/mirror/MANIFEST.txt) && \
rm "$TMPKEY"
```

The mirror is signed with the same key as the site deploys (`/.well-known/pgp-key.asc`, fingerprint `DCE9 A3D1 4EB4 6197 1DD5 F393 706E 4194 F08A 09A0`), and `publish.sh` refuses to sign with any other. Boxes check it with `tools/mirror_fetch.sh` in the server repo, against a pinned copy of that key committed there as `tools/mirror-key.asc`.

---

## ⚡ THE STACK

We don't use React. We don't use Tailwind. We don't use npm.

| Principle | Implementation |
|-----------|----------------|
| **Zero Build** | Raw HTML/CSS/JS. No transpilation. No bundling. |
| **Zero Dependencies** | No `node_modules`. No CDN imports. Everything vendored. |
| **Zero Tracking** | No analytics. No cookies. No fonts from Google. |

**Why?** A manifesto about sovereignty should not depend on 200MB of strangers' code.

---

## 🤖 FOR AGENTS AND CRAWLERS

`deploy.sh` generates `sitemap.xml`, `robots.txt` (every crawler welcome, AI ones named), `feed.xml`, `llms.txt`, `llms-full.txt`, and a markdown twin of every indexable page at the page's own address plus `.md` (`/about.md`, `/index.md` for the home page, `/mirror.md`), each named in its page's head with `<link rel="alternate" type="text/markdown">`. nginx also answers a page URL with its twin when the request's `Accept` header asks for `text/markdown`, and every twin carries a `Link: rel="canonical"` header back to its page.

## 📄 SITE MAP

| Page | Path | Description |
|------|------|-------------|
| **Terminal** | `/` | Main interface. Interactive CLI with hidden commands. |
| **Set Up a Box** | `/setup` | How to set up LocalGhost on your own Debian machine and install the signed app, in the order the server repo's scripts expect. |
| **Setup Mirror** | `/mirror` | What the signed setup mirror carries, why, and how boxes verify it. |
| **Changelog** | `/changelog` | Dated releases of the box and the app, and the mirror's sets. |
| **Status** | `/status` | The website and the mirror, updated by hand, with an incident history. |
| **Privacy** | `/privacy` | What the site, the mirror and the software do with information about you. |
| **Terms** | `/terms` | The licences for the software, the mirror and the site. |
| **About** | `/about` | Who builds LocalGhost, what exists today, key facts and FAQ. |
| **Manifesto** | `/manifesto` | "Why We Build", the argument the rest of the site stands on. |
| **Cypherpunk** | `/cypherpunk` | The 1993 Cypherpunk's Manifesto (source material). |
| **Directory** | `/directory` | Index of freehold-compliant projects. |
| **Brand Guidelines** | `/brand-guidelines` | Logo, colors, typography for contributors. |
| **Writing Guidelines** | `/writing-guidelines` | How every page is written, with the banned list and the checklist. [`vlad-voice.md`](vlad-voice.md) sits on top of it for posts in Vlad's own voice. |
| **404** | `/error/404.html` | Even our errors stay on brand. |

### Hidden Games

The terminal hides three playable games, easter eggs for anyone who explores.

| Game | Trigger | Description |
|------|---------|-------------|
| **THE_SHADOW.EXE** | `shadow` | Snake variant. Feed the AI your data. |
| **RECLAIM.EXE** | `reclaim` | Territory capture. Take back what's yours. |
| **ESCAPE.EXE** | `escape` | Endless runner. Flee the machine. |

The terminal also answers `status`, `setup`, `agent` (a note for the models reading the page) and `ghost`.

---

## 🎨 DESIGN SYSTEM

**The shelter terminal.** A green phosphor CRT out of a 1950s idea of the future, running a cypherpunk OS. Plain prose, loud furniture, and the effects stay out of the way of reading. The full rules are on the [brand guidelines](https://www.localghost.ai/brand-guidelines) page.

| Token | Value | Usage |
|-------|-------|-------|
| `--void` | `#111111` | Background |
| `--text` | `#E0E0E0` | Primary text |
| `--text-dim` | `#a0a0a0` | Secondary text |
| `--terminal` | `#33FF00` | What runs, links, success |
| `--amber` | `#FFB000` | What's planned and not built, notice placards |
| `--warning` | `#FF8A8A` | What we reject, errors |
| `--border` | `#444444` | Dividers, containers |

**Typography.** JetBrains Mono, self-hosted, all weights included.

**Phosphor layer.** `css/base.css` adds the phosphor wash, the vignette, the glow on green text, the amber `.notice` placard and the footer sign-off. `js/phosphor.js` makes the tube misbehave now and then (an interference band, a flash, the vertical hold slipping, a line burning in), never for anyone who asks for reduced motion, and typing `ghost` puts up PLEASE STAND BY. Decoration lives in CSS, so the markdown twins and screen readers get only the content.

---

## 🖥️ LOCAL DEVELOPMENT

No build step. No dev server required. It's just files.

### Option A: Direct

```bash
open public/index.html
```

### Option B: Python

```bash
cd public && python3 -m http.server 8080
# → localhost:8080
```

### Option C: Nginx (production-like)

```bash
# Use the included config
nginx -c $(pwd)/deploy/nginx.conf
```

---

## 📡 THE FREEHOLD PROTOCOL

Open-source, local-first projects don't have marketing departments. They build and vanish into the noise. The Freehold Protocol is a discoverability layer, a machine-readable way to say *"I built the exit"*.

### How It Works

Host this file at `/.well-known/freehold.json`:

```json
{
  "$schema": "https://localghost.ai/schemas/freehold-v1.json",
  "version": "1.0",
  "updated": "2025-01-15T00:00:00Z",
  "project": {
    "name": "Your Project Name",
    "description": "A short description of what it does.",
    "url": "https://your-project.com",
    "logo": "https://your-project.com/logo.svg",
    "repository": "https://github.com/your-username/your-project",
    "license": "MIT",
    "created": "2025-01-01"
  },
  "maintainer": {
    "name": "Your Name or Org",
    "contact": "hello@your-project.com",
    "pgp": "https://your-project.com/.well-known/pgp-key.asc"
  },
  "freehold": {
    "local_first": true,
    "offline_capable": true,
    "no_remote_kill_switch": true,
    "no_mandatory_auth_server": true,
    "data_export": {
      "format": "json",
      "complete": true,
      "documented": "https://your-project.com/docs/export"
    }
  }
}
```

### The Pledge

By hosting this file, your project commits to:

| Claim | Meaning |
|-------|---------|
| `local_first` | Core functionality runs without network access |
| `offline_capable` | Works fully offline after initial setup |
| `no_remote_kill_switch` | No server can disable the software remotely |
| `no_mandatory_auth_server` | Users aren't locked out if your servers die |
| `data_export.complete` | All user data exportable in documented format |

The plan is to crawl for these files and list what passes in the [directory](https://www.localghost.ai/directory). The crawler is still being written.

**Verification.** The crawler isn't built yet, so for now every listing is checked by hand, reading the source, trying it offline and running the export.

**Schema:** [`/schemas/freehold-v1.json`](https://www.localghost.ai/schemas/freehold-v1.json)

---

## ⚔️ CONTRIBUTING

We accept PRs that make the message clearer or the code cleaner.

**THE RULES:**

| ✓ Do | ✗ Don't |
|------|---------|
| Fix typos, improve clarity | Add Google Analytics |
| Optimize performance | Import scripts from CDNs |
| Add accessibility features | Introduce build steps |
| Improve mobile experience | Add tracking pixels |

**Before submitting:** Test on mobile. Test with JS disabled. Test in Firefox.

---

## 🔗 RELATED REPOSITORIES

| Repo | Status |
|------|--------|
| [`localghost`](https://github.com/LocalGhostDao/localghost) | The server (`server/`) and the Android app (`app/android/`): daemons, setup scripts, `server/tools/mirror_fetch.sh` |
| `the-mist` | Planned for poltergeist, the P2P backup network protocol, no code yet |

---

## 📄 LICENSE

MIT. Copy it. Fork it. Host it yourself. We are blueprint makers, not gatekeepers.

---

<p align="center">
<em>"We cannot fix the internet. But we can build a room where it cannot see you."</em>
</p>