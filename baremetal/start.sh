#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/.runtime/baremetal-paths.sh"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--Duser.timezone=Europe/Berlin}"
case "${1:-}" in
  hibiscus)
    cd "$HIBISCUS_RUNTIME/hibiscus"
    exec "$HIBISCUS_JAVA" -Djava.net.preferIPv4Stack=true \
      "-Duser.home=$HIBISCUS_STATE/hibiscus" -Xmx1024m \
      -jar "$HIBISCUS_RUNTIME/hibiscus/jameica-linux64.jar" -d -p "${HIBISCUS_STORE_PASSWORD:?}"
    ;;
  mcp)
    export HIBISCUS_MCP_UPSTREAM_URL=https://127.0.0.1:8080
    printf -v stdio '%q %q' "$HIBISCUS_NODE" "$HIBISCUS_RUNTIME/hibiscus-mcp/server.mjs"
    exec "$HIBISCUS_NODE" "$HIBISCUS_RUNTIME/supergateway/dist/index.js" \
      --stdio "$stdio" --outputTransport streamableHttp --stateful \
      --host 127.0.0.1 --port 8000 --streamableHttpPath /mcp \
      --healthEndpoint /healthz --sessionTimeout 3600000 --logLevel info
    ;;
  *) echo 'Usage: start.sh hibiscus|mcp' >&2; exit 2 ;;
esac
