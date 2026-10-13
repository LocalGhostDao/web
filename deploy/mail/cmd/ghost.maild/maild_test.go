package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"net/smtp"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"localghost/maild/internal/seal"
	"localghost/maild/internal/wire"
)

func selfSigned(t *testing.T) tls.Certificate {
	t.Helper()
	k, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "mx.test"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), DNSNames: []string{"mx.test"}}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &k.PublicKey, k)
	if err != nil {
		t.Fatal(err)
	}
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: k}
}

func testServer(t *testing.T) (*smtpServer, *box, []byte, string) {
	t.Helper()
	priv, pub, _ := seal.GenerateKey()
	tok := sha256.Sum256([]byte("secret"))
	bx := &box{ID: "vlad", Domains: []string{"lgs.example"}, Addresses: []string{"vlad@ghost.relay.example"}, Pub: pub, Token: tok}
	bs := &boxes{byID: map[string]*box{"vlad": bx}, byDomain: map[string]*box{"lgs.example": bx}, byAddress: map[string]*box{"vlad@ghost.relay.example": bx}}
	crt := selfSigned(t)
	data := t.TempDir()
	lg := slog.New(slog.NewTextHandler(os.Stderr, nil))
	cfg := config{Hostname: "mx.test", Data: data, MaxSize: 4096}
	s := &smtpServer{cfg: cfg, boxes: bs, tls: &tls.Config{Certificates: []tls.Certificate{crt}}, q: &queue{root: data, lg: lg}, lg: lg, limits: newLimits(), grey: newGreylist(false)}
	return s, bx, priv, data
}

