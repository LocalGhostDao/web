// apply-menu.go
//
// Keeps the shared <nav> in sync across every .html file under a directory,
// recursively. It replaces the whole <nav>...</nav> block with the contents of
// menu.html. The one thing a flat copy would get wrong is the per-page "active"
// link, so this tool does not store active state in menu.html at all. menu.html
// holds the clean nav with no active class, and for each page the tool works out
// which link should be active from that page's own canonical URL (falling back to
// its file path) and adds class="active" to just that link.
//
// A single-page nav item (MANIFESTO, BUILD, DIRECTORY) is active only on its exact
// route. A section root listed in sectionPrefixes (currently just /hard-truths) is
// also active on any page beneath it, so every /hard-truths/<post> marks HARD
// TRUTHS. A page that no nav item owns (an essay like /why-local-ai, the home page,
// /brand-guidelines, /playlist) gets the nav with nothing marked, which is correct.
// The home link ("/") is never auto-activated.
//
// Apart from the active class, menu.html is spliced in verbatim with no
// reindenting, so format that file exactly as you want the nav to read in every
// page. A page that already holds the correct nav is left untouched and the diff
// shows precisely what changed. Pass -dry to preview. Running it for real is safe
// to repeat.
//
// Usage:
//
//	go run . [-dry] [-no-color] [targetDir] [menuFile]
//	# or build once and reuse:
//	go build -o apply-menu . && ./apply-menu -dry ../site html/menu.html
//
// Defaults:
//
//	targetDir = .          (directory walked recursively)
//	menuFile  = ./menu.html   (the <nav> block)
//
// It edits files in place. Run it on a clean git tree so you can diff and revert.
package main

import (
	"flag"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	cReset  = "\033[0m"
	cRed    = "\033[31m"
	cGreen  = "\033[32m"
	cYellow = "\033[33m"
	cCyan   = "\033[36m"
	cDim    = "\033[2m"
	cBold   = "\033[1m"
)

var (
	// The block we replace. (?i) case-insensitive, (?s) dot matches newlines, *? non-greedy.
	navRe = regexp.MustCompile(`(?is)<nav\b[^>]*>.*?</nav>`)
	// Fallback target when a page has no <nav> yet.
	bodyOpenRe = regexp.MustCompile(`(?is)<body\b[^>]*>`)
	// Find the canonical <link> tag, then pull href out of it (order-independent).
	canonicalRe = regexp.MustCompile(`(?is)<link\b[^>]*\brel="canonical"[^>]*>`)
	hrefAttrRe  = regexp.MustCompile(`(?is)\bhref="([^"]*)"`)
	classAttrRe = regexp.MustCompile(`(?is)\bclass="([^"]*)"`)
	aOpenRe     = regexp.MustCompile(`(?is)<a\b[^>]*>`)
	useColor    bool
)

func col(code, s string) string {
	if !useColor {
		return s
	}
	return code + s + cReset
}

// reveal makes trailing whitespace visible (· for a space, » for a tab) so a
// whitespace-only difference is never invisible in a diff.
func reveal(s string) string {
	trimmed := strings.TrimRight(s, " \t")
	if trimmed == s {
		return s
	}
	var b strings.Builder
	b.WriteString(trimmed)
	for _, r := range s[len(trimmed):] {
		if r == '\t' {
			b.WriteString("»")
		} else {
			b.WriteString("·")
		}
	}
	return b.String()
}

func printLines(block, sign, code string) {
	for _, line := range strings.Split(block, "\n") {
		fmt.Printf("      %s\n", col(code, sign+" "+reveal(line)))
	}
}

// printDiff shows only the lines that differ between the old and new block,
// aligned by line number, with trailing whitespace revealed. Lines that match
// are skipped, so a one-line change (such as the active class moving) does not
// redraw the whole nav. Positional diff, which is plenty for a block that is
// either identical or replaced wholesale.
func printDiff(oldBlock, newBlock string) {
	oldLines := strings.Split(oldBlock, "\n")
	newLines := strings.Split(newBlock, "\n")
	n := len(oldLines)
	if len(newLines) > n {
		n = len(newLines)
	}
	for i := 0; i < n; i++ {
		var o, ne string
		hasO, hasN := i < len(oldLines), i < len(newLines)
		if hasO {
			o = oldLines[i]
		}
		if hasN {
			ne = newLines[i]
		}
		if hasO && hasN && o == ne {
			continue
		}
		if hasO {
			fmt.Printf("      %s\n", col(cRed, "- "+reveal(o)))
		}
		if hasN {
			fmt.Printf("      %s\n", col(cGreen, "+ "+reveal(ne)))
		}
	}
}

