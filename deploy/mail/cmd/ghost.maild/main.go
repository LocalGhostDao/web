// ghost.maild is the relay: the one machine on port 25 so that no box has to be. It takes a
// message in over TLS, seals it to the box's key as the bytes arrive, writes a sealed note of what
// only it could know about the connection, and keeps the pair in a queue until the box has fetched
// them over HTTPS. It parses nothing, keeps nothing readable, and holds no key that opens a message
// in its queue. The other way, it delivers what a box signed and sealed to the relay's own key,
// with retries and a bounce back into the box's queue. docs/MAIL.md is the specification.
//
// Configuration: /etc/ghost-mail/maild.conf (key=value lines) and /etc/ghost-mail/boxes.conf (one
// box per line). The daemon runs as its own user with CAP_NET_BIND_SERVICE; nothing else is root.
package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/tls"
	"encoding/hex"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"localghost/maild/internal/seal"
	"localghost/maild/internal/wire"
)

const (
	defaultMaxSize = 25 << 20
	keepFor        = 30 * 24 * time.Hour
	queueCap       = 200 << 20
)

type config struct {
	Hostname string
	SMTP     string
	API      string
	CertFile string
	KeyFile  string
	Data     string
	Boxes    string
	RelayKey string
	Greylist bool
	MaxSize  int64
	// Send allowances per box: a day and an hour.
	SendDay  int
	SendHour int
}

func loadConfig(path string) (config, error) {
	c := config{Hostname: "localhost", SMTP: ":25", API: "127.0.0.1:8025", Data: "/var/lib/ghost-mail",
		Boxes: "/etc/ghost-mail/boxes.conf", RelayKey: "/etc/ghost-mail/relay.key", MaxSize: defaultMaxSize, SendDay: 100, SendHour: 10}
	b, err := os.ReadFile(path)
	if err != nil {
		return c, err
	}
	for _, ln := range strings.Split(string(b), "\n") {
		ln = strings.TrimSpace(ln)
		if ln == "" || strings.HasPrefix(ln, "#") {
			continue
		}
		k, v, ok := strings.Cut(ln, "=")
		if !ok {
			return c, fmt.Errorf("bad line %q", ln)
		}
		k, v = strings.TrimSpace(k), strings.TrimSpace(v)
		switch k {
		case "hostname":
			c.Hostname = v
		case "smtp":
			c.SMTP = v
		case "api":
			c.API = v
		case "cert":
			c.CertFile = v
		case "key":
			c.KeyFile = v
		case "data":
			c.Data = v
		case "boxes":
			c.Boxes = v
		case "relaykey":
			c.RelayKey = v
		case "greylist":
			c.Greylist = v == "on" || v == "true" || v == "yes"
		case "maxsize":
			n, err := strconv.ParseInt(v, 10, 64)
			if err != nil {
				return c, fmt.Errorf("maxsize: %w", err)
			}
			c.MaxSize = n
		case "sendday":
			c.SendDay, _ = strconv.Atoi(v)
		case "sendhour":
			c.SendHour, _ = strconv.Atoi(v)
		default:
			return c, fmt.Errorf("unknown key %q", k)
		}
	}
	if c.CertFile == "" || c.KeyFile == "" {
		return c, fmt.Errorf("cert= and key= are required (TLS is not optional)")
	}
	return c, nil
}

// box is one enrolled box: the domains it owns outright (every address on them is its) and the
// single addresses it has on a shared domain of the relay's; its keys; its allowance.
type box struct {
	ID        string
	Domains   []string
	Addresses []string
	Pub       []byte   // X25519, 32 bytes
	Token     [32]byte // sha256 of the bearer token
	SendDay   int      // 0 = the daemon's default
	DKIMRSA   string   // base64 DER, for `-dns`; the relay itself never uses it
	DKIMEd    string   // base64 raw, likewise
}

// owns says whether an address is the box's: on one of its domains, or one of its addresses.
func (b *box) owns(addr string) bool {
	addr = strings.ToLower(addr)
	for _, a := range b.Addresses {
		if a == addr {
			return true
		}
	}
	at := strings.LastIndexByte(addr, '@')
	if at < 0 {
		return false
	}
	d := addr[at+1:]
	for _, x := range b.Domains {
		if x == d {
			return true
		}
	}
	return false
}

