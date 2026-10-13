#!/bin/sh
# Installs or updates ghost.maild on the relay machine. Run as root from a checkout of the web
# repository with Go, or copy a built binary in and give its path. Idempotent.
#   sudo ./deploy/mail/scripts/install.sh [path/to/ghost.maild]
set -e
BIN="${1:-}"
if [ -z "$BIN" ]; then
  echo "building ghost.maild"
  ( cd "$(dirname "$0")/.." && GOTOOLCHAIN=local GOFLAGS=-trimpath go build -o /tmp/ghost.maild ./cmd/ghost.maild )
  BIN=/tmp/ghost.maild
fi
id ghost-mail >/dev/null 2>&1 || useradd --system --home /var/lib/ghost-mail --shell /usr/sbin/nologin ghost-mail
install -d -o ghost-mail -g ghost-mail -m 0750 /var/lib/ghost-mail
install -d -o root -g ghost-mail -m 0750 /etc/ghost-mail
install -d -o ghost-mail -g ghost-mail -m 0750 /etc/ghost-mail/tls
[ -f /etc/ghost-mail/maild.conf ] || install -o root -g ghost-mail -m 0640 "$(dirname "$0")/../etc/maild.conf.example" /etc/ghost-mail/maild.conf
[ -f /etc/ghost-mail/boxes.conf ] || install -o root -g ghost-mail -m 0640 "$(dirname "$0")/../etc/boxes.conf.example" /etc/ghost-mail/boxes.conf
install -o root -g root -m 0755 "$BIN" /usr/local/bin/ghost.maild
if [ ! -f /etc/ghost-mail/relay.key ]; then
  /usr/local/bin/ghost.maild -keygen > /etc/ghost-mail/relay.key.new
  install -o root -g ghost-mail -m 0640 /etc/ghost-mail/relay.key.new /etc/ghost-mail/relay.key
  rm -f /etc/ghost-mail/relay.key.new
  echo "relay key made at /etc/ghost-mail/relay.key"
fi
install -m 0644 "$(dirname "$0")/../systemd/ghost.maild.service" /etc/systemd/system/ghost.maild.service
if [ -d /etc/letsencrypt/renewal-hooks/deploy ]; then
  install -m 0755 "$(dirname "$0")/certbot-hook.sh" /etc/letsencrypt/renewal-hooks/deploy/ghost-maild.sh
  RENEWED_DOMAINS="$(sed -n 's/^hostname=//p' /etc/ghost-mail/maild.conf)" /etc/letsencrypt/renewal-hooks/deploy/ghost-maild.sh || true
fi
systemctl daemon-reload
systemctl enable ghost.maild >/dev/null
systemctl restart ghost.maild
sleep 1
systemctl --no-pager --lines=5 status ghost.maild || true
echo "relay public key (the boxes pin it; also at GET /box/<id>/key):"
/usr/local/bin/ghost.maild -pubkey /etc/ghost-mail/relay.key
