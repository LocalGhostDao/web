#!/bin/sh
# Installs or updates ghost.maild as the deploy user (coder). The binary and the configuration
# are the deploy user's under ~/ghost-mail; the daemon runs as the system user ghost-mail (a
# system unit, scripts/root-once.sh) and writes only under /var/lib/ghost-mail. The one sudo in
# here is the restart, which root-once.sh allowed without a password. Idempotent.
#   ./deploy/mail/scripts/install.sh              build here, then install
#   ./deploy/mail/scripts/install.sh <binary>     install a binary built elsewhere
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${GHOST_MAIL_HOME:-$HOME/ghost-mail}"
STATE=/var/lib/ghost-mail
BIN="${1:-}"

id ghost-mail >/dev/null 2>&1 || { echo "no user ghost-mail yet: run  sudo ./deploy/mail/scripts/root-once.sh $(id -un)  first"; exit 1; }
if [ -z "$BIN" ]; then
  echo "building ghost.maild"
  mkdir -p "$ROOT/bin"
  ( cd "$HERE/.." && GOTOOLCHAIN=local GOFLAGS=-trimpath go build -buildvcs=false -o "$ROOT/bin/ghost.maild.new" ./cmd/ghost.maild )
  BIN="$ROOT/bin/ghost.maild.new"
fi
mkdir -p "$ROOT/bin" "$ROOT/etc"
if [ ! -f "$ROOT/etc/maild.conf" ]; then
  sed -e "s|^cert=.*|cert=$STATE/tls/fullchain.pem|" -e "s|^key=.*|key=$STATE/tls/privkey.pem|" \
      -e "s|^data=.*|data=$STATE/data|" -e "s|^boxes=.*|boxes=$ROOT/etc/boxes.conf|" \
      -e "s|^relaykey=.*|relaykey=$STATE/relay.key|" "$HERE/../etc/maild.conf.example" > "$ROOT/etc/maild.conf"
  echo "wrote $ROOT/etc/maild.conf (hostname, ports and limits are the example's; edit if they differ)"
else
  # an install from before the daemon had its own user points at ~/ghost-mail for what it writes
  if grep -q "^data=$ROOT/data\|^relaykey=$ROOT/etc/relay.key\|^cert=$ROOT/tls" "$ROOT/etc/maild.conf"; then
    sed -i -e "s|^cert=.*|cert=$STATE/tls/fullchain.pem|" -e "s|^key=.*|key=$STATE/tls/privkey.pem|" \
        -e "s|^data=.*|data=$STATE/data|" -e "s|^relaykey=.*|relaykey=$STATE/relay.key|" "$ROOT/etc/maild.conf"
    echo "maild.conf: the queue, the key and the certificate paths now point under $STATE"
  fi
fi
[ -f "$ROOT/etc/boxes.conf" ] || cp "$HERE/../etc/boxes.conf.example" "$ROOT/etc/boxes.conf"
mv -f "$BIN" "$ROOT/bin/ghost.maild"
# readable to the daemon's user, writable to nobody else: the directories carry the group
# (set-group-id, root-once.sh), the modes are set here for files made before that
chmod 0755 "$ROOT/bin/ghost.maild"
chmod 0640 "$ROOT/etc/maild.conf" "$ROOT/etc/boxes.conf"
chgrp ghost-mail "$ROOT/etc/maild.conf" "$ROOT/etc/boxes.conf" "$ROOT/bin/ghost.maild" 2>/dev/null || true
# a small wrapper so `ghost-maild -dns …` and friends find the conf
cat > "$ROOT/bin/ghost-maild" <<WRAP
#!/bin/sh
exec "$ROOT/bin/ghost.maild" -conf "$ROOT/etc/maild.conf" "\$@"
WRAP
chmod 0755 "$ROOT/bin/ghost-maild"
sudo /usr/bin/systemctl restart ghost.maild
sleep 1
systemctl --no-pager --lines=5 status ghost.maild || true   # no sudo: status is anyone's; the lines need the systemd-journal group (root-once.sh)
# the state directory is ghost-mail's and not readable to the deploy user; ask the daemon, not the file
if journalctl -u ghost.maild -n 30 --no-pager -q 2>/dev/null | grep -q "no certificate\|certificate missing\|tls: no"; then
  echo
  echo "the journal says the relay has no certificate yet: certbot issues it, the deploy hook copies it into $STATE/tls (README, step 3);"
  echo "to copy an existing one by hand, as root: RENEWED_DOMAINS=mx.localghost.ai /etc/letsencrypt/renewal-hooks/deploy/ghost-maild.sh"
fi
echo "the relay's key is ghost-mail's own ($STATE/relay.key, made at the first start); the boxes fetch its public half at GET /box/<id>/key"
