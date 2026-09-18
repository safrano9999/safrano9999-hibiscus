#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="${HIBISCUS_IMAGE:-ghcr.io/safrano9999/safrano9999-hibiscus:latest}"
NAME="${CONFIG_CONTAINER_NAME:-safrano9999-hibiscus}"

mode="${1:---container}"
case "$mode" in
  --container|--bare-metal) ;;
  --help|-h) echo 'Usage: ./setup.sh [--container|--bare-metal]'; exit 0 ;;
  *) echo "Unknown option: $mode" >&2; exit 2 ;;
esac
cd "$DIR"
if [ "$mode" = --bare-metal ]; then
  CONFIG_CONTAINER_NAME="$NAME" ./config.sh --no-container
  exec "$DIR/baremetal/setup.sh"
fi
CONFIG_CONTAINER_NAME="$NAME" ./config.sh
chmod 0600 "$NAME.env" "${NAME}_config.conf" "${NAME}_container.conf"

CONFIG_CONTAINER_NAME="$NAME" CONFIG_CONTAINER_IMAGE="$IMAGE" ./config.sh --render-container

units="${XDG_CONFIG_HOME:-$HOME/.config}/containers/systemd"
printf '\nSetup complete. Link the generated Quadlet with:\n'
printf '  mkdir -p %q && ln -sfn %q %q\n' \
  "$units" "$DIR/$NAME.container" "$units/$NAME.container"
printf 'Then: systemctl --user daemon-reload && systemctl --user restart %s.service\n' "$NAME"
