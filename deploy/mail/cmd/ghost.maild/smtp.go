package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"localghost/maild/internal/wire"
)

const (
	maxConns      = 40
	maxConnsPerIP = 5 // per /24 or /64, not per address: one host does not get a slot per alias
	maxRcpts      = 10
	cmdTimeout    = 60 * time.Second
	dataTimeout   = 10 * time.Minute
	maxLine       = 2000
	maxErrors     = 5
	perMinute     = 4
	// A session lives at most sessionMax and answers at most maxNoops NOOPs: a slot cannot be held
	// for ever at one keep-alive a minute (the audit's slot-starvation lead).
	sessionMax = 10 * time.Minute
	maxNoops   = 20
)

// smtpServer is the receiving side: the commands a receiver needs and nothing else. No AUTH, no
// relaying, no message without TLS.
type smtpServer struct {
	cfg    config
	boxes  *boxes
	tls    *tls.Config
	q      *queue
	lg     *slog.Logger
	limits *limits
	grey   *greylist
	active atomic.Int32
}

func (s *smtpServer) serve(ctx context.Context, ln net.Listener) {
	for {
		conn, err := ln.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			time.Sleep(100 * time.Millisecond)
			continue
		}
		go s.handle(ctx, conn)
	}
}

type rcpt struct {
	addr string
	box  *box
}

type session struct {
	s        *smtpServer
	conn     net.Conn
	r        *bufio.Reader
	ip       net.IP
	port     int
	helo     string
	tlsOn    bool
	tlsLine  string
	mailFrom string
	mailSet  bool
	rcpts    []rcpt
	errors   int
	noops    int
	started  time.Time
	ptr      chan ptrResult
}

type ptrResult struct {
	name  string
	state string
}

func (s *smtpServer) handle(ctx context.Context, conn net.Conn) {
	defer conn.Close()
	host, port, _ := net.SplitHostPort(conn.RemoteAddr().String())
	ip := net.ParseIP(host)
	p, _ := strconv.Atoi(port)
	if s.active.Add(1) > maxConns {
		s.active.Add(-1)
		fmt.Fprintf(conn, "421 4.3.2 %s too busy, try later\r\n", s.cfg.Hostname)
		return
	}
	defer s.active.Add(-1)
	if !s.limits.connect(ip) {
		fmt.Fprintf(conn, "421 4.7.0 %s too many connections from your address\r\n", s.cfg.Hostname)
		return
	}
	defer s.limits.disconnect(ip)
	ses := &session{s: s, conn: conn, r: bufio.NewReaderSize(conn, 4096), ip: ip, port: p, ptr: make(chan ptrResult, 1), started: time.Now()}
	go ses.lookupPTR()
	ses.run(ctx)
}

func (ses *session) reply(code int, text string) error {
	ses.conn.SetWriteDeadline(time.Now().Add(cmdTimeout))
	_, err := fmt.Fprintf(ses.conn, "%d %s\r\n", code, text)
	return err
}

// deadline is the next command's: a minute, or what is left of the session's ten.
func (ses *session) deadline() time.Time {
	d := time.Now().Add(cmdTimeout)
	if !ses.started.IsZero() {
		if end := ses.started.Add(sessionMax); end.Before(d) {
			return end
		}
	}
	return d
}

func (ses *session) readLine() (string, error) {
	ses.conn.SetReadDeadline(ses.deadline())
	var line []byte
	for {
		part, err := ses.r.ReadSlice('\n')
		line = append(line, part...)
		if err == nil {
			break
		}
		if errors.Is(err, bufio.ErrBufferFull) {
			if len(line) > maxLine {
				// drain the rest of the line, then say so
				for errors.Is(err, bufio.ErrBufferFull) {
					_, err = ses.r.ReadSlice('\n')
				}
				return "", errLineTooLong
			}
			continue
		}
		return "", err
	}
	return strings.TrimRight(string(line), "\r\n"), nil
}

var errLineTooLong = errors.New("line too long")

