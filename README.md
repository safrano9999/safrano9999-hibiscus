# safrano9999-hibiscus

Ein gemeinsames Image für Hibiscus Server und den eigenständig nutzbaren
[HIBISCUS_MCP](https://github.com/safrano9999/HIBISCUS_MCP).

Image: `ghcr.io/safrano9999/safrano9999-hibiscus:latest`

```text
ucore / MCP-Client → :8000/mcp → https://127.0.0.1:8080/xmlrpc/
Webbrowser / Caddy → :8080/hibiscus/
```

Der MCP verwendet XML-RPC für Überweisungen und Kontostände. Sync wird einmal
über `/hibiscus/` gestartet; die begrenzte Abschlussbeobachtung und Rückmeldung
liegen im MCP-Quellrepo. Es gibt keine Änderung am Banking-Protokoll oder eine
separate Veröffentlichung des MCP-Images als Voraussetzung dieses Builds.

## Konfiguration

`config.sh` ist lokal ein Hardlink auf den gemeinsamen Generator aus
`SCRIPTS/safrano9999/config/config.sh`. Die bekannten Skip-/New-Regeln gelten
für die Examples. Git transportiert keine Hardlinks; nach einem neuen Checkout
kann die Verknüpfung zum lokalen SOT mit `ln -f` wiederhergestellt werden.

`env.example`:

| Variable | Bedeutung |
| --- | --- |
| `HIBISCUS_STORE_PASSWORD` | Bestehendes Jameica-Masterpasswort; bei einer Migration unbedingt beibehalten |
| `HIBISCUS_MCP_GATEWAY` | Optionaler separater MCP-Bearer; leer bedeutet direktes Passwort-Passthrough |

`container.example`:

| Variable | Bedeutung |
| --- | --- |
| `CONTAINER_NAME` | Standard `safrano9999-hibiscus` |
| `HIBISCUS_WEBUI_PUBLISH_HOST` | Äußere Bind-Adresse für eine optionale WebUI-Portfreigabe, Standard `127.0.0.1` |
| `HIBISCUS_WEBUI_PUBLISH_PORT` | Äußerer WebUI-Port; leer bedeutet keine Host-Portfreigabe |
| `HIBISCUS_MCP_PUBLISH_HOST` | Äußere Bind-Adresse für eine optionale MCP-Portfreigabe, Standard `127.0.0.1` |
| `HIBISCUS_MCP_PUBLISH_PORT` | Äußerer MCP-Port; leer bedeutet keine Host-Portfreigabe |
| `HIBISCUS_JAMEICA_VOLUMES` | Persistentes Profil nach `/var/lib/hibiscus/.jameica` |
| `HIBISCUS_CFG_VOLUMES` | Persistente Server-Konfiguration nach `/usr/local/hibiscus/cfg` |
| `ADDITIONAL_LINE` | Bestehende wiederholbare Quadlet-Erweiterungen, etwa `Network=rafael` |

Beide Publish-Ports sind standardmäßig leer. Caddy und ucore erreichen die
Dienste im gemeinsamen Podman-Netz auf den festen internen Ports **8080** und
**8000**. Das Veröffentlichen von beispielsweise Host-Port 18080 ändert den
internen Hibiscus-Port nicht. Die statischen `#container-port`-Metadaten in der
Vorlage sorgen dafür; es gibt keine internen Port-/URL-Konfigurationsvariablen.

`config.conf_example` enthält dafür keine weiteren Einstellungen. Die interne
MCP-Verbindung bleibt fest `https://127.0.0.1:8080`. Im Container lauscht der
MCP auf `0.0.0.0:8000`; `/healthz` benötigt keine Authentifizierung, `/mcp`
verwendet den Bearer. Hibiscus WebUI und XML-RPC bleiben auf Port 8080.

## Container

```bash
./setup.sh --container
```

Das Setup erzeugt die geschützten Runtime-Dateien und das Quadlet. Es baut,
startet oder synchronisiert nichts automatisch. Das Image wird über GitHub
Actions gebaut und mit Smart1 gepullt. Owner-Images bleiben auf `:latest`.

Im Image starten diese bisherigen Dienste unter ihrem neuen Namen:

```text
safrano9999-hibiscus.target
├── safrano9999-hibiscus.service      Jameica / Hibiscus
└── safrano9999-hibiscus-mcp.service  MCP / Supergateway
```

Die bestehende Charset-Korrektur für die Hibiscus-/Webadmin-Weboberflächen,
HBCI4Java und die bestehenden MCP-Transport-Patches bleiben erhalten.

## Bestehende Installation übernehmen

Repo-, Image- und Containername dürfen sich ändern; vorhandene Datenvolumes
und `HIBISCUS_STORE_PASSWORD` dürfen dabei nicht durch neue Defaults ersetzt
werden. Bei Rafaels bestehender Installation sind weiterhin zu verwenden:

```dotenv
HIBISCUS_JAMEICA_VOLUMES=hibiscus-fedora44-jameica:/var/lib/hibiscus/.jameica:Z
HIBISCUS_CFG_VOLUMES=hibiscus-fedora44-cfg:/usr/local/hibiscus/cfg:Z
```

Netzwerk-Aliase für bestehende Caddy-Ziele bleiben erhalten. Erst nach einem
geprüften Build und Pull wird der alte gemeinsame Container ersetzt. Nach dem
MCP-Verbindungstest kann der separate `hibiscus-mcp-newest` deaktiviert werden.
Kein zweiter Banking-Prozess darf gleichzeitig auf dasselbe Profil zugreifen.

## Bare Metal

```bash
./setup.sh --bare-metal
```

Die Bare-Metal-Vorbereitung übernimmt die **gleichen getesteten Artefakte aus
dem bereits lokal gepullten gemeinsamen Image**. Podman wird nur zum Entpacken
eines nicht gestarteten Containers benötigt. Zur Laufzeit laufen Java und Node
als normale User-Dienste; es gibt keinen Container und keinen lokalen Image-Build.
Benötigt werden Podman, Python 3, Java 25 und Node.js ab 20.

Versionierte Programmdateien liegen unter `.runtime/`, veränderliche Jameica-
Daten und Server-Konfiguration getrennt unter `.state/`. Vorhandene Konfiguration
wird nicht überschrieben. Die Vorbereitung rendert die User-systemd-Dateien
unter `baremetal/generated/`, startet aber keinen Dienst und keine Bankabfrage.
Der MCP bindet dabei wie der bestehende Standalone-Bare-Metal-Start an
`127.0.0.1:8000`. Die Publish-Einstellungen in `container.example` betreffen
nur die Container-Betriebsart. Genau eine Betriebsart gleichzeitig verwenden.

## Build und Tests

Die SOT liegt in `SCRIPTS/githubactions/safrano9999-hibiscus`; die generierten
Dateien werden hier unter `.github/` eingecheckt. Das `Containerfile` im Repo
ist dieselbe Build-Rezeptur. GitHub Actions lädt `safrano9999/HIBISCUS_MCP` mit
Tiefe 1, standardmäßig vom neuesten `main`, und vermerkt den verwendeten Commit
im Image. Der Upgrade-Runner löst `main` einmal auf und übergibt den konkreten
Commit an den Build. Es wird nur das gemeinsame Image veröffentlicht.

Die MCP-Tests laufen beim Build mit simuliertem XML-RPC/HTTP. Der anschließende
Protokolltest läuft ohne Netzwerk und ohne echte Banking-Zugangsdaten; er prüft
Initialisierung, Authentifizierung und Tool-Katalog, führt aber keine Tools aus.

Das optionale Standalone-Containerfile bleibt im MCP-Quellrepo unter
[`STANDALONE/Containerfile`](https://github.com/safrano9999/HIBISCUS_MCP/blob/main/STANDALONE/Containerfile).
