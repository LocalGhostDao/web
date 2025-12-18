### **Web Repository README (`localghostdao/web`)**

# > LOCALGHOST: THE TERMINAL

![Language](https://img.shields.io/badge/language-HTML5-orange?style=flat-square) ![Dependencies](https://img.shields.io/badge/dependencies-NONE-brightgreen?style=flat-square) ![Tracking](https://img.shields.io/badge/tracking-BLOCKED-red?style=flat-square)

> **"1993 WAS A WARNING. THIS WEBSITE IS THE EXIT NODE."**

This is the public-facing terminal for [LocalGhost](https://github.com/LocalGhostDao/localghost).
It is a Brutalist, zero-dependency static site designed to recruit operators for the resistance.

**[LIVE TERMINAL](https://www.localghost.ai)**

---

## ⚡ THE STACK (ZERO-BUILD)

We do not use React. We do not use Tailwind. We do not use npm.
We use **Raw HTML/CSS**.

* **Why?** Because a manifesto about sovereignty should not rely on a 200MB `node_modules` folder owned by strangers.
* **Performance:** Instant load times. No hydration gaps.
* **Privacy:** No Google Fonts. No Analytics. No Cookies.

### FILE STRUCTURE
* **`index.html`**: The main terminal interface.
* **`manifesto.html`**: The 1993 Cypherpunk source material.
* **`favicon.svg`**: The vector signal.

---

## 🖥️ LOCAL DEPLOYMENT

You do not need a complex build pipeline to run this. It is just files.

### OPTION A: THE RAW WAY
Double-click `index.html`. It runs in your browser.

### OPTION B: THE PYTHON WAY
```bash
# From the root directory
python3 -m http.server 8080
# Open localhost:8080
```

## 🎨 DESIGN SYSTEM: "TERMINAL BRUTALISM"
* The design language is Hostile/Functional.
* Background: #050505 (Void Black)
* Text: #E0E0E0 (Phosphor White)
* Accents: #33FF00 (Terminal Green) / #FF3333 (Error Red)
* Font: Monospace (System Default). We do not import fonts.

## ⚔️ CONTRIBUTING
We accept pull requests that make the message clearer or the code cleaner.

THE RULES:
* **NO TELEMETRY**: Do not add Google Analytics, Facebook Pixels, or Hotjar.
* **NO EXTERNAL SCRIPTS**: Do not import JS from CDNs. If you need it, vendor it.
* **NO BLOAT**: Keep the CSS raw. No frameworks.

"We cannot fix the internet. But we can build a room where it cannot see you."

## 📄 LICENSE
MIT License. Copy it. Fork it. Host it yourself. We are not gatekeepers. We are blueprint makers.
