package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"localghost/maild/internal/seal"
	"localghost/maild/internal/wire"
)

const (
	outGiveUp  = 24 * time.Hour
	outTick    = 30 * time.Second
	maxOutRcpt = 20
)

// job is one outbound message's state, kept beside its sealed bytes as <name>.json.
type job struct {
	Name     string            `json:"name"`
	Box      string            `json:"box"`
	From     string            `json:"from"`
	To       []string          `json:"to"`
	Pending  []string          `json:"pending"`
	Failed   map[string]string `json:"failed,omitempty"` // recipient -> the last error
	Tries    int               `json:"tries"`
	Next     int64             `json:"next"`
	Accepted int64             `json:"accepted"`
	Updated  int64             `json:"updated"`
	State    string            `json:"state"` // queued, sent, bounced
	LastErr  string            `json:"lastErr,omitempty"`
}

// outbound takes what a box signed and sealed, and delivers it.
type outbound struct {
	cfg   config
	boxes *boxes
	q     *queue
	priv  []byte
	pub   []byte
	lg    *slog.Logger
	allow *allowance
	mu    sync.Mutex
}

var errRefused = errors.New("refused")

// accept checks an outbound post and queues it. The relay verifies nothing cryptographic (that is
// the receivers' job and the box's signature is theirs to check); it refuses what is structurally
// not the box's: a From off its domains, a message without a DKIM-Signature by its domain, more
// than its allowance.
func (o *outbound) accept(bx *box, ob wire.Outbound) (string, error) {
	if o.pub == nil {
		p, err := seal.PublicOf(o.priv)
		if err != nil {
			return "", err
		}
		o.pub = p
	}
	from, _, ok := parsePath("FROM:<"+strings.TrimSpace(ob.From)+">", "FROM:")
	from = strings.ToLower(from)
	if !ok || from == "" || !bx.owns(from) {
		return "", fmt.Errorf("the envelope sender is not an address of this box")
	}
	if len(ob.To) == 0 || len(ob.To) > maxOutRcpt {
		return "", fmt.Errorf("between one and %d recipients", maxOutRcpt)
	}
	var to []string
	for _, t := range ob.To {
		a, _, ok := parsePath("TO:<"+strings.TrimSpace(t)+">", "TO:")
		if !ok || a == "" {
			return "", fmt.Errorf("bad recipient %q", t)
		}
		to = append(to, a)
	}
	raw, err := seal.Open(bytes.NewReader(ob.Sealed), o.priv, int(o.cfg.MaxSize))
	if err != nil {
		return "", fmt.Errorf("the message does not open with the relay's key")
	}
	if err := structural(raw, bx); err != nil {
		return "", err
	}
	day := bx.SendDay
	if day == 0 {
		day = o.cfg.SendDay
	}
	if !o.allow.take(bx.ID, day, o.cfg.SendHour, len(to)) {
		return "", fmt.Errorf("sending allowance reached for today or this hour")
	}
	d, err := o.q.dir(bx.ID, "out")
	if err != nil {
		return "", err
	}
	sealed, err := seal.SealBytes(raw, o.pub)
	if err != nil {
		return "", err
	}
	name := newName()
	if err := os.WriteFile(filepath.Join(d, name), sealed, 0o640); err != nil {
		return "", err
	}
	now := time.Now().Unix()
	j := job{Name: name, Box: bx.ID, From: from, To: to, Pending: to, Accepted: now, Updated: now, Next: now, State: "queued"}
	if err := o.save(j); err != nil {
		os.Remove(filepath.Join(d, name))
		return "", err
	}
	o.lg.Info("outbound queued", "box", bx.ID, "rcpts", len(to), "bytes", len(raw))
	return name, nil
}