type boxes struct {
	mu        sync.RWMutex
	byID      map[string]*box
	byDomain  map[string]*box
	byAddress map[string]*box
	path      string
	mtime     time.Time
}

type boxMaps struct {
	byID, byDomain, byAddress map[string]*box
}

func loadBoxes(path string) (boxMaps, error) {
	var mm boxMaps
	b, err := os.ReadFile(path)
	if err != nil {
		return mm, err
	}
	byID := map[string]*box{}
	byDomain := map[string]*box{}
	byAddress := map[string]*box{}
	for n, ln := range strings.Split(string(b), "\n") {
		ln = strings.TrimSpace(ln)
		if ln == "" || strings.HasPrefix(ln, "#") {
			continue
		}
		bx := &box{}
		for _, f := range strings.Fields(ln) {
			k, v, ok := strings.Cut(f, "=")
			if !ok {
				return mm, fmt.Errorf("line %d: %q", n+1, f)
			}
			switch k {
			case "box":
				if !wire.BoxRe.MatchString(v) {
					return mm, fmt.Errorf("line %d: bad box id", n+1)
				}
				bx.ID = v
			case "domains":
				for _, d := range strings.Split(v, ",") {
					d = strings.ToLower(strings.TrimSpace(d))
					if d != "" {
						bx.Domains = append(bx.Domains, d)
					}
				}
			case "addresses":
				for _, a := range strings.Split(v, ",") {
					a = strings.ToLower(strings.TrimSpace(a))
					if a == "" {
						continue
					}
					if _, _, ok := parsePath("TO:<"+a+">", "TO:"); !ok {
						return mm, fmt.Errorf("line %d: bad address %q", n+1, a)
					}
					bx.Addresses = append(bx.Addresses, a)
				}
			case "dkim_rsa":
				bx.DKIMRSA = v
			case "dkim_ed":
				bx.DKIMEd = v
			case "pub":
				k, err := seal.ParseKey(v)
				if err != nil {
					return mm, fmt.Errorf("line %d: pub: %w", n+1, err)
				}
				bx.Pub = k
			case "token":
				t, err := hex.DecodeString(v)
				if err != nil || len(t) != 32 {
					return mm, fmt.Errorf("line %d: token must be the sha256 of the bearer, 64 hex chars", n+1)
				}
				copy(bx.Token[:], t)
			case "sendday":
				bx.SendDay, _ = strconv.Atoi(v)
			default:
				return mm, fmt.Errorf("line %d: unknown key %q", n+1, k)
			}
		}
		if bx.ID == "" || (len(bx.Domains) == 0 && len(bx.Addresses) == 0) || bx.Pub == nil || bx.Token == [32]byte{} {
			return mm, fmt.Errorf("line %d: box=, domains= or addresses=, pub= and token= are all required", n+1)
		}
		if _, dup := byID[bx.ID]; dup {
			return mm, fmt.Errorf("line %d: box %s twice", n+1, bx.ID)
		}
		byID[bx.ID] = bx
		for _, d := range bx.Domains {
			if _, dup := byDomain[d]; dup {
				return mm, fmt.Errorf("line %d: domain %s twice", n+1, d)
			}
			byDomain[d] = bx
		}
		for _, a := range bx.Addresses {
			if _, dup := byAddress[a]; dup {
				return mm, fmt.Errorf("line %d: address %s twice", n+1, a)
			}
			byAddress[a] = bx
		}
	}
	return boxMaps{byID, byDomain, byAddress}, nil
}

func (bs *boxes) reload(lg *slog.Logger) {
	st, err := os.Stat(bs.path)
	if err != nil {
		return
	}
	bs.mu.RLock()
	same := st.ModTime().Equal(bs.mtime)
	bs.mu.RUnlock()
	if same {
		return
	}
	mm, err := loadBoxes(bs.path)
	if err != nil {
		lg.Error("boxes.conf not reloaded", "err", err)
		return
	}
	bs.mu.Lock()
	bs.byID, bs.byDomain, bs.byAddress, bs.mtime = mm.byID, mm.byDomain, mm.byAddress, st.ModTime()
	bs.mu.Unlock()
	lg.Info("boxes loaded", "boxes", len(mm.byID), "domains", len(mm.byDomain), "addresses", len(mm.byAddress))
}

