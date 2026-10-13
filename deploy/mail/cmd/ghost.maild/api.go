package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"localghost/maild/internal/seal"
	"localghost/maild/internal/wire"
)

// apiServer is what the box talks to, behind the host's nginx on HTTPS: the inbound queue, the
// outbound post, and the relay's public key. Every call carries the box's bearer token; the box's
// id is in the path and must match the token's.
type apiServer struct {
	cfg       config
	boxes     *boxes
	q         *queue
	out       *outbound
	lg        *slog.Logger
	relayPriv []byte
}

func (a *apiServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/box/", a.box)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { http.Error(w, "nothing here", http.StatusNotFound) })
	return mux
}

func (a *apiServer) auth(w http.ResponseWriter, r *http.Request, id string) *box {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		http.Error(w, "no token", http.StatusUnauthorized)
		return nil
	}
	bx := a.boxes.byToken(id, strings.TrimSpace(h[len("Bearer "):]))
	if bx == nil {
		http.Error(w, "no such box or wrong token", http.StatusUnauthorized)
		return nil
	}
	return bx
}

// box routes /box/<id>/in/, /box/<id>/in/<name>, /box/<id>/out, /box/<id>/out/<name>,
// /box/<id>/key.
func (a *apiServer) box(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/box/"), "/"), "/")
	if len(parts) < 2 || !wire.BoxRe.MatchString(parts[0]) {
		http.Error(w, "bad path", http.StatusNotFound)
		return
	}
	bx := a.auth(w, r, parts[0])
	if bx == nil {
		return
	}
	switch {
	case parts[1] == "in" && len(parts) == 2:
		if r.Method != http.MethodGet {
			http.Error(w, "GET", http.StatusMethodNotAllowed)
			return
		}
		list, err := a.q.list(bx.ID)
		if err != nil {
			http.Error(w, "listing failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	case parts[1] == "in" && len(parts) == 3:
		name := parts[2]
		if !wire.NameRe.MatchString(name) {
			http.Error(w, "bad name", http.StatusNotFound)
			return
		}
		path := pathOf(a.cfg.Data, bx.ID, "in", name)
		switch r.Method {
		case http.MethodGet:
			f, err := os.Open(path)
			if err != nil {
				http.Error(w, "no such message", http.StatusNotFound)
				return
			}
			defer f.Close()
			w.Header().Set("Content-Type", "application/octet-stream")
			io.Copy(w, f)
		case http.MethodDelete:
			if err := a.q.remove(bx.ID, name); err != nil {
				http.Error(w, "delete failed", http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "GET or DELETE", http.StatusMethodNotAllowed)
		}
	case parts[1] == "key" && len(parts) == 2:
		if a.relayPriv == nil {
			http.Error(w, "outbound is off on this relay", http.StatusServiceUnavailable)
			return
		}
		pub, err := seal.PublicOf(a.relayPriv)
		if err != nil {
			http.Error(w, "key", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"pub": hexOf(pub), "hostname": a.cfg.Hostname})
	case parts[1] == "out" && len(parts) == 2:
		if r.Method != http.MethodPost {
			http.Error(w, "POST", http.StatusMethodNotAllowed)
			return
		}
		if a.out == nil {
			http.Error(w, "outbound is off on this relay", http.StatusServiceUnavailable)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, a.cfg.MaxSize+4096))
		if err != nil {
			http.Error(w, "read", http.StatusBadRequest)
			return
		}
		var ob wire.Outbound
		if err := json.Unmarshal(body, &ob); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		name, err := a.out.accept(bx, ob)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnprocessableEntity)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"name": name})
	case parts[1] == "out" && len(parts) == 3:
		name := parts[2]
		if !wire.NameRe.MatchString(name) {
			http.Error(w, "bad name", http.StatusNotFound)
			return
		}
		b, err := os.ReadFile(filepath.Join(a.cfg.Data, bx.ID, "out", name+".json"))
		if err != nil {
			http.Error(w, "no such message", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	default:
		http.Error(w, "bad path", http.StatusNotFound)
	}
}

func hexOf(b []byte) string {
	const digits = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, c := range b {
		out[i*2], out[i*2+1] = digits[c>>4], digits[c&0xf]
	}
	return string(out)
}
