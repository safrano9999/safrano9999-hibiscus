#!/usr/bin/env bash
# Prepare the same tested artifacts as user services; never start banking here.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${HIBISCUS_IMAGE:-ghcr.io/safrano9999/safrano9999-hibiscus:latest}"
for command in podman java node python3; do
  command -v "$command" >/dev/null || { echo "Required for bare-metal preparation: $command" >&2; exit 1; }
done
podman image exists "$IMAGE" || {
  echo "Pull $IMAGE through Smart1 first. No local image build is performed." >&2
  exit 1
}
NODE="$(command -v node)"
JAVA="$(command -v java)"
"$NODE" -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)'
IMAGE_ID="$(podman image inspect --format '{{.Id}}' "$IMAGE")"
mkdir -p "$ROOT/.runtime" "$ROOT/.state/hibiscus/.jameica" "$ROOT/.state/cfg"
chmod 0700 "$ROOT/.state" "$ROOT/.state/hibiscus" "$ROOT/.state/hibiscus/.jameica"
TARGET="$ROOT/.runtime/${IMAGE_ID#sha256:}"
if [ ! -f "$TARGET/.complete" ]; then
  STAGE="$(mktemp -d "$ROOT/.runtime/.prepare.XXXXXX")"
  CONTAINER=""
  cleanup() {
    [ -z "$CONTAINER" ] || podman rm "$CONTAINER" >/dev/null
    [ -z "$STAGE" ] || rm -rf -- "$STAGE"
  }
  trap cleanup EXIT
  # Create only: no entrypoint, Jameica, MCP tool or bank request is executed.
  CONTAINER="$(podman create --pull=never --image-volume=ignore "$IMAGE_ID")"
  podman cp --archive=false "$CONTAINER:/usr/local/hibiscus" "$STAGE/hibiscus"
  podman cp --archive=false "$CONTAINER:/opt/hibiscus-mcp" "$STAGE/hibiscus-mcp"
  podman cp --archive=false "$CONTAINER:/opt/supergateway" "$STAGE/supergateway"
  podman cp --archive=false "$CONTAINER:/usr/share/hibiscus/cfg" "$STAGE/cfg-defaults"
  "$NODE" --check "$STAGE/hibiscus-mcp/server.mjs"
  "$NODE" --check "$STAGE/supergateway/dist/index.js"
  # Separate mutable configuration from versioned runtime artifacts.
  cp -an "$STAGE/cfg-defaults/." "$ROOT/.state/cfg/"
  rm -rf -- "$STAGE/hibiscus/cfg"
  ln -s "$ROOT/.state/cfg" "$STAGE/hibiscus/cfg"
  printf '%s\n' "$IMAGE_ID" > "$STAGE/.complete"
  mv "$STAGE" "$TARGET"
  STAGE=""
fi
python3 "$ROOT/baremetal/render.py" "$ROOT" "$TARGET" "$NODE" "$JAVA"
printf '\nPrepared user services only; none started. Enable ONE deployment, container or bare metal.\n'
printf 'Bare metal: link %s/baremetal/generated/* into ~/.config/systemd/user/, then daemon-reload.\n' "$ROOT"
