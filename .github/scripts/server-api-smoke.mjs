// Source of truth: SCRIPTS/githubactions. Generated copies are overwritten.
// CI only: network=none, an empty H2 profile and dummy credentials. No bank sync.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdir, writeFile, chown, readFile} from 'node:fs/promises';
import https from 'node:https';
import {setTimeout as delay} from 'node:timers/promises';

const home = '/var/lib/hibiscus';
const password = 'ci-empty-profile-only';
const credentials = user => ({
  uid: Number(execFileSync('id', ['-u', user])),
  gid: Number(execFileSync('id', ['-g', user])),
});
const bankingUser = credentials('hibiscus');
await mkdir(`${home}/.jameica`, {recursive:true});
await chown(home, bankingUser.uid, bankingUser.gid);
await chown(`${home}/.jameica`, bankingUser.uid, bankingUser.gid);
await writeFile('/usr/local/hibiscus/cfg/de.willuhn.jameica.hbci.rmi.HBCIDBService.properties',
  'database.driver=de.willuhn.jameica.hbci.server.DBSupportH2Impl\n');

const processes = [];
let logs = '';
function launch(executable, args, options) {
  const p = spawn(executable, args, options);
  processes.push(p);
  for (const stream of [p.stdout, p.stderr]) stream.on('data', d => {logs = (logs + d).slice(-60000);});
  p.on('error', e => {logs += String(e);});
  return p;
}
function request(path, body, auth = true) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (auth) headers.Authorization = 'Basic ' + Buffer.from(`foobar:${password}`).toString('base64');
    if (body) headers['Content-Type'] = 'text/xml';
    const req = https.request({hostname:'127.0.0.1', port:8080, path,
      method:body ? 'POST':'GET', headers, rejectUnauthorized:false, timeout:3000}, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', d => {text += d;});
      res.on('end', () => resolve({status:res.statusCode, text}));
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject); req.end(body);
  });
}
async function waitReady(probe, name) {
  for (let attempt=0; attempt<90; attempt++) {
    try {if (await probe()) return;} catch {}
    await delay(1000);
  }
  throw new Error(`${name} not ready`);
}
function rpcReply(text, id) {
  const objects = text.trim().startsWith('data:')
    ? text.split(/\r?\n/).filter(x => x.startsWith('data:')).map(x => JSON.parse(x.slice(5)))
    : [JSON.parse(text)];
  const response = objects.find(x => x.id === id);
  assert.ok(response && !response.error, 'successful JSON-RPC response');
  return response.result;
}

try {
  launch('/usr/bin/java', ['-Djava.net.preferIPv4Stack=true', `-Duser.home=${home}`, '-Xmx512m',
    '-jar','/usr/local/hibiscus/jameica-linux64.jar','-d','-p',password],
    {...bankingUser,cwd:'/usr/local/hibiscus',env:{...process.env,HOME:home}});
  await waitReady(async () => (await request('/hibiscus/')).status === 200, 'Hibiscus WebUI');
  assert.equal((await request('/hibiscus/', undefined, false)).status, 401);
  for (const method of ['hibiscus.xmlrpc.konto.find','hibiscus.xmlrpc.sepaueberweisung.find']) {
    const params = method.includes('sepaueberweisung')
      ? '<param><value><string></string></value></param>'.repeat(3) : '';
    const response = await request('/xmlrpc/',
      `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${params}</params></methodCall>`);
    assert.equal(response.status, 200, method);
    assert.ok(response.text.includes('<array>') && !response.text.includes('<fault>'), `${method}: successful array result`);
    console.log(`${method}: OK (empty CI database)`);
  }

  launch('/usr/bin/node', ['/opt/supergateway/dist/index.js', '--stdio', '/usr/bin/node /opt/hibiscus-mcp/server.mjs',
    '--outputTransport','streamableHttp','--stateful','--host','127.0.0.1','--port','8000',
    '--streamableHttpPath','/mcp','--healthEndpoint','/healthz'],
    {...credentials('hibiscus-mcp'),env:{...process.env,HIBISCUS_STORE_PASSWORD:password,
      HIBISCUS_MCP_GATEWAY:'ci-gateway',HIBISCUS_MCP_UPSTREAM_URL:'https://127.0.0.1:8080'}});
  await waitReady(async () => (await fetch('http://127.0.0.1:8000/healthz')).ok, 'MCP');
  const headers = {'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer ci-gateway'};
  const call = (id, method, params={}) => fetch('http://127.0.0.1:8000/mcp', {
    method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',...(id ? {id}:{}),method,params}),signal:AbortSignal.timeout(15000)});
  const init = await call(1,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'hibiscus-ci',version:'1'}});
  assert.equal(init.status,200);
  const negotiated = rpcReply(await init.text(),1);
  headers['MCP-Session-Id'] = init.headers.get('mcp-session-id');
  headers['MCP-Protocol-Version'] = negotiated.protocolVersion;
  assert.equal((await call(null,'notifications/initialized')).status,202);
  const pending = await call(2,'tools/call',{name:'pending_transfers',arguments:{action:'list'}});
  assert.equal(pending.status,200);
  const result = rpcReply(await pending.text(),2);
  assert.ok(!result.isError);
  assert.equal(JSON.parse(result.content[0].text).count,0);
  const balance = await call(3,'tools/call',{name:'get_balance',arguments:{}});
  const empty = rpcReply(await balance.text(),3);
  assert.equal(empty.isError,true);
  assert.equal(empty.content[0].text,'No matching Hibiscus account found');
  const appLog = await readFile(`${home}/.jameica/jameica.log`, 'utf8');
  assert.ok(!/NoSuchMethodError|NoSuchFieldError|NoClassDefFoundError|SecurityException|Fehler beim Initialisieren des HBCI|stimmt nicht mit der erwarteten Version/.test(appLog), 'clean banking plugin startup');
  console.log('PASS: Hibiscus 2.12.4 + HBCI4Java 4.1.17 WebUI/auth/XML-RPC/MCP, no bank access');
} catch (error) {
  console.error(logs);
  try {console.error(await readFile(`${home}/.jameica/jameica.log`, 'utf8'));} catch {}
  throw error;
} finally {
  for (const p of processes.reverse()) p.kill('SIGTERM');
}
