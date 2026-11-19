import { createInterface } from 'node:readline';

// Answer the MCP handshake before loading the tool schemas and their dependencies.
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', line => { void (async () => {
  let id: string | number | undefined;
  try {
    const message = JSON.parse(line) as { id?: string | number; method: string; params?: Record<string, unknown> };
    id = message.id;
    if (id === undefined) return;
    let result: unknown;
    if (message.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sail-creation', version: '1.0.0' } };
    else if (message.method === 'tools/list') {
      const { tools } = await import('./creative-agent-tools');
      result = { tools };
    }
    else if (message.method === 'tools/call') {
      const name = String(message.params?.name || '');
      try {
        const { call, toolContent } = await import('./creative-agent-tools');
        result = { content: toolContent(name, await call(name, (message.params?.arguments || {}) as Record<string, unknown>)) };
      }
      catch (error) { result = { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : '工具执行失败' }] }; }
    } else throw new Error(`Unsupported method: ${message.method}`);
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
  } catch (error) {
    if (id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: error instanceof Error ? error.message : '工具错误' } })}\n`);
  }
})(); });