func (ses *session) run(ctx context.Context) {
	s := ses.s
	if err := ses.reply(220, s.cfg.Hostname+" ESMTP ghost.maild"); err != nil {
		return
	}
	for {
		if ctx.Err() != nil {
			ses.reply(421, "4.3.0 "+s.cfg.Hostname+" closing")
			return
		}
		if time.Since(ses.started) > sessionMax {
			ses.reply(421, "4.4.2 "+s.cfg.Hostname+" session too long, reconnect")
			return
		}
		line, err := ses.readLine()
		if err != nil {
			if err == errLineTooLong {
				if ses.syntax("5.5.2 line too long") {
					return
				}
				continue
			}
			return
		}
		verb, arg := line, ""
		if i := strings.IndexByte(line, ' '); i >= 0 {
			verb, arg = line[:i], strings.TrimSpace(line[i+1:])
		}
		verb = strings.ToUpper(verb)
		switch verb {
		case "EHLO", "HELO":
			if arg == "" {
				if ses.syntax("5.5.4 " + verb + " needs a name") {
					return
				}
				continue
			}
			ses.helo = arg
			ses.resetEnvelope()
			if verb == "HELO" {
				ses.reply(250, s.cfg.Hostname)
				continue
			}
			ext := []string{s.cfg.Hostname, "SIZE " + strconv.FormatInt(s.cfg.MaxSize, 10), "8BITMIME", "PIPELINING", "ENHANCEDSTATUSCODES"}
			if !ses.tlsOn {
				ext = append(ext[:1], append([]string{"STARTTLS"}, ext[1:]...)...)
			}
			ses.conn.SetWriteDeadline(time.Now().Add(cmdTimeout))
			for i, e := range ext {
				sep := "-"
				if i == len(ext)-1 {
					sep = " "
				}
				if _, err := fmt.Fprintf(ses.conn, "250%s%s\r\n", sep, e); err != nil {
					return
				}
			}
		case "STARTTLS":
			if ses.tlsOn {
				if ses.syntax("5.5.1 already in TLS") {
					return
				}
				continue
			}
			if err := ses.reply(220, "2.0.0 ready to start TLS"); err != nil {
				return
			}
			tc := tls.Server(ses.conn, s.tls)
			tc.SetDeadline(time.Now().Add(cmdTimeout))
			if err := tc.Handshake(); err != nil {
				return
			}
			tc.SetDeadline(time.Time{})
			ses.conn = tc
			ses.r = bufio.NewReaderSize(tc, 4096)
			ses.tlsOn = true
			st := tc.ConnectionState()
			ses.tlsLine = tls.VersionName(st.Version) + " " + tls.CipherSuiteName(st.CipherSuite)
			ses.resetEnvelope()
		case "MAIL":
			if !ses.tlsOn {
				ses.reply(530, "5.7.0 Must issue a STARTTLS command first")
				continue
			}
			if ses.helo == "" {
				ses.reply(503, "5.5.1 say EHLO first")
				continue
			}
			if ses.mailSet {
				ses.reply(503, "5.5.1 nested MAIL command")
				continue
			}
			addr, params, ok := parsePath(arg, "FROM:")
			if !ok {
				if ses.syntax("5.1.7 bad sender address") {
					return
				}
				continue
			}
			if sz := params["SIZE"]; sz != "" {
				if n, err := strconv.ParseInt(sz, 10, 64); err == nil && n > s.cfg.MaxSize {
					ses.reply(552, "5.3.4 message too large")
					continue
				}
			}
			ses.mailFrom, ses.mailSet = addr, true
			ses.reply(250, "2.1.0 ok")
		case "RCPT":
			if !ses.mailSet {
				ses.reply(503, "5.5.1 MAIL first")
				continue
			}
			addr, _, ok := parsePath(arg, "TO:")
			if !ok || addr == "" {
				if ses.syntax("5.1.3 bad recipient address") {
					return
				}
				continue
			}
			bx := s.boxes.forRcpt(addr)
			if bx == nil {
				ses.reply(550, "5.1.1 no such mailbox here")
				continue
			}
			if len(ses.rcpts) >= maxRcpts {
				ses.reply(452, "5.5.3 too many recipients")
				continue
			}
			if s.q.size(bx.ID, "in") > queueCap {
				ses.reply(452, "4.2.2 mailbox full, try later")
				continue
			}
			ses.rcpts = append(ses.rcpts, rcpt{addr: addr, box: bx})
			ses.reply(250, "2.1.5 ok")
		case "DATA":
			if len(ses.rcpts) == 0 {
				ses.reply(503, "5.5.1 RCPT first")
				continue
			}
			if !s.limits.message(ses.ip) {
				ses.reply(421, "4.7.0 too many messages, try later")
				return
			}
			if s.grey.hold(ses.ip, ses.mailFrom, ses.rcpts[0].addr) {
				ses.reply(451, "4.7.1 greylisted, try again in a few minutes")
				ses.resetEnvelope()
				continue
			}
			if err := ses.data(); err != nil {
				return
			}
			ses.resetEnvelope()
		case "RSET":
			ses.resetEnvelope()
			ses.reply(250, "2.0.0 ok")
		case "NOOP":
			if ses.noops++; ses.noops > maxNoops {
				ses.reply(421, "4.7.0 too many idle commands")
				return
			}
			ses.reply(250, "2.0.0 ok")
		case "QUIT":
			ses.reply(221, "2.0.0 bye")
			return
		case "VRFY", "EXPN":
			ses.reply(252, "2.5.2 cannot verify, send and see")
		case "HELP":
			ses.reply(214, "2.0.0 EHLO STARTTLS MAIL RCPT DATA RSET NOOP QUIT")
		case "AUTH":
			ses.reply(503, "5.5.1 no AUTH here, this is a receiver")
		default:
			if ses.syntax("5.5.1 command not recognised") {
				return
			}
		}
	}
}