// structural is the relay's only look at an outbound message: exactly one From header holding
// exactly one address that is the box's (one of its addresses, or on a domain it owns), and a
// DKIM-Signature with d= that From's domain. It reads the headers the way every receiver will
// (net/mail: the first blank line ends the block, a bare LF is a line end), so what it authorises
// is what a receiver attributes; the audit found the old scan took the LAST From and ended the
// block at the first CRLFCRLF, which let a box on a shared domain send as its neighbour.
func structural(raw []byte, bx *box) error {
	// the header block must be CRLF lines with no bare CR or LF anywhere in it: a bare line
	// break is where the relay and a receiver would start to disagree
	end := bytes.Index(raw, []byte("\r\n\r\n"))
	hdr := raw
	if end >= 0 {
		hdr = raw[:end+2]
	}
	if bytes.Contains(bytes.ReplaceAll(hdr, []byte("\r\n"), nil), []byte("\r")) || bytes.Contains(bytes.ReplaceAll(hdr, []byte("\r\n"), nil), []byte("\n")) {
		return fmt.Errorf("a bare CR or LF in the headers")
	}
	if end < 0 {
		// no blank line at all: net/mail needs one
		hdr = append(append([]byte{}, hdr...), '\r', '\n')
	}
	msg, err := mail.ReadMessage(bytes.NewReader(hdr))
	if err != nil {
		return fmt.Errorf("the headers do not parse")
	}
	froms := msg.Header["From"]
	if len(froms) != 1 {
		return fmt.Errorf("exactly one From header")
	}
	addrs, err := mail.ParseAddressList(froms[0])
	if err != nil || len(addrs) != 1 {
		return fmt.Errorf("From must be exactly one address")
	}
	if n := len(msg.Header["Sender"]); n > 1 {
		return fmt.Errorf("more than one Sender header")
	}
	fromAddr := strings.ToLower(strings.TrimSpace(addrs[0].Address))
	if fromAddr == "" || !bx.owns(fromAddr) {
		return fmt.Errorf("the From header is not an address of this box")
	}
	fromDomain := fromAddr[strings.LastIndexByte(fromAddr, '@')+1:]
	for _, sig := range msg.Header["Dkim-Signature"] {
		for _, t := range strings.Split(sig, ";") {
			tk, tv, _ := strings.Cut(strings.TrimSpace(t), "=")
			if strings.TrimSpace(tk) == "d" && strings.ToLower(strings.TrimSpace(tv)) == fromDomain {
				return nil
			}
		}
	}
	return fmt.Errorf("no DKIM-Signature by the From address's domain; the box signs, the relay does not")
}

func (o *outbound) save(j job) error {
	j.Updated = time.Now().Unix()
	b, _ := json.Marshal(j)
	p := filepath.Join(o.cfg.Data, j.Box, "out", j.Name+".json")
	if err := os.WriteFile(p+".tmp", b, 0o640); err != nil {
		return err
	}
	return os.Rename(p+".tmp", p)
}

// run is the delivery loop: every half minute, every queued job whose time has come.
func (o *outbound) run(ctx context.Context) {
	t := time.NewTicker(outTick)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		o.pass(ctx)
	}
}

func (o *outbound) pass(ctx context.Context) {
	boxDirs, err := os.ReadDir(o.cfg.Data)
	if err != nil {
		return
	}
	now := time.Now().Unix()
	for _, bd := range boxDirs {
		if !bd.IsDir() {
			continue
		}
		d := filepath.Join(o.cfg.Data, bd.Name(), "out")
		entries, err := os.ReadDir(d)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !strings.HasSuffix(e.Name(), ".json") {
				continue
			}
			b, err := os.ReadFile(filepath.Join(d, e.Name()))
			if err != nil {
				continue
			}
			var j job
			if json.Unmarshal(b, &j) != nil || j.State != "queued" || j.Next > now {
				continue
			}
			o.attempt(ctx, &j)
			if ctx.Err() != nil {
				return
			}
		}
	}
}