// forRcpt is the box an address belongs to: the exact address first (a shared domain), then
// the domain (one the box owns).
func (bs *boxes) forRcpt(addr string) *box {
	addr = strings.ToLower(addr)
	bs.mu.RLock()
	defer bs.mu.RUnlock()
	if bx := bs.byAddress[addr]; bx != nil {
		return bx
	}
	if at := strings.LastIndexByte(addr, '@'); at >= 0 {
		return bs.byDomain[addr[at+1:]]
	}
	return nil
}

func (bs *boxes) byToken(id, bearer string) *box {
	bs.mu.RLock()
	defer bs.mu.RUnlock()
	bx := bs.byID[id]
	if bx == nil {
		return nil
	}
	h := sha256.Sum256([]byte(bearer))
	if subtle.ConstantTimeCompare(h[:], bx.Token[:]) != 1 {
		return nil
	}
	return bx
}

// certs reloads the certificate files when they change (certbot renews under us).
type certs struct {
	mu    sync.Mutex
	cert  *tls.Certificate
	at    time.Time
	cFile string
	kFile string
}

func (c *certs) get(*tls.ClientHelloInfo) (*tls.Certificate, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cert != nil && time.Since(c.at) < 10*time.Minute {
		return c.cert, nil
	}
	crt, err := tls.LoadX509KeyPair(c.cFile, c.kFile)
	if err != nil {
		if c.cert != nil {
			return c.cert, nil
		}
		return nil, err
	}
	c.cert, c.at = &crt, time.Now()
	return c.cert, nil
}

