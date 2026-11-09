import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AGENT_ADAPTATIONS, normalizeAgentAdaptation } from '../shared/agent-adaptation';
import { agentInstructionsFor } from '../server/creative-agent-instructions';
import { AGENT_PRESENTATIONS, normalizeAgentPresentation } from '../shared/agent-presentation';

// Exercise the real app-server bridge with a local protocol fixture. No model,
// credentials, generation tools or existing creative data are used.
const temp = await mkdtemp(path.join(os.tmpdir(), 'sop-agent-adaptation-'));
const requests = path.join(temp, 'requests.jsonl');
const fixture = path.join(temp, 'codex-fixture');
await writeFile(fixture, `#!${process.execPath}
const fs = require('node:fs');
const readline = require('node:readline');
let thread = 0, turn = 0;
readline.createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (!request.id) return;
  fs.appendFileSync(process.env.SOP_AGENT_CHECK_REQUESTS, line + '\\n');
  let result = {};
  if (request.method === 'model/list') result = { data: [{ model: 'gpt-6.1-terra', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }] };
  if (request.method === 'thread/start') result = { thread: { id: 'thread-' + ++thread } };
  if (request.method === 'turn/start') result = { turn: { id: 'turn-' + ++turn } };
  process.stdout.write(JSON.stringify({ id: request.id, result }) + '\\n');
  if (request.method === 'turn/start') setTimeout(() => process.stdout.write(JSON.stringify({ method: 'turn/completed', params: { turn: { id: result.turn.id, status: 'completed' } } }) + '\\n'), 20);
});
`, { mode: 0o700 });
process.env.SOP_DATA_DIR = temp;
process.env.SOP_AGENT_CODEX_HOME = path.join(temp, 'codex-home');
process.env.SOP_AGENT_CODEX_BIN = fixture;
process.env.SOP_AGENT_CHECK_REQUESTS = requests;

try {
  const { getAgentState, setAgentAdaptation, setAgentPresentation, startAgentTurn } = await import('../server/creative-agent');
  const id = 'adaptation-check';
  const otherId = 'other-creative';
  const state = getAgentState(id);
  assert.equal(state.adaptation, 0);
  assert.equal(state.presentation, 'auto');
  assert.equal(normalizeAgentPresentation('invalid'), 'auto');
  assert.throws(() => setAgentPresentation(id, 'invalid' as never));
  assert.equal(normalizeAgentAdaptation('3'), 0);
  assert.equal(normalizeAgentAdaptation(7), 0);
  assert.throws(() => setAgentAdaptation(id, 4 as never));
  const versions = new Set<string>();
  let previousThread: string | undefined;
  const variants = AGENT_ADAPTATIONS.flatMap(adaptation => AGENT_PRESENTATIONS.map(presentation => ({ adaptation, presentation })));
  for (const { adaptation: option, presentation } of variants) {
    const profile = agentInstructionsFor(option.value, presentation.value);
    versions.add(profile.instructionsVersion);
    if (option.value === 0) {
      assert(!profile.developerInstructions.includes('Keep conversational replies concise'));
      assert(!profile.developerInstructions.includes('Match the depth'));
    }
    assert.equal(profile.developerInstructions.includes('<ui_component_manual>'), presentation.value !== 'html');
    assert(profile.developerInstructions.includes('Only submit video generation when the user explicitly requests'));
    setAgentAdaptation(id, option.value);
    setAgentPresentation(id, presentation.value);
    assert.equal(state.adaptation, option.value, 'presentation must not change adaptation');
    assert.equal(getAgentState(otherId).adaptation, 0, 'creative preferences must remain isolated');
    assert.equal(getAgentState(otherId).presentation, 'auto');
    const saved = JSON.parse(await readFile(path.join(temp, 'agent-sessions', `${id}.json`), 'utf8'));
    assert.equal(saved.adaptation, option.value);
    assert.equal(saved.presentation, presentation.value);
    await startAgentTurn(id, `Question at level ${option.value}, presentation ${presentation.value}`);
    assert.equal(state.status, 'running');
    assert.throws(() => setAgentAdaptation(id, 0), /正在执行/);
    assert.throws(() => setAgentPresentation(id, 'html'), /正在执行/);
    assert.notEqual(state.threadId, previousThread, 'changed instructions must start a new model context');
    if (previousThread) assert.equal(state.previousThreadId, previousThread);
    previousThread = state.threadId;
    const deadline = Date.now() + 2000;
    while (state.status === 'running' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(state.status, 'idle');
  }
  assert.equal(versions.size, variants.length);
  assert.equal(state.messages.filter(message => message.role === 'user').length, variants.length)
  assert(state.messages.every(message => !message.text.includes('[本次结果呈现：')), 'saved user text must remain unchanged');
  const calls = (await readFile(requests, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const starts = calls.filter(call => call.method === 'thread/start');
  const turns = calls.filter(call => call.method === 'turn/start');
  assert.equal(starts.length, variants.length);
  assert.equal(turns.length, variants.length);
  for (const [index, call] of starts.entries()) assert.equal(call.params.developerInstructions, agentInstructionsFor(variants[index].adaptation.value, variants[index].presentation.value).developerInstructions);
  for (const [index, call] of turns.entries()) {
    assert.equal(call.params.model, 'gpt-6.1-terra'); assert.equal(call.params.effort, 'high');
    assert(call.params.input[0].text.includes(`[本次结果呈现：${variants[index].presentation.label}]`));
  }
  assert(turns[1].params.input[0].text.includes('Question at level 0'), 'context must carry over when switching');
  console.log('Agent preferences check passed: 12 combinations, presentation suffixes, request parameters, persistence, context switching, isolation and busy/invalid guards.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true });
  // The fixture's stdio stays open as a real app-server would; exit closes it.
  process.exit(process.exitCode || 0);
}