// attempt delivers one job's pending recipients, domain by domain.
func (o *outbound) attempt(ctx context.Context, j *job) {
	sealedPath := filepath.Join(o.cfg.Data, j.Box, "out", j.Name)
	sealed, err := os.ReadFile(sealedPath)
	if err != nil {
		j.State, j.LastErr = "bounced", "the queued message is gone"
		o.save(*j)
		return
	}
	raw, err := seal.Open(bytes.NewReader(sealed), o.priv, int(o.cfg.MaxSize))
	if err != nil {
		j.State, j.LastErr = "bounced", "the queued message does not open"
		o.save(*j)
		return
	}
	j.Tries++
	byDomain := map[string][]string{}
	for _, r := range j.Pending {
		d := r[strings.LastIndexByte(r, '@')+1:]
		byDomain[d] = append(byDomain[d], r)
	}
	var still []string
	if j.Failed == nil {
		j.Failed = map[string]string{}
	}
	for d, rcpts := range byDomain {
		ok, perm, err := o.deliver(ctx, d, j.From, rcpts, raw)
		switch {
		case ok:
			o.lg.Info("delivered", "box", j.Box, "domain", d, "rcpts", len(rcpts), "try", j.Tries)
		case perm:
			for _, r := range rcpts {
				j.Failed[r] = err.Error()
			}
			o.lg.Info("refused by receiver", "box", j.Box, "domain", d, "err", err.Error())
		default:
			still = append(still, rcpts...)
			j.LastErr = clipErr(err)
			o.lg.Info("delivery deferred", "box", j.Box, "domain", d, "try", j.Tries, "err", j.LastErr)
		}
	}
	j.Pending = still
	if len(still) > 0 && time.Now().Before(time.Unix(j.Accepted, 0).Add(outGiveUp)) {
		j.Next = time.Now().Add(backoff(j.Tries)).Unix()
		o.save(*j)
		return
	}
	for _, r := range still {
		j.Failed[r] = "no delivery within a day: " + j.LastErr
	}
	j.Pending = nil
	os.Remove(sealedPath)
	if len(j.Failed) == 0 {
		j.State = "sent"
		o.save(*j)
		return
	}
	j.State = "bounced"
	o.save(*j)
	o.bounce(j)
}

func backoff(tries int) time.Duration {
	steps := []time.Duration{time.Minute, 5 * time.Minute, 15 * time.Minute, time.Hour, 2 * time.Hour, 4 * time.Hour}
	if tries-1 < len(steps) {
		return steps[tries-1]
	}
	return 4 * time.Hour
}

func clipErr(err error) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}

// deliver tries the domain's MX hosts in order. Returns delivered, permanent failure, error.
func (o *outbound) deliver(ctx context.Context, domain, from string, rcpts []string, raw []byte) (bool, bool, error) {
	hosts, err := mxHosts(ctx, domain)
	if err != nil {
		return false, false, err
	}
	if len(hosts) == 0 {
		return false, true, fmt.Errorf("%s has no mail server", domain)
	}
	var last error
	for _, h := range hosts {
		ok, perm, err := o.deliverTo(h, from, rcpts, raw)
		if ok {
			return true, false, nil
		}
		if perm {
			return false, true, err
		}
		last = err
	}
	return false, false, last
}

func mxHosts(ctx context.Context, domain string) ([]string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	mxs, err := net.DefaultResolver.LookupMX(c, domain)
	if err != nil {
		var de *net.DNSError
		if errors.As(err, &de) && de.IsNotFound {
			// no MX: the A record is the mail host (RFC 5321 section 5.1)
			if ips, e2 := net.DefaultResolver.LookupIP(c, "ip", domain); e2 == nil && len(ips) > 0 {
				return []string{domain}, nil
			}
			return nil, nil
		}
		return nil, err
	}
	sort.Slice(mxs, func(i, j int) bool { return mxs[i].Pref < mxs[j].Pref })
	var hosts []string
	for _, m := range mxs {
		h := strings.TrimSuffix(m.Host, ".")
		if h == "" || h == "." {
			continue // a null MX: the domain takes no mail
		}
		hosts = append(hosts, h)
	}
	if len(mxs) == 1 && (mxs[0].Host == "." || mxs[0].Host == "") {
		return nil, nil
	}
	return hosts, nil
}

// deliverTo is one SMTP session to one host: EHLO, STARTTLS (verified; unverified on a failed
// verification, so the hop is always encrypted and authenticated when it can be), MAIL, RCPT,
// DATA. A host that offers no STARTTLS is skipped: nothing of a box's leaves in the clear.
func (o *outbound) deliverTo(host, from string, rcpts []string, raw []byte) (bool, bool, error) {
	ok, perm, err := o.session(host, from, rcpts, raw, true)
	if err != nil && errors.Is(err, errTLSVerify) {
		return o.session(host, from, rcpts, raw, false)
	}
	return ok, perm, err
}

var errTLSVerify = errors.New("tls verification failed")

