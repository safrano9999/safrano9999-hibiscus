#!/usr/bin/env python3
"""Render the existing Jameica and MCP startup commands for user systemd."""
import shlex
import sys
from pathlib import Path


def quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'


def render(root, runtime, node, java):
    root, runtime = Path(root), Path(runtime)
    generated = root / 'baremetal/generated'
    generated.mkdir(parents=True, exist_ok=True)
    env = root / 'safrano9999-hibiscus.env'
    # This file contains executable paths only, never credentials.
    paths = root / '.runtime/baremetal-paths.sh'
    paths.write_text(''.join(f'{key}={shlex.quote(str(value))}\n' for key, value in {
        'HIBISCUS_RUNTIME': runtime, 'HIBISCUS_STATE': root / '.state',
        'HIBISCUS_NODE': node, 'HIBISCUS_JAVA': java,
    }.items()))
    paths.chmod(0o600)
    for name, command in [('safrano9999-hibiscus.service', 'hibiscus'), ('safrano9999-hibiscus-mcp.service', 'mcp')]:
        relation = 'After=safrano9999-hibiscus.service\nWants=safrano9999-hibiscus.service\n' if command == 'mcp' else 'After=network.target\n'
        content = f'''[Unit]
Description=Safrano Hibiscus {command} (bare metal)
{relation}PartOf=safrano9999-hibiscus.target

[Service]
Type=simple
EnvironmentFile={quote(env)}
WorkingDirectory={quote(runtime / ('hibiscus' if command == 'hibiscus' else 'hibiscus-mcp'))}
ExecStart={quote(root / 'baremetal/start.sh')} {command}
Restart=on-failure
RestartSec=5
TimeoutStopSec=45
NoNewPrivileges=true

[Install]
WantedBy=safrano9999-hibiscus.target
'''
        (generated / name).write_text(content)
    (generated / 'safrano9999-hibiscus.target').write_text('''[Unit]
Description=Safrano Hibiscus and MCP (bare metal)
Wants=safrano9999-hibiscus.service safrano9999-hibiscus-mcp.service
After=safrano9999-hibiscus.service safrano9999-hibiscus-mcp.service

[Install]
WantedBy=default.target
''')


if __name__ == '__main__':
    render(*sys.argv[1:])