// syntax answers a 5xx and reports whether the session has had enough of them.
func (ses *session) syntax(text string) bool {
	ses.errors++
	if ses.errors >= maxErrors {
		ses.reply(421, "4.7.0 too many errors")
		return true
	}
	ses.reply(500, text)
	return false
}

func (ses *session) resetEnvelope() {
	ses.mailFrom, ses.mailSet, ses.rcpts = "", false, nil
}

// parsePath takes "FROM:<a@b> SIZE=1" or "TO:<a@b>" and returns the address (lower-cased domain,
// "" for <>), the parameters, and whether it parsed. Non-ASCII is refused: no SMTPUTF8.
func parsePath(arg, prefix string) (string, map[string]string, bool) {
	if len(arg) < len(prefix) || !strings.EqualFold(arg[:len(prefix)], prefix) {
		return "", nil, false
	}
	rest := strings.TrimSpace(arg[len(prefix):])
	var path string
	if strings.HasPrefix(rest, "<") {
		end := strings.IndexByte(rest, '>')
		if end < 0 {
			return "", nil, false
		}
		path, rest = rest[1:end], strings.TrimSpace(rest[end+1:])
	} else {
		if i := strings.IndexByte(rest, ' '); i >= 0 {
			path, rest = rest[:i], strings.TrimSpace(rest[i+1:])
		} else {
			path, rest = rest, ""
		}
	}
	params := map[string]string{}
	for _, f := range strings.Fields(rest) {
		k, v, _ := strings.Cut(f, "=")
		params[strings.ToUpper(k)] = v
	}
	if c := strings.LastIndexByte(path, ':'); c >= 0 && strings.HasPrefix(path, "@") {
		path = path[c+1:] // a source route, ignored as RFC 5321 says
	}
	if path == "" {
		return "", params, true
	}
	if len(path) > 254 {
		return "", nil, false
	}
	for i := 0; i < len(path); i++ {
		if path[i] < 33 || path[i] > 126 {
			return "", nil, false
		}
	}
	at := strings.LastIndexByte(path, '@')
	if at <= 0 || at == len(path)-1 {
		return "", nil, false
	}
	local, domain := path[:at], strings.ToLower(path[at+1:])
	if strings.HasPrefix(domain, "[") || !strings.Contains(domain, ".") || strings.ContainsAny(domain, "<>(),;:\\\"") {
		return "", nil, false
	}
	return local + "@" + domain, params, true
}

