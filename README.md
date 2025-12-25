### **Web Repository README (`localghostdao/web`)**

# > LOCALGHOST: THE TERMINAL

![Language](https://img.shields.io/badge/language-HTML5-orange?style=flat-square) ![Dependencies](https://img.shields.io/badge/dependencies-NONE-brightgreen?style=flat-square) ![Tracking](https://img.shields.io/badge/tracking-BLOCKED-red?style=flat-square)

> **"1993 WAS A WARNING. THIS WEBSITE IS THE EXIT NODE."**

This is the public-facing terminal for [LocalGhost](https://github.com/LocalGhostDao/localghost).
It is a Brutalist, zero-dependency static site designed to recruit operators for the resistance.

**[LIVE TERMINAL](https://www.localghost.ai)**

---

## 🔐 VERIFY THE DEPLOYMENT

Trust no one. Verify everything. Every deployment is cryptographically signed.
```bash
TMPKEY=$(mktemp) && \
curl -s https://www.localghost.ai/.well-known/pgp-key.asc | gpg --dearmor > "$TMPKEY" && \
gpgv --keyring "$TMPKEY" \
  <(curl -s https://www.localghost.ai/.well-known/deploy-manifest.txt.asc) \
  <(curl -s https://www.localghost.ai/.well-known/deploy-manifest.txt) && \
rm "$TMPKEY"
```

If the signature is valid, you are seeing what we shipped. If not, someone is lying to you.

---

## ⚡ THE STACK (ZERO-BUILD)

We do not use React. We do not use Tailwind. We do not use npm.
We use **Raw HTML/CSS/JS**.

* **Why?** Because a manifesto about sovereignty should not rely on a 200MB `node_modules` folder owned by strangers.
* **Performance:** Instant load times. No hydration gaps.
* **Privacy:** No Google Fonts. No Analytics. No Cookies.

### FILE STRUCTURE
```
.
├── deploy/
│   ├── deploy.sh              # Deployment automation
│   └── nginx.conf             # Server configuration
├── public/
│   ├── index.html             # Main terminal interface
│   ├── manifesto.html         # The LocalGhost manifesto
│   ├── cypherpunk.html        # 1993 Cypherpunk source material
│   ├── directory.html         # Site navigation
│   ├── brand-guidelines.html  # Visual identity documentation
│   ├── css/                   # Stylesheets (no frameworks)
│   ├── js/                    # Scripts (no dependencies)
│   │   ├── terminal.js        # Terminal interface logic
│   │   ├── escape.js          # THE SHADOW game engine
│   │   ├── reclaim.js         # RECLAIM.EXE game engine
│   │   └── the_shadow.js      # Snake game variant
│   ├── fonts/                 # JetBrains Mono (self-hosted)
│   ├── images/                # Logos, favicons, OG images
│   ├── assets/                # Downloadable resources
│   │   └── localghost-logo-pack.zip
│   ├── schemas/
│   │   └── freehold-v1.json   # Freehold specification
│   ├── error/                 # Custom error pages
│   │   ├── 404.html
│   │   └── 50x.html
│   ├── robots.txt
│   └── site.webmanifest
├── LICENSE
└── README.md
```

---

## 🖥️ LOCAL DEPLOYMENT

You do not need a complex build pipeline to run this. It is just files.

### OPTION A: THE RAW WAY
Double-click `public/index.html`. It runs in your browser.

### OPTION B: THE PYTHON WAY
```bash
cd public
python3 -m http.server 8080
# Open localhost:8080
```

---

## 🎨 DESIGN SYSTEM: "TERMINAL BRUTALISM"

The design language is Hostile/Functional.

| Element    | Value              |
|------------|--------------------|
| Background | `#111111` (Void)   |
| Text       | `#E0E0E0` (Phosphor White) |
| Accent     | `#33FF00` (Terminal Green) |
| Error      | `#FF3333` (Alert Red) |
| Font       | JetBrains Mono (self-hosted) |

---

## ⚔️ CONTRIBUTING

We accept pull requests that make the message clearer or the code cleaner.

**THE RULES:**
* **NO TELEMETRY**: Do not add Google Analytics, Facebook Pixels, or Hotjar.
* **NO EXTERNAL SCRIPTS**: Do not import JS from CDNs. If you need it, vendor it.
* **NO BLOAT**: Keep the CSS raw. No frameworks.

> "We cannot fix the internet. But we can build a room where it cannot see you."

---

## 📄 LICENSE

MIT License. Copy it. Fork it. Host it yourself. We are not gatekeepers. We are blueprint makers.