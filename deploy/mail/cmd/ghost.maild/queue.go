package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"localghost/maild/internal/seal"
	"localghost/maild/internal/wire"
)

// queue is the sealed files on disk: <data>/<box>/in/ for the box to fetch, <data>/<box>/out/ for
// the relay to deliver. Names are the time and sixteen random hex chars; nothing in a name says
// who wrote.
type queue struct {
	root string
	lg   *slog.Logger
}

func newName() string {
	var r [8]byte
	_, _ = rand.Read(r[:])
	return fmt.Sprintf("%d-%s.seal", time.Now().UnixNano(), hex.EncodeToString(r[:]))
}

func (q *queue) dir(boxID, which string) (string, error) {
	d := filepath.Join(q.root, boxID, which)
	return d, os.MkdirAll(d, 0o750)
}

// size is the bytes a box holds in a directory.
func (q *queue) size(boxID, which string) int64 {
	d := filepath.Join(q.root, boxID, which)
	var n int64
	entries, err := os.ReadDir(d)
	if err != nil {
		return 0
	}
	for _, e := range entries {
		if info, err := e.Info(); err == nil && !e.IsDir() {
			n += info.Size()
		}
	}
	return n
}

// inbound is one message being written for one box: a sealed message file streamed as the bytes
// arrive, then the sealed note once the envelope is complete.
type inbound struct {
	q     *queue
	box   *box
	name  string
	part  string
	f     *os.File
	w     *seal.Writer
	bytes int64
}

func (q *queue) openInbound(bx *box) (*inbound, error) {
	d, err := q.dir(bx.ID, "in")
	if err != nil {
		return nil, err
	}
	name := newName()
	part := filepath.Join(d, "."+name+".part")
	f, err := os.OpenFile(part, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o640)
	if err != nil {
		return nil, err
	}
	w, err := seal.NewWriter(f, bx.Pub)
	if err != nil {
		f.Close()
		os.Remove(part)
		return nil, err
	}
	return &inbound{q: q, box: bx, name: name, part: part, f: f, w: w}, nil
}

func (in *inbound) Write(p []byte) (int, error) {
	n, err := in.w.Write(p)
	in.bytes += int64(n)
	return n, err
}

// finish closes the message and writes the note; both files appear under their final names only
// once both are complete, so a listing never shows a half.
func (in *inbound) finish(note wire.Note) error {
	if err := in.w.Close(); err != nil {
		in.abort()
		return err
	}
	if err := in.f.Close(); err != nil {
		in.abort()
		return err
	}
	note.Name = in.name
	note.Box = in.box.ID
	note.Size = in.bytes
	sealedNote, err := seal.SealBytes(wire.EncodeNote(note), in.box.Pub)
	if err != nil {
		in.abort()
		return err
	}
	d := filepath.Dir(in.part)
	notePath := filepath.Join(d, wire.NoteName(in.name))
	if err := os.WriteFile(notePath+".part", sealedNote, 0o640); err != nil {
		in.abort()
		return err
	}
	if err := os.Rename(notePath+".part", notePath); err != nil {
		in.abort()
		return err
	}
	if err := os.Rename(in.part, filepath.Join(d, in.name)); err != nil {
		os.Remove(notePath)
		in.abort()
		return err
	}
	return nil
}

func (in *inbound) abort() {
	if in.f != nil {
		in.f.Close()
	}
	os.Remove(in.part)
}

// list is the box's inbound queue, oldest first.
func (q *queue) list(boxID string) ([]wire.Entry, error) {
	d := filepath.Join(q.root, boxID, "in")
	entries, err := os.ReadDir(d)
	if err != nil {
		if os.IsNotExist(err) {
			return []wire.Entry{}, nil
		}
		return nil, err
	}
	notes := map[string]bool{}
	var out []wire.Entry
	for _, e := range entries {
		n := e.Name()
		if e.IsDir() || !wire.NameRe.MatchString(n) {
			continue
		}
		if strings.HasSuffix(n, ".note.seal") {
			notes[n] = true
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, wire.Entry{Name: n, Size: info.Size()})
	}
	for i := range out {
		out[i].Note = notes[wire.NoteName(out[i].Name)]
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	if out == nil {
		out = []wire.Entry{}
	}
	return out, nil
}

// remove deletes a message and its note.
func (q *queue) remove(boxID, name string) error {
	d := filepath.Join(q.root, boxID, "in")
	err := os.Remove(filepath.Join(d, name))
	if !strings.HasSuffix(name, ".note.seal") {
		_ = os.Remove(filepath.Join(d, wire.NoteName(name)))
	}
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// sweep removes queued files older than keep, and stale .part files from a connection that died.
func (q *queue) sweep(keep time.Duration) {
	boxDirs, err := os.ReadDir(q.root)
	if err != nil {
		return
	}
	cut := time.Now().Add(-keep)
	removed := 0
	for _, bd := range boxDirs {
		if !bd.IsDir() {
			continue
		}
		for _, which := range []string{"in", "out"} {
			d := filepath.Join(q.root, bd.Name(), which)
			entries, err := os.ReadDir(d)
			if err != nil {
				continue
			}
			for _, e := range entries {
				info, err := e.Info()
				if err != nil || e.IsDir() {
					continue
				}
				stale := strings.HasPrefix(e.Name(), ".") && info.ModTime().Before(time.Now().Add(-time.Hour))
				if info.ModTime().Before(cut) || stale {
					if os.Remove(filepath.Join(d, e.Name())) == nil {
						removed++
					}
				}
			}
		}
	}
	if removed > 0 {
		q.lg.Info("queue swept", "removed", removed)
	}
}
