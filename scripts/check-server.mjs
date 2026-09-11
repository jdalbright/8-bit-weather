import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { log } from 'node:console';
import ts from 'typescript';

// Vite resolves extensionless imports that native Node ESM rejects in production.
// Emit the function's local module graph and load it without Vite or a TS loader.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(join(root, 'node_modules', '.briefing-smoke-'));
try {
  await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  for (const file of ['api/weather-briefing.ts', 'server/briefing.ts', 'server/openai-briefing.ts', 'src/lib/briefing.ts', 'src/lib/briefing-prompt.ts', 'src/lib/weather.ts']) {
    const source = await readFile(join(root, file), 'utf8');
    const result = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true,
    } });
    const destination = join(output, file.replace(/\.ts$/, '.js'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, result.outputText);
  }
  const { default: handler } = await import(pathToFileURL(join(output, 'api/weather-briefing.js')).href);
  // GET exercises startup and routing without using a key or making a provider call.
  const response = await handler.fetch(new globalThis.Request('https://weather.example/api/weather-briefing'));
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { code: 'method_not_allowed' });
  log('Native Node ESM function smoke check passed.');
} finally {
  await rm(output, { recursive: true, force: true });
}