func main() {
	confPath := flag.String("conf", "/etc/ghost-mail/maild.conf", "configuration file")
	keygen := flag.Bool("keygen", false, "print a new relay private key (64 hex) and exit")
	pubkey := flag.String("pubkey", "", "print the public half of the key file given and exit")
	dnsFor := flag.String("dns", "", "print the DKIM TXT records to publish under this shared domain for every box in boxes.conf, and exit")
	flag.Parse()
	lg := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if *dnsFor != "" {
		cfg, err := loadConfig(*confPath)
		if err != nil {
			lg.Error("configuration", "err", err)
			os.Exit(1)
		}
		if err := printDNS(cfg, *dnsFor); err != nil {
			lg.Error("dns", "err", err)
			os.Exit(1)
		}
		return
	}
	if *keygen {
		priv, _, err := seal.GenerateKey()
		if err != nil {
			lg.Error("keygen", "err", err)
			os.Exit(1)
		}
		fmt.Println(hex.EncodeToString(priv))
		return
	}
	if *pubkey != "" {
		priv, err := seal.ReadKeyFile(*pubkey)
		if err != nil {
			lg.Error("key file", "err", err)
			os.Exit(1)
		}
		pub, _ := seal.PublicOf(priv)
		fmt.Println(hex.EncodeToString(pub))
		return
	}
	cfg, err := loadConfig(*confPath)
	if err != nil {
		lg.Error("configuration", "err", err)
		os.Exit(1)
	}
	if err := os.MkdirAll(cfg.Data, 0o750); err != nil {
		lg.Error("data dir", "err", err)
		os.Exit(1)
	}
	bs := &boxes{path: cfg.Boxes, byID: map[string]*box{}, byDomain: map[string]*box{}, byAddress: map[string]*box{}}
	bs.reload(lg)
	cs := &certs{cFile: cfg.CertFile, kFile: cfg.KeyFile}
	if _, err := cs.get(nil); err != nil {
		// no certificate yet (a fresh install before certbot has run): listen anyway; STARTTLS
		// fails until the files appear and senders retry on their own, and the files are read
		// again within ten minutes of landing
		lg.Warn("no certificate yet: STARTTLS will fail until the files appear", "cert", cfg.CertFile, "err", err)
	}
	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: cs.get}
	var relayPriv []byte
	if k, err := seal.ReadKeyFile(cfg.RelayKey); err == nil {
		relayPriv = k
	} else {
		lg.Warn("no relay key: outbound is off", "path", cfg.RelayKey, "err", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	q := &queue{root: cfg.Data, lg: lg}
	srv := &smtpServer{cfg: cfg, boxes: bs, tls: tlsCfg, q: q, lg: lg, limits: newLimits(), grey: newGreylist(cfg.Greylist)}
	ln, err := net.Listen("tcp", cfg.SMTP)
	if err != nil {
		lg.Error("listen smtp", "addr", cfg.SMTP, "err", err)
		os.Exit(1)
	}
	go srv.serve(ctx, ln)
	lg.Info("smtp up", "addr", cfg.SMTP, "hostname", cfg.Hostname, "tls", "required")

	var out *outbound
	if relayPriv != nil {
		out = &outbound{cfg: cfg, boxes: bs, q: q, priv: relayPriv, lg: lg, allow: newAllowance(cfg.SendDay, cfg.SendHour)}
		go out.run(ctx)
	}
	api := &apiServer{cfg: cfg, boxes: bs, q: q, out: out, lg: lg, relayPriv: relayPriv}
	hs := &http.Server{Addr: cfg.API, Handler: api.handler(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 2 * time.Minute, WriteTimeout: 2 * time.Minute}
	go func() {
		if err := hs.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			lg.Error("api stopped", "err", err)
		}
	}()
	lg.Info("api up", "addr", cfg.API)

	t := time.NewTicker(time.Minute)
	defer t.Stop()
	sweepAt := time.Now()
	for {
		select {
		case <-ctx.Done():
			lg.Info("shutting down")
			ln.Close()
			c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = hs.Shutdown(c)
			cancel()
			return
		case <-t.C:
			bs.reload(lg)
			srv.limits.sweep()
			srv.grey.sweep()
			if time.Since(sweepAt) > time.Hour {
				sweepAt = time.Now()
				q.sweep(keepFor)
			}
		}
	}
}

// printDNS writes the zone lines LocalGhost publishes for the boxes on a shared domain: the
// domain's own MX, SPF and DMARC once, then each box's two DKIM keys under its selectors
// (<box>-rsa, <box>-ed), which are the selectors the box signs with.
func printDNS(cfg config, shared string) error {
	mm, err := loadBoxes(cfg.Boxes)
	if err != nil {
		return err
	}
	relayDomain := cfg.Hostname
	if i := strings.IndexByte(relayDomain, '.'); i >= 0 {
		relayDomain = relayDomain[i+1:]
	}
	fmt.Printf("%s.  MX  10 %s.\n", shared, cfg.Hostname)
	fmt.Printf("%s.  TXT  \"v=spf1 include:_spf.%s -all\"\n", shared, relayDomain)
	fmt.Printf("_dmarc.%s.  TXT  \"v=DMARC1; p=reject; adkim=s; aspf=r\"\n", shared)
	ids := make([]string, 0, len(mm.byID))
	for id := range mm.byID {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		bx := mm.byID[id]
		onShared := false
		for _, a := range bx.Addresses {
			if strings.HasSuffix(a, "@"+shared) {
				onShared = true
			}
		}
		if !onShared {
			continue
		}
		if bx.DKIMRSA != "" {
			fmt.Printf("%s-rsa._domainkey.%s.  TXT  %s\n", id, shared, splitTXT("v=DKIM1; k=rsa; p="+bx.DKIMRSA))
		}
		if bx.DKIMEd != "" {
			fmt.Printf("%s-ed._domainkey.%s.  TXT  %s\n", id, shared, splitTXT("v=DKIM1; k=ed25519; p="+bx.DKIMEd))
		}
	}
	return nil
}

func splitTXT(p string) string {
	var parts []string
	for len(p) > 250 {
		parts = append(parts, `"`+p[:250]+`"`)
		p = p[250:]
	}
	parts = append(parts, `"`+p+`"`)
	return strings.Join(parts, " ")
}

// pathOf is a queue path for a box and a validated name.
func pathOf(root, boxID, dir, name string) string {
	return filepath.Join(root, boxID, dir, name)
}
