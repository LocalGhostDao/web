// apply-footer.go
//
// Keeps the shared footer-links block in sync across every .html file under a
// directory, recursively. It replaces only the <div class="footer-links">...</div>
// block with the contents of footer.html, so each page keeps its own
// <p class="footer-quote"> untouched. footer.html is spliced in verbatim, with no
// reindenting, so format that file exactly as you want the block to read in every
// page. Because nothing is rewritten on the way in, a page that already holds the
// current block is left untouched and the diff shows precisely what changed.
//
// For each page it logs what it found, and on a change it prints a diff of the old
// links block against the new one. Pass -dry to preview every change without
// writing anything. Running it for real is safe to repeat.
//
// Usage:
//
//	go run . [-dry] [-no-color] [targetDir] [linksFile]
//	# or build once and reuse:
//	go build -o apply-footer . && ./apply-footer -dry ../site html/footer.html
//
// Defaults:
//
//	targetDir = .            (directory walked recursively)
//	linksFile = ./footer.html   (the <div class="footer-links"> block)
//
// It edits files in place. Run it on a clean git tree so you can diff and revert.
package main

import (
	"flag"
	"fmt"
	"io/fs"
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
	// The shared block we replace. (?i) case-insensitive, (?s) dot matches newlines, *? non-greedy.
	linksRe = regexp.MustCompile(`(?is)<div[^>]*class="footer-links"[^>]*>.*?</div>`)
	// Fallback target when a page has a footer but no links block yet.
	footerOpenRe = regexp.MustCompile(`(?is)<footer\b[^>]*>`)
	useColor     bool
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
// are skipped, so a one-line change does not redraw the whole block. It is a
// positional diff, not a longest-common-subsequence one, which is plenty for a
// block that is either identical or replaced wholesale.
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
		fmt.Fprintln(os.Stderr, "usage: apply-footer [-dry] [-no-color] [targetDir] [linksFile]")
		fmt.Fprintln(os.Stderr, "  targetDir  directory walked recursively (default \".\")")
		fmt.Fprintln(os.Stderr, "  linksFile  the footer-links block (default \"./footer.html\")")
	}
	flag.Parse()

	args := flag.Args()
	targetDir := "."
	linksFile := "footer.html"
	if len(args) > 0 {
		targetDir = args[0]
	}
	if len(args) > 1 {
		linksFile = args[1]
	}

	useColor = !*noColor && os.Getenv("NO_COLOR") == "" && isTerminal(os.Stdout)

	linksBytes, err := os.ReadFile(linksFile)
	if err != nil {
		fmt.Printf("links file not found, %s\n", linksFile)
		os.Exit(1)
	}
	links := strings.TrimSpace(string(linksBytes))
	linksAbs, _ := filepath.Abs(linksFile)

	modeLabel := "apply"
	if *dry {
		modeLabel = "dry run"
	}
	fmt.Printf("%s  scanning %s  (links=%s)  [%s]\n\n",
		col(cBold, "apply-footer"),
		col(cCyan, targetDir),
		col(cCyan, linksFile),
		col(cYellow, modeLabel),
	)

	var replaced, insertedN, unchanged, skipped, found int

	walkErr := filepath.WalkDir(targetDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			// skip dot-directories (e.g. .git) so we do not crawl them
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
		if abs == linksAbs {
			return nil // never rewrite the partial itself
		}

		found++
		srcBytes, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		src := string(srcBytes)

		var out, oldBlock, action string
		switch {
		case linksRe.MatchString(src):
			loc := linksRe.FindStringIndex(src) // first match only
			oldBlock = src[loc[0]:loc[1]]
			// Splice footer.html in verbatim. The block is written exactly as it
			// appears in footer.html, so a page already holding it is left untouched
			// (out == src) and the diff reflects exactly what gets written.
			out = src[:loc[0]] + links + src[loc[1]:]
			action = "replace"
		case footerOpenRe.MatchString(src):
			loc := footerOpenRe.FindStringIndex(src)
			// Same verbatim splice as the replace branch. Inserting the identical
			// bytes means a later run finds an exact match and leaves the file alone.
			out = src[:loc[1]] + "\n" + links + src[loc[1]:]
			action = "insert"
		default:
			skipped++
			fmt.Printf("  %s  %s  %s\n", col(cYellow, "skip"), path, col(cDim, "(no footer-links and no <footer>)"))
			return nil
		}

		if out == src {
			unchanged++
			fmt.Printf("  %s    %s  %s\n", col(cDim, "ok"), path, col(cDim, "(already current)"))
			return nil
		}

		if action == "replace" {
			replaced++
			label := "update"
			if *dry {
				label = "would update"
			}
			fmt.Printf("  %s  %s\n", col(cGreen, label), col(cBold, path))
			printDiff(oldBlock, links)
		} else {
			insertedN++
			label := "insert"
			if *dry {
				label = "would insert"
			}
			fmt.Printf("  %s  %s  %s\n", col(cGreen, label), col(cBold, path), col(cDim, "(no links block, added after <footer>)"))
			printLines(links, "+", cGreen)
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