// normRoute trims a trailing slash from a path (except root).
func normRoute(p string) string {
	if p != "/" && strings.HasSuffix(p, "/") {
		p = strings.TrimRight(p, "/")
	}
	if p == "" {
		return "/"
	}
	return p
}

// routeOf works out the path this page lives at. It prefers the canonical URL,
// since every page already declares one, and falls back to the file path.
func routeOf(src, path, root string) string {
	if tag := canonicalRe.FindString(src); tag != "" {
		if h := hrefAttrRe.FindStringSubmatch(tag); h != nil {
			if u, err := url.Parse(h[1]); err == nil && u.Path != "" {
				return normRoute(u.Path)
			}
		}
	}
	rel, err := filepath.Rel(root, path)
	if err != nil {
		rel = filepath.Base(path)
	}
	rel = filepath.ToSlash(rel)
	rel = strings.TrimSuffix(rel, ".html")
	rel = strings.TrimSuffix(rel, ".htm")
	rel = strings.TrimSuffix(rel, "/index")
	if rel == "index" || rel == "." || rel == "" {
		return "/"
	}
	return normRoute("/" + rel)
}

// withActive adds the active class to a single <a ...> opening tag, merging with
// any class it already has and never doubling up.
func withActive(tag string) string {
	if classAttrRe.MatchString(tag) {
		return classAttrRe.ReplaceAllStringFunc(tag, func(c string) string {
			sub := classAttrRe.FindStringSubmatch(c)
			for _, f := range strings.Fields(sub[1]) {
				if f == "active" {
					return c // already active, leave it
				}
			}
			return `class="` + strings.TrimSpace(sub[1]+" active") + `"`
		})
	}
	i := strings.LastIndex(tag, ">")
	return tag[:i] + ` class="active"` + tag[i:]
}

// sectionPrefixes are the nav roots that also own their child pages. A page below
// one of these, like /hard-truths/inflection, highlights that section. Every other
// nav link is a single page and highlights only on its exact route. Add a prefix
// here if you ever add another multi-page section to the nav.
var sectionPrefixes = []string{"/hard-truths"}

func isSection(href string) bool {
	for _, p := range sectionPrefixes {
		if href == p {
			return true
		}
	}
	return false
}

// activate returns the nav with active set on the link that owns this route. A
// link owns the route when the route equals its href exactly, or when the link is
// a section root and the route sits beneath it. When more than one qualifies the
// longest href wins. The home link and external links are never matched.
func activate(nav, route string) string {
	best := ""
	for _, tag := range aOpenRe.FindAllString(nav, -1) {
		h := hrefAttrRe.FindStringSubmatch(tag)
		if h == nil {
			continue
		}
		href := h[1]
		if !strings.HasPrefix(href, "/") || strings.HasPrefix(href, "//") {
			continue // internal paths only
		}
		if href == "/" {
			continue // never auto-activate the home link
		}
		owns := route == href || (isSection(href) && strings.HasPrefix(route, href+"/"))
		if owns && len(href) > len(best) {
			best = href
		}
	}
	if best == "" {
		return nav // no nav item owns this page
	}
	return aOpenRe.ReplaceAllStringFunc(nav, func(tag string) string {
		h := hrefAttrRe.FindStringSubmatch(tag)
		if h == nil || h[1] != best {
			return tag
		}
		return withActive(tag)
	})
}

// isTerminal reports whether f is attached to a terminal (a char device).
func isTerminal(f *os.File) bool {
	info, err := f.Stat()
	if err != nil {
		return false
	}
	return info.Mode()&os.ModeCharDevice != 0
}