// data reads the message and streams it, dot-unstuffed and with the relay's Received line on top,
// into one sealed file per box among the recipients. Returns an error only when the connection
// is gone.
func (ses *session) data() error {
	s := ses.s
	if err := ses.reply(354, "End data with <CR><LF>.<CR><LF>"); err != nil {
		return err
	}
	// one writer per distinct box
	var ins []*inbound
	byBox := map[string]*inbound{}
	rcptsOf := map[string][]string{}
	for _, r := range ses.rcpts {
		rcptsOf[r.box.ID] = append(rcptsOf[r.box.ID], r.addr)
		if _, ok := byBox[r.box.ID]; ok {
			continue
		}
		in, err := s.q.openInbound(r.box)
		if err != nil {
			s.lg.Error("open queue file", "box", r.box.ID, "err", err)
			for _, x := range ins {
				x.abort()
			}
			ses.drain(time.Now().Add(dataTimeout))
			ses.reply(451, "4.3.0 could not store, try later")
			return nil
		}
		byBox[r.box.ID] = in
		ins = append(ins, in)
	}
	abortAll := func() {
		for _, x := range ins {
			x.abort()
		}
	}
	ptr := ptrResult{state: "error"}
	select {
	case ptr = <-ses.ptr:
	case <-time.After(3 * time.Second):
	}
	ses.ptr <- ptr // put it back for a second message on the connection
	now := time.Now()
	ptrName := ptr.name
	if ptrName == "" {
		ptrName = "unknown"
	}
	for boxID, in := range byBox {
		recv := fmt.Sprintf("Received: from %s (%s [%s])\r\n\tby %s with ESMTPS (%s)\r\n\tfor <%s>; %s\r\n",
			cleanHelo(ses.helo), ptrName, ses.ip, s.cfg.Hostname, ses.tlsLine, rcptsOf[boxID][0], now.UTC().Format(time.RFC1123Z))
		if _, err := in.Write([]byte(recv)); err != nil {
			abortAll()
			ses.drain(time.Now().Add(dataTimeout))
			ses.reply(451, "4.3.0 could not store, try later")
			return nil
		}
	}
	deadline := now.Add(dataTimeout)
	var total int64
	tooBig := false
	for {
		if time.Now().After(deadline) {
			abortAll()
			ses.reply(421, "4.4.2 data took too long")
			return errors.New("timeout")
		}
		line, err := ses.readLine()
		if err != nil {
			abortAll()
			if err == errLineTooLong {
				ses.drain(deadline)
				ses.reply(500, "5.6.0 a line longer than 2000 bytes")
				return nil
			}
			return err
		}
		if line == "." {
			break
		}
		if strings.HasPrefix(line, ".") {
			line = line[1:]
		}
		total += int64(len(line)) + 2
		if total > s.cfg.MaxSize {
			tooBig = true
			continue
		}
		for _, in := range ins {
			if _, err := in.Write([]byte(line + "\r\n")); err != nil {
				abortAll()
				ses.drain(deadline)
				ses.reply(451, "4.3.0 could not store, try later")
				return nil
			}
		}
	}
	if tooBig {
		abortAll()
		ses.reply(552, "5.3.4 message too large")
		return nil
	}
	for boxID, in := range byBox {
		note := wire.Note{IP: ses.ip.String(), Port: ses.port, Helo: ses.helo, MailFrom: ses.mailFrom, RcptTo: rcptsOf[boxID],
			TLS: ses.tlsLine, Received: now.Unix(), PTR: ptr.name, PTRState: ptr.state, Relay: s.cfg.Hostname}
		if err := in.finish(note); err != nil {
			s.lg.Error("finish queue file", "box", boxID, "err", err)
			abortAll()
			ses.reply(451, "4.3.0 could not store, try later")
			return nil
		}
		s.lg.Info("received", "box", boxID, "bytes", in.bytes, "tls", ses.tlsLine)
	}
	ses.reply(250, "2.0.0 ok, queued")
	return nil
}

// drain reads the rest of a DATA section after a refusal, so the reply lands where the sender
// expects it.
func (ses *session) drain(deadline time.Time) {
	for time.Now().Before(deadline) {
		line, err := ses.readLine()
		if err != nil && err != errLineTooLong {
			return
		}
		if line == "." {
			return
		}
	}
}

