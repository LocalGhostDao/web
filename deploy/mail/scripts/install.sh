#!/bin/sh
# Installs or updates ghost.maild as the deploy user (coder): no sudo anywhere in here. The
# binary, the configuration, the TLS copies, the relay key and the queue live under ~/ghost-mail;
# the service is a systemd user unit, so it runs without a login and comes back on reboot
# (lingering; scripts/root-once.sh turns it on). Root is needed once, for port 25 and the
# certificate files: that is root-once.sh, run with sudo one time. Idempotent.
#   ./deploy/mail/scripts/install.sh              build here, then install
#   ./deploy/mail/scripts/install.sh <binary>     install a binary built elsewhere
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${GHOST_MAIL_HOME:-$HOME/ghost-mail}"
BIN="${1:-}"

if [ -z "$BIN" ]; then
  echo "building ghost.maild"
  mkdir -p "$ROOT/bin"
  ( cd "$HERE/.." && GOTOOLCHAIN=local GOFLAGS=-trimpath go build -buildvcs=false -o "$ROOT/bin/ghost.maild.new" ./cmd/ghost.maild )
  BIN="$ROOT/bin/ghost.maild.new"
fi
mkdir -p "$ROOT/bin" "$ROOT/etc" "$ROOT/tls" "$ROOT/data"
chmod 0750 "$ROOT" "$ROOT/etc" "$ROOT/tls" "$ROOT/data"
if [ ! -f "$ROOT/etc/maild.conf" ]; then
  sed -e "s|^cert=.*|cert=$ROOT/tls/fullchain.pem|" -e "s|^key=.*|key=$ROOT/tls/privkey.pem|" \
      -e "s|^data=.*|data=$ROOT/data|" -e "s|^boxes=.*|boxes=$ROOT/etc/boxes.conf|" \
      -e "s|^relaykey=.*|relaykey=$ROOT/etc/relay.key|" "$HERE/../etc/maild.conf.example" > "$ROOT/etc/maild.conf"
  chmod 0640 "$ROOT/etc/maild.conf"
  echo "wrote $ROOT/etc/maild.conf (hostname, ports and limits are the example's; edit if they differ)"
fi
[ -f "$ROOT/etc/boxes.conf" ] || { install -m 0640 "$HERE/../etc/boxes.conf.example" "$ROOT/etc/boxes.conf"; }
mv -f "$BIN" "$ROOT/bin/ghost.maild"
chmod 0755 "$ROOT/bin/ghost.maild"
if [ ! -f "$ROOT/etc/relay.key" ]; then
  "$ROOT/bin/ghost.maild" -keygen > "$ROOT/etc/relay.key.new"
  chmod 0600 "$ROOT/etc/relay.key.new"
  mv "$ROOT/etc/relay.key.new" "$ROOT/etc/relay.key"
  echo "relay key made at $ROOT/etc/relay.key"
fi
# a small wrapper so `ghost-maild -dns …` and friends find the conf
cat > "$ROOT/bin/ghost-maild" <<WRAP
#!/bin/sh
exec "$ROOT/bin/ghost.maild" -conf "$ROOT/etc/maild.conf" "\$@"
WRAP
chmod 0755 "$ROOT/bin/ghost-maild"
# the user unit
mkdir -p "$HOME/.config/systemd/user"
sed -e "s|@ROOT@|$ROOT|g" "$HERE/../systemd/ghost.maild.service" > "$HOME/.config/systemd/user/ghost.maild.service"
systemctl --user daemon-reload
systemctl --user enable ghost.maild >/dev/null
systemctl --user restart ghost.maild
sleep 1
systemctl --user --no-pager --lines=5 status ghost.maild || true
if [ ! -f "$ROOT/tls/fullchain.pem" ]; then
  echo
  echo "no certificate at $ROOT/tls yet: the service restarts until root-once.sh has run and certbot has issued it (README, step 3)"
fi
echo "relay public key (the boxes fetch it themselves; also at GET /box/<id>/key):"
"$ROOT/bin/ghost.maild" -pubkey "$ROOT/etc/relay.key"
