// Source of truth: SCRIPTS/githubactions. Generated copies are overwritten.
// Run through docker exec -i CONTAINER node --input-type=module < this-file.
// The published image runs with --network none and dummy CI credentials only.
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { setTimeout } from "node:timers/promises";

const endpoint = "http://127.0.0.1:8000/mcp";
const bearer = "ci-gateway";
const protocols = ["2025-11-25", "2025-03-26", "2024-11-05"];
const expectedTools = ["create_transfer", "get_balance", "pending_transfers"];
const sdkVersions = {};
for (const component of ["hibiscus-mcp", "supergateway"]) {
  const path = `/opt/${component}/node_modules/@modelcontextprotocol/sdk/package.json`;
  const installed = JSON.parse(await readFile(path, "utf8"));
  assert.equal(installed.version, "1.30.0", `${component} SDK version`);
  sdkVersions[component] = installed.version;
}

// A protocol/catalog request must never reach the XML-RPC upstream.
let upstreamRequests = 0;
const upstreamStub = createServer((_request, response) => {
  upstreamRequests += 1;
  response.writeHead(500, { "Content-Type": "text/plain" });
  response.end("Protocol smoke must not contact the banking upstream");
});
upstreamStub.listen(18080, "127.0.0.1");
await once(upstreamStub, "listening");

async function post(message, { token = bearer, version, session } = {}) {
  // Keep this probe incapable of executing application tools.
  assert.ok(["initialize", "notifications/initialized", "tools/list"].includes(message.method));
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (version) headers["MCP-Protocol-Version"] = version;
  if (session) headers["MCP-Session-Id"] = session;
  const response = await fetch(endpoint, {
    method: "POST", headers, body: JSON.stringify(message), signal: AbortSignal.timeout(10000),
  });
  return {
    status: response.status,
    session: response.headers.get("mcp-session-id"),
    contentType: response.headers.get("content-type") ?? "",
    body: await response.text(),
  };
}

function result(response, id, label) {
  assert.equal(response.status, 200, `${label}: HTTP status`);
  let messages;
  if (response.contentType.includes("text/event-stream")) {
    messages = response.body.split(/\r?\n\r?\n/).flatMap((event) => {
      const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart()).join("\n");
      return data ? [JSON.parse(data)] : [];
    });
  } else {
    assert.ok(response.contentType.includes("application/json"), `${label}: JSON or SSE response`);
    messages = [JSON.parse(response.body)];
  }
  const matched = messages.filter((message) => message.id === id);
  assert.equal(matched.length, 1, `${label}: one response with matching request id`);
  assert.equal(matched[0].jsonrpc, "2.0", `${label}: JSON-RPC version`);
  assert.ok(!matched[0].error, `${label}: JSON-RPC error code ${matched[0].error?.code ?? "none"}`);
  assert.ok(matched[0].result && typeof matched[0].result === "object", `${label}: result object`);
  return matched[0].result;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:8000/healthz", { signal: AbortSignal.timeout(1000) });
      ready = response.ok && (await response.text()).trim() === "ok";
      if (ready) break;
    } catch { /* The gateway may still be starting. */ }
    await setTimeout(500);
  }
  assert.ok(ready, "Gateway became healthy within the startup deadline");

  const reports = [];
  for (const version of protocols) {
    const initialize = {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: version, capabilities: {}, clientInfo: { name: "hibiscus-image-ci", version: "1" } },
    };
    const unauthorized = await post(initialize, { token: null, version });
    assert.equal(unauthorized.status, 401, `${version}: unauthenticated initialize`);

    const initialized = await post(initialize, { version });
    const negotiated = result(initialized, 1, `${version}: initialize`);
    assert.equal(negotiated.protocolVersion, version, `${version}: requested version retained`);
    assert.equal(negotiated.serverInfo?.name, "hibiscus-mcp", `${version}: actual backend identity`);
    assert.ok(negotiated.capabilities?.tools, `${version}: backend tool capability`);
    assert.ok(initialized.session, `${version}: session assigned`);
    // Follow the negotiated version, which exposed the old gateway/backend mismatch.
    const context = { version: negotiated.protocolVersion, session: initialized.session };
    const notification = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, context);
    assert.equal(notification.status, 202, `${version}: initialized notification`);

    const list = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
    for (const token of [null, "ci-wrong-bearer"]) {
      const denied = await post(list, { ...context, token });
      assert.equal(denied.status, 401, `${version}: session bearer binding`);
    }
    const catalog = result(await post(list, context), 2, `${version}: tools/list`);
    assert.ok(Array.isArray(catalog.tools), `${version}: tools array`);
    assert.deepEqual(catalog.tools.map((tool) => tool.name).sort(), expectedTools, `${version}: complete Hibiscus catalog`);
    assert.ok(catalog.tools.every((tool) => tool.inputSchema?.type === "object"), `${version}: tool schemas`);
    assert.ok(!catalog.nextCursor, `${version}: catalog is complete`);
    reports.push({ protocol: version, initialize: 200, initialized: 202, tools_list: 200, tool_count: catalog.tools.length, bearer_checks: 3 });
  }
  assert.equal(upstreamRequests, 0, "No banking upstream requests during protocol/catalog smoke");
  console.log(JSON.stringify({ ok: true, sdk_versions: sdkVersions, protocols: reports, upstream_requests: upstreamRequests }));
} finally {
  upstreamStub.closeAllConnections();
  await new Promise((resolve, reject) => upstreamStub.close((error) => error ? reject(error) : resolve()));
}