func cleanHelo(h string) string {
	var b strings.Builder
	for i := 0; i < len(h) && i < 253; i++ {
		c := h[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '-' || c == '[' || c == ']' || c == ':' {
			b.WriteByte(c)
		}
	}
	if b.Len() == 0 {
		return "unknown"
	}
	return b.String()
}

// lookupPTR is the one DNS lookup the relay does, on the connecting address, never on content:
// forward-confirmed reverse DNS.
func (ses *session) lookupPTR() {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	res := ptrResult{state: "error"}
	defer func() {
		// data() waits three seconds and then puts its own answer in the channel; a late result
		// must not block this goroutine for the life of the connection
		select {
		case ses.ptr <- res:
		default:
		}
	}()
	names, err := net.DefaultResolver.LookupAddr(ctx, ses.ip.String())
	if err != nil {
		var de *net.DNSError
		if errors.As(err, &de) && de.IsNotFound {
			res.state = "none"
		}
		return
	}
	if len(names) == 0 {
		res.state = "none"
		return
	}
	for _, n := range names {
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip", strings.TrimSuffix(n, "."))
		if err != nil {
			continue
		}
		for _, ip := range ips {
			if ip.Equal(ses.ip) {
				res.name = strings.TrimSuffix(n, ".")
				res.state = "ok"
				return
			}
		}
	}
	res.state = "mismatch"
}

// limits: connections per address, messages per minute per address.
type limits struct {
	mu    sync.Mutex
	conns map[string]int
	msgs  map[string][]time.Time
}

func newLimits() *limits { return &limits{conns: map[string]int{}, msgs: map[string][]time.Time{}} }

// prefixKey is the /24 (IPv4) or /64 (IPv6) an address belongs to: the unit the connection and
// message limits count by, so one host does not get a fresh quota per alias.
func prefixKey(ip net.IP) string {
	if ip == nil {
		return "?"
	}
	if ip4 := ip.To4(); ip4 != nil {
		return ip4.Mask(net4Mask).String()
	}
	return ip.Mask(net6Mask).String()
}

func (l *limits) connect(ip net.IP) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	k := prefixKey(ip)
	if l.conns[k] >= maxConnsPerIP {
		return false
	}
	l.conns[k]++
	return true
}

func (l *limits) disconnect(ip net.IP) {
	l.mu.Lock()
	defer l.mu.Unlock()
	k := prefixKey(ip)
	if l.conns[k] <= 1 {
		delete(l.conns, k)
	} else {
		l.conns[k]--
	}
}

func (l *limits) message(ip net.IP) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	k := prefixKey(ip)
	cut := time.Now().Add(-time.Minute)
	var kept []time.Time
	for _, t := range l.msgs[k] {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= perMinute {
		l.msgs[k] = kept
		return false
	}
	l.msgs[k] = append(kept, time.Now())
	return true
}

func (l *limits) sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	cut := time.Now().Add(-time.Minute)
	for k, ts := range l.msgs {
		if len(ts) == 0 || ts[len(ts)-1].Before(cut) {
			delete(l.msgs, k)
		}
	}
}

// greylist holds a never-seen sender once (451) and takes it on the retry; off by default.
type greylist struct {
	on   bool
	mu   sync.Mutex
	seen map[string]time.Time
}

func newGreylist(on bool) *greylist { return &greylist{on: on, seen: map[string]time.Time{}} }

func (g *greylist) key(ip net.IP, from, to string) string {
	n := ip.String()
	if ip4 := ip.To4(); ip4 != nil {
		n = ip4.Mask(net4Mask).String()
	} else {
		n = ip.Mask(net6Mask).String()
	}
	return n + "|" + strings.ToLower(from) + "|" + strings.ToLower(to)
}

var (
	net4Mask = net.CIDRMask(24, 32)
	net6Mask = net.CIDRMask(64, 128)
)

func (g *greylist) hold(ip net.IP, from, to string) bool {
	if !g.on {
		return false
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	k := g.key(ip, from, to)
	first, ok := g.seen[k]
	if !ok {
		if len(g.seen) > 100000 {
			g.seen = map[string]time.Time{}
		}
		g.seen[k] = time.Now()
		return true
	}
	return time.Since(first) < 2*time.Minute
}

func (g *greylist) sweep() {
	if !g.on {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	cut := time.Now().Add(-36 * time.Hour)
	for k, t := range g.seen {
		if t.Before(cut) {
			delete(g.seen, k)
		}
	}
}
