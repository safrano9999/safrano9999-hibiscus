# HIBISCUS-FEDORA45

`HIBISCUS-FEDORA45` kombiniert einen vollständigen Hibiscus-Server und
[`HIBISCUS_MCP`](https://github.com/safrano9999/HIBISCUS_MCP) in einem
systemd-basierten Fedora-Container.

Container-Image: `ghcr.io/safrano9999/hibiscus-fedora45:latest`

## Architektur

```text
hibiscus-fedora45.target
├── hibiscus-fedora45.service      Hibiscus Web/HTTPS/XML-RPC :8080
└── hibiscus-fedora45-mcp.service  Streamable HTTP MCP        :8000
                                      │
                                      └── https://127.0.0.1:8080/
                                          ├── xmlrpc/
                                          └── hibiscus/ (Sync)
```

PID 1 ist systemd. Die drei zugehörigen Units liegen unter [`systemd/`](systemd/)
und werden vom [`Containerfile`](Containerfile) direkt ins Image eingebaut:
[`Target`](systemd/hibiscus-fedora45.target),
[`Hibiscus-Dienst`](systemd/hibiscus-fedora45.service) und
[`MCP-Dienst`](systemd/hibiscus-fedora45-mcp.service).

## Enthaltene Versionen

| Komponente | Version |
| --- | --- |
| Fedora | 45 |
| Jameica | 2.12.0 |
| Hibiscus Server | 2.12.4 Stable |
| HBCI4Java | 4.1.12 |
| Java | OpenJDK 25 |

### Warum HBCI4Java 4.1.12?

Hibiscus 2.12.4 wurde mit HBCI4Java 4.1.10 veröffentlicht und prüft beim Start
hart gegen diese Version. Das Image ersetzt die mitgelieferte JAR vollständig
durch 4.1.12; es liegen keine doppelten JARs oder alten Fragmente vor.

Die Abweichung ist beabsichtigt: Erst 4.1.12 setzt bei Echtzeitüberweisungen im
SEPA-Dokument `PmtTpInf/LclInstrm/Cd` auf `INST` ([Upstream-Commit](https://github.com/hbci4j/hbci4java/commit/fae0ab26ad9de0f48ed19dbcf3730bfb8b4c30c5)).
Hibiscus kann deshalb eine Versionswarnung anzeigen; Echtzeitüberweisungen
bleiben funktional korrekt.

Diese Überschreibung sollte nicht ohne erneuten echten Überweisungstest entfernt
oder durch eine andere HBCI4Java-Version ersetzt werden.

### Zeichensatz der Weboberfläche

Die Velocity-Seiten von Hibiscus und Jameica liefern historisch ISO-8859-1.
Das [`Containerfile`](Containerfile) ergänzt deshalb in beiden Header-Templates
den echten HTTP-Header `text/html; charset=ISO-8859-1`. Damit werden deutsche
Umlaute korrekt dargestellt; Banking, XML-RPC und MCP werden davon nicht
verändert.

## Authentifizierung

Es gibt genau zwei gemeinsame Variablen:

| Variable | Bedeutung |
| --- | --- |
| `HIBISCUS_STORE_PASSWORD` | Erforderliches Jameica-Masterpasswort und internes Hibiscus-Passwort des MCP-Servers |
| `HIBISCUS_MCP_GATEWAY` | Optionaler, vom Store-Passwort getrennter Bearer für MCP-Clients |

Ist `HIBISCUS_MCP_GATEWAY` leer, wird der eingehende MCP-Bearer direkt als
Hibiscus-Passwort verwendet. Ist er gesetzt, authentifiziert er nur den
MCP-Client; der interne MCP-Prozess verwendet anschließend
`HIBISCUS_STORE_PASSWORD` gegenüber Hibiscus.

## Ports und Endpunkte

| Port | Dienst | Endpunkte |
| --- | --- | --- |
| `8080` | Hibiscus | Weboberfläche, HTTPS und `/xmlrpc/` |
| `8000` | MCP | `/mcp` und `/healthz` (Health ohne Authentifizierung) |

Die Ports müssen nicht auf dem Host veröffentlicht werden. Ein leerer
`HIBISCUS_FEDORA45_MCP_PUBLISH_PORT` lässt den MCP ausschließlich im
Podman-Netz erreichbar; Webzugriff kann ebenfalls über einen Reverse Proxy im
gemeinsamen Netz erfolgen. Die Beispielkonfiguration veröffentlicht nur MCP
auf `127.0.0.1:8000`; das `EXPOSE 8080` des Images allein erzeugt keine
Host-Portfreigabe.

## Persistenz

| Volume | Containerpfad | Inhalt |
| --- | --- | --- |
| `hibiscus-fedora45-jameica` | `/var/lib/hibiscus/.jameica` | Jameica-Profil, Bankzugänge und Laufzeitdaten |
| `hibiscus-fedora45-cfg` | `/usr/local/hibiscus/cfg` | Hibiscus-Serverkonfiguration |

Der MCP-Teil besitzt keine eigene Datenbank und benötigt kein zusätzliches
Volume.

## Konfiguration und Deployment

[`config.sh`](config.sh) erzeugt die Runtime-Dateien aus diesen Vorlagen:

| Vorlage | Inhalt |
| --- | --- |
| [`env.example`](env.example) | Store-Passwort und optionaler Gateway-Bearer |
| [`config.conf_example`](config.conf_example) | erwarteter Hibiscus-Port, MCP-Port und interne Upstream-URL |
| [`container.example`](container.example) | Volumes, optionale Veröffentlichung und zusätzliche Quadlet-Zeilen |

```bash
./setup.sh
```

Das Setup setzt sensible Runtime-Dateien auf Modus `0600`, rendert
`hibiscus-fedora45.container` und zeigt den passenden Symlink-Befehl für das
User-Quadlet an. Danach:

```bash
systemctl --user daemon-reload
systemctl --user restart hibiscus-fedora45.service
```

Die internen Dienste lassen sich bei Bedarf getrennt prüfen:

```bash
podman exec hibiscus-fedora45 systemctl is-active \
  hibiscus-fedora45.service \
  hibiscus-fedora45-mcp.service \
  hibiscus-fedora45.target
```

## Build und Beziehung zu HIBISCUS_MCP

Der Multi-Stage-Build übernimmt `/opt/hibiscus-mcp` und das gepatchte
Supergateway aus `ghcr.io/safrano9999/hibiscus-mcp:latest`; dessen Aufbau ist im
[`HIBISCUS_MCP-Containerfile`](https://github.com/safrano9999/HIBISCUS_MCP/blob/main/Containerfile)
dokumentiert. Die MCP-Implementierung bleibt damit eigenständig nutzbar;
dieses Projekt ergänzt Fedora, Jameica, Hibiscus, Persistenz und die internen
systemd-Units.

Das [`Containerfile`](Containerfile) pinnt Download-Prüfsummen für Hibiscus und
HBCI4Java. Der GitHub-Workflow
[`container-image.yml`](.github/workflows/container-image.yml) baut das Image
manuell für `linux/amd64` ohne Cache. Er veröffentlicht einen Datums-Tag,
standardmäßig zusätzlich `:latest`, und führt anschließend einen Smoke-Test der
JAR, MCP-Quelle und systemd-Units aus.