func TestSMTPReceivesSealsAndNotes(t *testing.T) {
	s, bx, priv, data := testServer(t)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go s.serve(ctx, ln)
	addr := ln.Addr().String()

	c, err := smtp.Dial(addr)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Hello("sender.example"); err != nil {
		t.Fatal(err)
	}
	// no TLS, no MAIL
	if err := c.Mail("paul@example.org"); err == nil || !strings.Contains(err.Error(), "STARTTLS") {
		t.Fatalf("MAIL before TLS should be refused: %v", err)
	}
	if err := c.StartTLS(&tls.Config{InsecureSkipVerify: true}); err != nil {
		t.Fatal(err)
	}
	if err := c.Mail("paul@example.org"); err != nil {
		t.Fatal(err)
	}
	if err := c.Rcpt("someone@elsewhere.example"); err == nil || !strings.Contains(err.Error(), "no such mailbox") {
		t.Fatalf("a relay attempt should be 550: %v", err)
	}
	if err := c.Rcpt("agent@lgs.example"); err != nil {
		t.Fatal(err)
	}
	// an address on the shared domain reaches the box; a neighbour on it does not
	if err := c.Rcpt("vlad@ghost.relay.example"); err != nil {
		t.Fatal(err)
	}
	if err := c.Rcpt("other@ghost.relay.example"); err == nil {
		t.Fatal("a stranger's address on the shared domain was accepted")
	}
	w, err := c.Data()
	if err != nil {
		t.Fatal(err)
	}
	msg := "From: Paul <paul@example.org>\r\nTo: agent@lgs.example\r\nSubject: hi\r\nDate: Mon, 12 Oct 2026 10:00:00 +0100\r\nMessage-ID: <1@example.org>\r\n\r\n.a dot-stuffed line\r\nplain\r\n"
	if _, err := w.Write([]byte(msg)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	c.Quit()

	list, err := s.q.list(bx.ID)
	if err != nil || len(list) != 1 || !list[0].Note {
		t.Fatalf("queue: %v %+v", err, list)
	}
	sealed, _ := os.ReadFile(filepath.Join(data, "vlad", "in", list[0].Name))
	raw, err := seal.Open(bytes.NewReader(sealed), priv, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(raw, []byte("Received: from sender.example")) || !bytes.Contains(raw, []byte("by mx.test with ESMTPS (TLS")) {
		t.Fatalf("no Received line: %q", raw)
	}
	if !bytes.HasSuffix(raw, []byte(".a dot-stuffed line\r\nplain\r\n")) {
		t.Fatalf("body: %q", raw)
	}
	noteSealed, _ := os.ReadFile(filepath.Join(data, "vlad", "in", wire.NoteName(list[0].Name)))
	nb, err := seal.Open(bytes.NewReader(noteSealed), priv, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	var note wire.Note
	if err := json.Unmarshal(nb, &note); err != nil {
		t.Fatal(err)
	}
	if note.MailFrom != "paul@example.org" || note.RcptTo[0] != "agent@lgs.example" || len(note.RcptTo) != 2 || note.IP != "127.0.0.1" || note.Helo != "sender.example" || note.Size == 0 {
		t.Fatalf("%+v", note)
	}
	// nothing readable on disk
	entries, _ := os.ReadDir(filepath.Join(data, "vlad", "in"))
	for _, e := range entries {
		b, _ := os.ReadFile(filepath.Join(data, "vlad", "in", e.Name()))
		if bytes.Contains(b, []byte("paul@example.org")) {
			t.Fatal("plaintext on disk")
		}
	}
	// a message over the size is refused after DATA
	c2, _ := smtp.Dial(addr)
	c2.Hello("sender.example")
	c2.StartTLS(&tls.Config{InsecureSkipVerify: true})
	c2.Mail("paul@example.org")
	c2.Rcpt("agent@lgs.example")
	w2, _ := c2.Data()
	w2.Write(bytes.Repeat([]byte("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\r\n"), 80))
	if err := w2.Close(); err == nil || !strings.Contains(err.Error(), "too large") {
		t.Fatalf("oversize: %v", err)
	}
	c2.Quit()
	if l, _ := s.q.list(bx.ID); len(l) != 1 {
		t.Fatalf("oversize message queued: %d", len(l))
	}
}

func TestParsePath(t *testing.T) {
	a, p, ok := parsePath("FROM:<Paul@Example.ORG> SIZE=12 BODY=8BITMIME", "FROM:")
	if !ok || a != "Paul@example.org" || p["SIZE"] != "12" {
		t.Fatalf("%q %v %v", a, p, ok)
	}
	if a, _, ok := parsePath("FROM:<>", "FROM:"); !ok || a != "" {
		t.Fatal("null sender")
	}
	if a, _, ok := parsePath("TO:<@relay.example:user@dest.example>", "TO:"); !ok || a != "user@dest.example" {
		t.Fatalf("source route: %q", a)
	}
	for _, bad := range []string{"TO:<nobody>", "TO:<a@b>", "TO:<a b@c.example>", "TO:<ü@c.example>", "TO:<a@[127.0.0.1]>"} {
		if _, _, ok := parsePath(bad, "TO:"); ok {
			t.Fatalf("accepted %q", bad)
		}
	}
}

func TestAPIAuthAndListing(t *testing.T) {
	s, bx, _, data := testServer(t)
	in, err := s.q.openInbound(bx)
	if err != nil {
		t.Fatal(err)
	}
	in.Write([]byte("From: a@b.example\r\n\r\nhi\r\n"))
	if err := in.finish(wire.Note{IP: "10.0.0.1"}); err != nil {
		t.Fatal(err)
	}
	api := &apiServer{cfg: s.cfg, boxes: s.boxes, q: s.q, lg: s.lg}
	srv := httptest.NewServer(api.handler())
	defer srv.Close()
	get := func(path, token string) (int, []byte) {
		req, _ := http.NewRequest("GET", srv.URL+path, nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var b bytes.Buffer
		b.ReadFrom(resp.Body)
		return resp.StatusCode, b.Bytes()
	}
	if code, _ := get("/box/vlad/in/", ""); code != 401 {
		t.Fatalf("no token: %d", code)
	}
	if code, _ := get("/box/vlad/in/", "wrong"); code != 401 {
		t.Fatalf("wrong token: %d", code)
	}
	if code, _ := get("/box/other/in/", "secret"); code != 401 {
		t.Fatalf("other box: %d", code)
	}
	code, body := get("/box/vlad/in/", "secret")
	if code != 200 {
		t.Fatalf("list: %d %s", code, body)
	}
	var list []wire.Entry
	json.Unmarshal(body, &list)
	if len(list) != 1 || !list[0].Note {
		t.Fatalf("%+v", list)
	}
	if wire.NameRe.MatchString("../../etc/passwd") || wire.NameRe.MatchString("x.seal") {
		t.Fatal("a name that is not a queue name")
	}
	if code, _ := get("/box/vlad/in/notaname.seal", "secret"); code != 404 {
		t.Fatalf("bad name: %d", code)
	}
	code, got := get("/box/vlad/in/"+list[0].Name, "secret")
	disk, _ := os.ReadFile(filepath.Join(data, "vlad", "in", list[0].Name))
	if code != 200 || !bytes.Equal(got, disk) {
		t.Fatal("fetch differs from disk")
	}
	req, _ := http.NewRequest("DELETE", srv.URL+"/box/vlad/in/"+list[0].Name, nil)
	req.Header.Set("Authorization", "Bearer secret")
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != 204 {
		t.Fatalf("delete: %d", resp.StatusCode)
	}
	if l, _ := s.q.list("vlad"); len(l) != 0 {
		t.Fatal("not deleted")
	}
	if _, err := os.Stat(filepath.Join(data, "vlad", "in", wire.NoteName(list[0].Name))); err == nil {
		t.Fatal("note not deleted")
	}
}

func TestBoxesConfAndStructural(t *testing.T) {
	_, pub, _ := seal.GenerateKey()
	tok := sha256.Sum256([]byte("x"))
	p := filepath.Join(t.TempDir(), "boxes.conf")
	os.WriteFile(p, []byte("# comment\nbox=vlad domains=lgs.example,Other.Example pub="+hex.EncodeToString(pub)+" token="+hex.EncodeToString(tok[:])+"\n"), 0o600)
	mm, err := loadBoxes(p)
	if err != nil || len(mm.byID) != 1 || mm.byDomain["other.example"] == nil {
		t.Fatal(err)
	}
	os.WriteFile(p, []byte("box=vlad domains=a.example pub=zz token=zz\n"), 0o600)
	if _, err := loadBoxes(p); err == nil {
		t.Fatal("bad key accepted")
	}
	os.WriteFile(p, []byte("box=vlad addresses=vlad@ghost.relay.example pub="+hex.EncodeToString(pub)+" token="+hex.EncodeToString(tok[:])+" dkim_rsa=AAAA dkim_ed=BBBB\n"), 0o600)
	mm, err = loadBoxes(p)
	if err != nil || mm.byAddress["vlad@ghost.relay.example"] == nil || mm.byID["vlad"].DKIMEd != "BBBB" {
		t.Fatal(err)
	}
	bx := &box{ID: "vlad", Domains: []string{"lgs.example"}, Addresses: []string{"vlad@ghost.relay.example"}}
	ok := []byte("DKIM-Signature: v=1; a=ed25519-sha256; d=lgs.example; s=vlad-ed;\r\n\tb=abc\r\nFrom: Agent <agent@lgs.example>\r\nTo: x@y.example\r\n\r\nhi\r\n")
	if err := structural(ok, bx); err != nil {
		t.Fatal(err)
	}
	shared := []byte("DKIM-Signature: v=1; a=rsa-sha256; d=ghost.relay.example; s=vlad-rsa; b=abc\r\nFrom: vlad@ghost.relay.example\r\n\r\nhi\r\n")
	if err := structural(shared, bx); err != nil {
		t.Fatal(err)
	}
	if err := structural([]byte("From: agent@lgs.example\r\n\r\nhi\r\n"), bx); err == nil {
		t.Fatal("unsigned accepted")
	}
	if err := structural([]byte("DKIM-Signature: d=lgs.example\r\nFrom: someone@else.example\r\n\r\nhi\r\n"), bx); err == nil {
		t.Fatal("foreign From accepted")
	}
	if err := structural([]byte("DKIM-Signature: d=lgs.example\r\nFrom: vlad@ghost.relay.example\r\n\r\nhi\r\n"), bx); err == nil {
		t.Fatal("a signature by another of the box's domains accepted")
	}
	a := newAllowance(3, 2)
	if !a.take("b", 0, 0, 2) || a.take("b", 0, 0, 1) {
		t.Fatal("hour allowance")
	}
}
