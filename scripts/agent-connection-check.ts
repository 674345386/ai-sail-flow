import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise a stalled launcher (with a native child) followed by a healthy retry.
// No credentials, model requests or existing project data are used.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sop-agent-connection-'));
const launches = path.join(temp, 'launches.jsonl');
const fixture = path.join(temp, 'codex-fixture');
fs.writeFileSync(fixture, `#!${process.execPath}
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const log = process.env.SOP_AGENT_CHECK_LAUNCHES;
const first = !fs.existsSync(log);
const native = first ? spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }) : undefined;
fs.appendFileSync(log, JSON.stringify({ pid: process.pid, native: native?.pid }) + '\\n');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (first || !request.id) return;
  let result = {};
  if (request.method === 'model/list') result = { data: [{ model: 'gpt-6.1-terra' }] };
  if (request.method === 'thread/start') result = { thread: { id: 'recovered-thread' } };
  if (request.method === 'turn/start') result = { turn: { id: 'recovered-turn' } };
  process.stdout.write(JSON.stringify({ id: request.id, result }) + '\\n');
  if (request.method === 'turn/start') setTimeout(() => process.stdout.write(JSON.stringify({ method: 'turn/completed', params: { turn: { id: 'recovered-turn', status: 'completed' } } }) + '\\n'), 10);
});
`, { mode: 0o700 });
Object.assign(process.env, {
  SOP_DATA_DIR: temp,
  SOP_AGENT_CODEX_HOME: path.join(temp, 'codex-home'),
  SOP_AGENT_CODEX_BIN: fixture,
  SOP_AGENT_CHECK_LAUNCHES: launches,
  SOP_AGENT_PROVIDER: 'codex',
  SOP_AGENT_MODEL: 'gpt-6.1-terra',
});
const originalTimeout = globalThis.setTimeout;
// Keep the production startup timeout intact while simulating it quickly here.
globalThis.setTimeout = ((callback: (...args: any[]) => void, ms?: number, ...args: any[]) =>
  originalTimeout(callback, ms === 120_000 ? 1500 : ms, ...args)) as typeof setTimeout;
const readLaunches = (): { pid: number; native?: number }[] => fs.existsSync(launches)
  ? fs.readFileSync(launches, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];

try {
  const { getAgentState, startAgentTurn, listAgentModels } = await import('../server/creative-agent');
  await assert.rejects(startAgentTurn('connection-check', 'first attempt'), /Codex initialize 超时/);
  assert.equal(getAgentState('connection-check').status, 'failed');
  await startAgentTurn('connection-check', 'retry');
  await delay(50);
  assert.equal(getAgentState('connection-check').status, 'idle');
  assert.equal(getAgentState('connection-check').threadId, 'recovered-thread');
  await listAgentModels('connection-check');
  const processes = readLaunches();
  assert.equal(processes.length, 2, 'reuse the replacement after the old process exits');
  for (const pid of [processes[0].pid, processes[0].native!]) {
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'terminate the stalled launcher and its child');
  }
  console.log('Agent connection check passed: timeout, process cleanup, retry and replacement reuse.');
} catch (error) {
  console.error('Agent fixture launches:', readLaunches());
  throw error;
} finally {
  globalThis.setTimeout = originalTimeout;
  for (const { pid } of readLaunches()) {
    try { process.kill(process.platform === 'win32' ? pid : -pid, 'SIGKILL'); } catch { /* Already stopped. */ }
  }
  await delay(20);
  fs.rmSync(temp, { recursive: true, force: true });
}
