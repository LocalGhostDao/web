#!/bin/bash
# The relay's nftables rules, installed and loaded. Run as root (root-once.sh does); idempotent;
# run again after any change to nft/ghost-mail.nft. Dry run with --dry-run.
#
# What it does, and only this:
#   - copies nft/ghost-mail.nft to /etc/nftables.d/ghost-mail.nft
#   - makes sure /etc/nftables.conf includes /etc/nftables.d/*.nft, so the table survives a
#     reboot (the Debian unit loads that one file); an nftables.conf that is not there is created
#     with the Debian default (flush ruleset + the include), nothing else
#   - enables nftables.service
#   - loads the fragment now (its own table, inet ghostmail; the machine's other tables are not
#     touched, and whether 25 is open at all stays the machine's own policy)
#
# The rules: per-source rate and connection limits on port 25, and no IPv6 on it (the relay has
# no IPv6 identity). A LocalGhost box on the same machine keeps its own table beside this one.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../nft/ghost-mail.nft"
DIR=/etc/nftables.d
DST="$DIR/ghost-mail.nft"
CONF=/etc/nftables.conf
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

run() { if [ "$DRY" = 1 ]; then echo "[would] $*"; else "$@"; fi; }

[ -f "$SRC" ] || { echo "firewall: $SRC missing"; exit 1; }
if ! command -v nft >/dev/null 2>&1; then
    echo "firewall: nftables is not installed (apt install nftables); port 25 runs without its limits"
    exit 1
fi
if [ "$DRY" = 0 ] && [ "$(id -u)" != 0 ]; then
    echo "firewall: run as root"
    exit 1
fi

nft -c -f "$SRC" || { echo "firewall: $SRC does not parse"; exit 1; }

run install -d -m 755 "$DIR"
if [ -f "$DST" ] && cmp -s "$SRC" "$DST"; then
    echo "firewall: $DST is current"
else
    run install -m 644 "$SRC" "$DST"
    echo "firewall: installed $DST"
fi

if [ ! -f "$CONF" ]; then
    if [ "$DRY" = 1 ]; then
        echo "[would] write $CONF (flush ruleset + include \"$DIR/*.nft\")"
    else
        printf '#!/usr/sbin/nft -f\nflush ruleset\ninclude "%s/*.nft"\n' "$DIR" > "$CONF"
        chmod 755 "$CONF"
    fi
    echo "firewall: wrote $CONF"
elif ! grep -Eq "^[[:space:]]*include[[:space:]]+\"$DIR/\*\.nft\"" "$CONF"; then
    if [ "$DRY" = 1 ]; then
        echo "[would] append include \"$DIR/*.nft\" to $CONF"
    else
        printf '\ninclude "%s/*.nft"\n' "$DIR" >> "$CONF"
    fi
    echo "firewall: $CONF now includes $DIR/*.nft"
fi
# the whole file must still parse, or the unit fails at boot and the box comes up with no rules
if [ "$DRY" = 0 ]; then
    nft -c -f "$CONF" || { echo "firewall: $CONF does not parse after the include; fix it before rebooting"; exit 1; }
fi

if systemctl list-unit-files nftables.service >/dev/null 2>&1; then
    if ! systemctl is-enabled nftables.service >/dev/null 2>&1; then
        run systemctl enable nftables.service
        echo "firewall: nftables.service enabled (loads $CONF at boot)"
    fi
fi

run nft -f "$DST"
echo "firewall: table inet ghostmail loaded"
