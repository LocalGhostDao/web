#!/bin/sh
# What only root does, once (and again harmlessly): the relay's own user, its state directory,
# the system unit, the certbot hook, and the deploy user's leave to restart it.
#   sudo ./deploy/mail/scripts/root-once.sh [deploy user, default: the sudo caller; never root]
#
# The daemon runs as ghost-mail, a system user with no shell and no home: it owns the queue, its
# key and the certificate copies under /var/lib/ghost-mail and nothing else. The binary and the
# configuration stay the deploy user's under ~/ghost-mail (built and edited by them, no sudo;
# group-readable to ghost-mail), so an update is still  git pull && ./deploy/mail/scripts/install.sh
# with one sudo in it: the restart, which this script allows without a password.
#
# Before 18 Oct 2026 the relay was a user unit of the deploy user, bound to 25 through a lowered
# unprivileged-port floor. This script moves such an install over: stops the user unit, moves the
# queue and the key, and puts the port floor back.
set -e
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }
U="${1:-${SUDO_USER:-}}"
[ -n "$U" ] && id "$U" >/dev/null 2>&1 || { echo "deploy user? run as  sudo $0 <user>  from that user, or name it"; exit 1; }
[ "$U" != "root" ] || { echo "the deploy user is not root; name it:  sudo $0 coder"; exit 1; }
H="$(getent passwd "$U" | cut -d: -f6)"
ROOT="$H/ghost-mail"
STATE=/var/lib/ghost-mail
HERE="$(cd "$(dirname "$0")" && pwd)"

# 1. the user and its state
id ghost-mail >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin --user-group ghost-mail
install -d -o ghost-mail -g ghost-mail -m 0750 "$STATE" "$STATE/data" "$STATE/tls"
echo "1. user ghost-mail, state under $STATE"

# 2. the deploy user's tree, readable to ghost-mail: traversal through the home, the group on
#    ghost-mail's directories, set-group-id so what $U writes there later keeps the group
install -d -o "$U" -g ghost-mail -m 2750 "$ROOT" "$ROOT/bin" "$ROOT/etc"
chmod o+x "$H"
chgrp -R ghost-mail "$ROOT/bin" "$ROOT/etc"
chmod -R g+rX "$ROOT/bin" "$ROOT/etc"
find "$ROOT/bin" "$ROOT/etc" -type d -exec chmod g+s {} +
echo "2. $ROOT/{bin,etc} readable to ghost-mail (set-group-id, so new files follow)"

# 3. an earlier install as a user unit: stop it, move what it kept
if [ -f "$H/.config/systemd/user/ghost.maild.service" ]; then
  runuser -u "$U" -- env XDG_RUNTIME_DIR="/run/user/$(id -u "$U")" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u "$U")/bus" \
    systemctl --user disable --now ghost.maild 2>/dev/null || true
  rm -f "$H/.config/systemd/user/ghost.maild.service"
  echo "3. the user unit stopped and removed"
fi
if [ -d "$ROOT/data" ] && [ -n "$(ls -A "$ROOT/data" 2>/dev/null)" ]; then
  cp -a "$ROOT/data/." "$STATE/data/" && rm -rf "$ROOT/data"
  chown -R ghost-mail:ghost-mail "$STATE/data"
  echo "3. the queue moved to $STATE/data"
fi
rmdir "$ROOT/data" 2>/dev/null || true
if [ -f "$ROOT/etc/relay.key" ]; then
  install -o ghost-mail -g ghost-mail -m 0600 "$ROOT/etc/relay.key" "$STATE/relay.key" && rm -f "$ROOT/etc/relay.key"
  echo "3. the relay key moved to $STATE/relay.key (the boxes keep the same public key)"
fi
if [ -d "$ROOT/tls" ]; then
  rm -rf "$ROOT/tls"
fi
if [ -f /etc/sysctl.d/90-ghost-mail.conf ]; then
  rm -f /etc/sysctl.d/90-ghost-mail.conf
  sysctl -q -w net.ipv4.ip_unprivileged_port_start=1024
  echo "3. the unprivileged-port floor is back at 1024 (the unit binds 25 by capability)"
fi

# 4. the certificate copies, by certbot's deploy hook, into the state directory
if [ -d /etc/letsencrypt/renewal-hooks/deploy ]; then
  sed -e "s|@DEST@|$STATE/tls|g" "$HERE/certbot-hook.sh" > /etc/letsencrypt/renewal-hooks/deploy/ghost-maild.sh
  chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/ghost-maild.sh
  RENEWED_DOMAINS="mx.localghost.ai" /etc/letsencrypt/renewal-hooks/deploy/ghost-maild.sh || true
  echo "4. certbot deploy hook installed (copies the mx certificate into $STATE/tls)"
else
  echo "4. certbot is not installed here; the hook was not placed"
fi

# 5. the system unit, and $U's leave to restart it and read its journal
sed -e "s|@ROOT@|$ROOT|g" -e "s|@USER@|$U|g" "$HERE/../systemd/ghost.maild.service" > /etc/systemd/system/ghost.maild.service
systemctl daemon-reload
systemctl enable ghost.maild >/dev/null
cat > /etc/sudoers.d/ghost-mail <<SUDO
$U ALL=(root) NOPASSWD: /usr/bin/systemctl restart ghost.maild, /usr/bin/systemctl start ghost.maild, /usr/bin/systemctl stop ghost.maild, /usr/bin/systemctl status ghost.maild
SUDO
chmod 0440 /etc/sudoers.d/ghost-mail
visudo -c -f /etc/sudoers.d/ghost-mail >/dev/null
usermod -aG systemd-journal "$U"
echo "5. system unit installed and enabled; $U may restart it (sudo, no password) and read its journal (group systemd-journal, from the next login)"
if [ -x "$ROOT/bin/ghost.maild" ]; then
  systemctl restart ghost.maild
  sleep 1
  systemctl --no-pager --lines=3 status ghost.maild || true
else
  echo "no binary at $ROOT/bin/ghost.maild yet: run  ./deploy/mail/scripts/install.sh  as $U, it builds and starts it"
fi
echo "done; from here on:  ./deploy/mail/scripts/install.sh  as $U"