func main() {
	dry := flag.Bool("dry", false, "show what would change without writing any files")
	noColor := flag.Bool("no-color", false, "disable ANSI colour in output")
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: apply-menu [-dry] [-no-color] [targetDir] [menuFile]")
		fmt.Fprintln(os.Stderr, "  targetDir  directory walked recursively (default \".\")")
		fmt.Fprintln(os.Stderr, "  menuFile   the <nav> block (default \"./menu.html\")")
	}
	flag.Parse()

	args := flag.Args()
	targetDir := "."
	menuFile := "menu.html"
	if len(args) > 0 {
		targetDir = args[0]
	}
	if len(args) > 1 {
		menuFile = args[1]
	}

	useColor = !*noColor && os.Getenv("NO_COLOR") == "" && isTerminal(os.Stdout)

	menuBytes, err := os.ReadFile(menuFile)
	if err != nil {
		fmt.Printf("menu file not found, %s\n", menuFile)
		os.Exit(1)
	}
	menu := strings.TrimSpace(string(menuBytes))
	menuAbs, _ := filepath.Abs(menuFile)

	modeLabel := "apply"
	if *dry {
		modeLabel = "dry run"
	}
	fmt.Printf("%s  scanning %s  (menu=%s)  [%s]\n\n",
		col(cBold, "apply-menu"),
		col(cCyan, targetDir),
		col(cCyan, menuFile),
		col(cYellow, modeLabel),
	)

	var replaced, insertedN, unchanged, skipped, found int

	walkErr := filepath.WalkDir(targetDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if path != targetDir && strings.HasPrefix(d.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}

		lower := strings.ToLower(d.Name())
		if !strings.HasSuffix(lower, ".html") && !strings.HasSuffix(lower, ".htm") {
			return nil
		}
		abs, _ := filepath.Abs(path)
		if abs == menuAbs {
			return nil // never rewrite the partial itself
		}

		found++
		srcBytes, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		src := string(srcBytes)

		route := routeOf(src, path, targetDir)
		newNav := activate(menu, route)

		var out, oldBlock, action string
		switch {
		case navRe.MatchString(src):
			loc := navRe.FindStringIndex(src) // first match only
			oldBlock = src[loc[0]:loc[1]]
			out = src[:loc[0]] + newNav + src[loc[1]:]
			action = "replace"
		case bodyOpenRe.MatchString(src):
			loc := bodyOpenRe.FindStringIndex(src)
			out = src[:loc[1]] + "\n" + newNav + src[loc[1]:]
			action = "insert"
		default:
			skipped++
			fmt.Printf("  %s  %s  %s\n", col(cYellow, "skip"), path, col(cDim, "(no <nav> and no <body>)"))
			return nil
		}

		if out == src {
			unchanged++
			fmt.Printf("  %s    %s  %s\n", col(cDim, "ok"), path, col(cDim, fmt.Sprintf("(already current, route %s)", route)))
			return nil
		}

		if action == "replace" {
			replaced++
			label := "update"
			if *dry {
				label = "would update"
			}
			fmt.Printf("  %s  %s  %s\n", col(cGreen, label), col(cBold, path), col(cDim, "(route "+route+")"))
			printDiff(oldBlock, newNav)
		} else {
			insertedN++
			label := "insert"
			if *dry {
				label = "would insert"
			}
			fmt.Printf("  %s  %s  %s\n", col(cGreen, label), col(cBold, path), col(cDim, "(no <nav>, added after <body>, route "+route+")"))
			printLines(newNav, "+", cGreen)
		}

		if !*dry {
			fm := fs.FileMode(0o644)
			if info, statErr := d.Info(); statErr == nil {
				fm = info.Mode().Perm()
			}
			if werr := os.WriteFile(path, []byte(out), fm); werr != nil {
				return werr
			}
		}
		return nil
	})

	if walkErr != nil {
		fmt.Fprintln(os.Stderr, col(cRed, "error, ")+walkErr.Error())
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println(col(cBold, fmt.Sprintf(
		"done. %d page(s) found, %d updated, %d inserted, %d already current, %d skipped.",
		found, replaced, insertedN, unchanged, skipped)))
	if *dry {
		fmt.Println(col(cYellow, "dry run, nothing was written. drop -dry to apply."))
	}
}