func (o *outbound) session(host, from string, rcpts []string, raw []byte, verify bool) (bool, bool, error) {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, "25"), 20*time.Second)
	if err != nil {
		return false, false, err
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Minute))
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return false, false, err
	}
	defer c.Close()
	if err := c.Hello(o.cfg.Hostname); err != nil {
		return false, isPerm(err), err
	}
	if ok, _ := c.Extension("STARTTLS"); !ok {
		return false, false, fmt.Errorf("%s offers no STARTTLS", host)
	}
	tc := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12, InsecureSkipVerify: !verify}
	if err := c.StartTLS(tc); err != nil {
		if verify {
			return false, false, fmt.Errorf("%w: %v", errTLSVerify, err)
		}
		return false, false, err
	}
	if err := c.Mail(from); err != nil {
		return false, isPerm(err), err
	}
	accepted := 0
	var lastErr error
	for _, r := range rcpts {
		if err := c.Rcpt(r); err != nil {
			lastErr = err
			if isPerm(err) {
				return false, true, err
			}
			continue
		}
		accepted++
	}
	if accepted == 0 {
		return false, false, lastErr
	}
	w, err := c.Data()
	if err != nil {
		return false, isPerm(err), err
	}
	if _, err := w.Write(raw); err != nil {
		return false, false, err
	}
	if err := w.Close(); err != nil {
		return false, isPerm(err), err
	}
	c.Quit()
	return true, false, nil
}

func isPerm(err error) bool {
	var te *textproto.Error
	if errors.As(err, &te) {
		return te.Code >= 500 && te.Code < 600
	}
	return false
}

// bounce writes a delivery report into the box's inbound queue as a message from the relay
// itself, so the box learns of it the way it learns of any mail.
func (o *outbound) bounce(j *job) {
	o.boxes.mu.RLock()
	bx := o.boxes.byID[j.Box]
	o.boxes.mu.RUnlock()
	if bx == nil {
		return
	}
	in, err := o.q.openInbound(bx)
	if err != nil {
		o.lg.Error("bounce not written", "box", j.Box, "err", err)
		return
	}
	now := time.Now()
	var b strings.Builder
	fmt.Fprintf(&b, "From: Mail Delivery <mailer-daemon@%s>\r\n", o.cfg.Hostname)
	fmt.Fprintf(&b, "To: <%s>\r\n", j.From)
	fmt.Fprintf(&b, "Subject: not delivered\r\n")
	fmt.Fprintf(&b, "Date: %s\r\n", now.UTC().Format(time.RFC1123Z))
	fmt.Fprintf(&b, "Message-ID: <%s@%s>\r\n", strings.TrimSuffix(j.Name, ".seal"), o.cfg.Hostname)
	fmt.Fprintf(&b, "Auto-Submitted: auto-replied\r\n")
	fmt.Fprintf(&b, "Content-Type: text/plain; charset=utf-8\r\n\r\n")
	fmt.Fprintf(&b, "Your message sent %s was not delivered to:\r\n\r\n", time.Unix(j.Accepted, 0).UTC().Format("2 Jan 2006 15:04 MST"))
	var rs []string
	for r := range j.Failed {
		rs = append(rs, r)
	}
	sort.Strings(rs)
	for _, r := range rs {
		fmt.Fprintf(&b, "  %s\r\n    %s\r\n", r, j.Failed[r])
	}
	fmt.Fprintf(&b, "\r\nThe relay tried for a day. The message itself is not attached; the box keeps its sent copy.\r\n")
	if _, err := in.Write([]byte(b.String())); err != nil {
		in.abort()
		return
	}
	note := wire.Note{Helo: o.cfg.Hostname, MailFrom: "", RcptTo: []string{j.From}, TLS: "relay", Received: now.Unix(), PTRState: "relay", Relay: o.cfg.Hostname}
	if err := in.finish(note); err != nil {
		o.lg.Error("bounce not finished", "box", j.Box, "err", err)
	}
}

// allowance is the per-box sending budget: a day's and an hour's worth of recipients.
type allowance struct {
	mu   sync.Mutex
	day  int
	hour int
	sent map[string][]time.Time
}

func newAllowance(day, hour int) *allowance {
	return &allowance{day: day, hour: hour, sent: map[string][]time.Time{}}
}

func (a *allowance) take(boxID string, day, hour, n int) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if day <= 0 {
		day = a.day
	}
	if hour <= 0 {
		hour = a.hour
	}
	now := time.Now()
	var kept []time.Time
	inHour := 0
	for _, t := range a.sent[boxID] {
		if now.Sub(t) < 24*time.Hour {
			kept = append(kept, t)
			if now.Sub(t) < time.Hour {
				inHour++
			}
		}
	}
	if len(kept)+n > day || inHour+n > hour {
		a.sent[boxID] = kept
		return false
	}
	for i := 0; i < n; i++ {
		kept = append(kept, now)
	}
	a.sent[boxID] = kept
	return true
}
