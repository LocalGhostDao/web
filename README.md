# > LOCALGHOST: THE TERMINAL

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ HTML/CSS/JS     │ │ DEPENDENCIES: 0 │ │ TRACKING: OFF   │ │ LICENSE: MIT    │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

> **"The Only Cloud Is You."**

This is the public-facing terminal for [LocalGhost](https://github.com/LocalGhostDao/localghost) — a private AI server that runs locally on your hardware. No cloud. No subscriptions. No surveillance.

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

`https://www.localghost.ai/mirror` carries every file a LocalGhost box downloads once at setup (GeoNames, Natural Earth, OpenStreetMap's land polygons, the Go toolchain, and later a pinned llama.cpp and the model weights), each with the terms it's published under. It's signed the same way as the site: a sha256sum `MANIFEST.txt`, detach-signed with `gpg --local-user info@localghost.ai`.

The scripts, conf and terms live in [`deploy/mirror/`](deploy/mirror/README.md), never served. The mirror is built into `public/mirror/`, where the builds and signed manifest are gitignored and [`index.html`](https://www.localghost.ai/mirror) explains what it carries, why, and how a box verifies it. On every deploy `deploy.sh` runs the publish (downloading only what changed upstream), then puts new builds live under `/mirror/`: build directories first, the signed manifest after.

```bash
./deploy/deploy.sh                                # site + mirror
MIRROR_SETS="geo landpolygons" ./deploy/deploy.sh # site + only those mirror sets
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

Boxes do this themselves with `tools/mirror_fetch.sh` in the server repo, against the key committed there as `tools/mirror-key.asc`.

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

## 📄 SITE MAP

| Page | Path | Description |
|------|------|-------------|
| **Terminal** | `/` | Main interface. Interactive CLI with hidden commands. |
| **Setup Mirror** | `/mirror` | What the signed setup mirror carries, why, and how boxes verify it. |
| **About** | `/about` | Who builds LocalGhost, what exists today, key facts and FAQ. |
| **Manifesto** | `/manifesto` | "Why We Build" — the philosophical foundation. |
| **Cypherpunk** | `/cypherpunk` | The 1993 Cypherpunk's Manifesto (source material). |
| **Directory** | `/directory` | Index of freehold-compliant projects. |
| **Brand Guidelines** | `/brand-guidelines` | Logo, colors, typography for contributors. |
| **404** | `/error/404.html` | Even our errors stay on brand. |

### Hidden Games

The terminal hides three playable games — easter eggs for those who explore:

| Game | Trigger | Description |
|------|---------|-------------|
| **THE_SHADOW.EXE** | `shadow` | Snake variant. Feed the AI your data. |
| **RECLAIM.EXE** | `reclaim` | Territory capture. Take back what's yours. |
| **ESCAPE.EXE** | `escape` | Endless runner. Flee the machine. |

---

## 🎨 DESIGN SYSTEM

**Philosophy:** Terminal Brutalism. Hostile to surveillance. Functional for humans.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#111111` | Void background |
| `--text` | `#E0E0E0` | Primary text |
| `--text-dim` | `#888888` | Secondary text |
| `--terminal` | `#33FF00` | Accent, links, success |
| `--warning` | `#FF3333` | Errors, alerts |
| `--border` | `#333333` | Dividers, containers |

**Typography:** JetBrains Mono — self-hosted, all weights included.

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

Open-source, local-first projects don't have marketing departments. They build and vanish into the noise. The Freehold Protocol is a discoverability layer — a machine-readable way to declare: *"I built the exit."*

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

We crawl for these files. You get indexed in the [directory](https://www.localghost.ai/directory). Users find you.

**Verification:** We don't take your word for it. Before listing, we audit the claims — checking source code, testing offline capability, and confirming export functionality. The badge means something.

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
| [`localghost`](https://github.com/LocalGhostDao/localghost) | The server: daemons, setup scripts, `tools/mirror_fetch.sh` |
| `the-mist` | Coming soon — P2P backup network protocol |

---

## 📄 LICENSE

MIT. Copy it. Fork it. Host it yourself. We are blueprint makers, not gatekeepers.

---

<p align="center">
<em>"We cannot fix the internet. But we can build a room where it cannot see you."</em>
</p>