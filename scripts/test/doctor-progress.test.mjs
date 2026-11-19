import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { stripVTControlCharacters } from 'node:util'

const progressModule = new URL('../repo-doctor/progress.mjs', import.meta.url).href

function runProgress (options = {}) {
  const script = `
    (async () => {
      process.stdout.isTTY = ${options.tty ?? true};
      process.stdout.columns = ${options.columns ?? 80};
      const writes = [];
      const write = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk, ...args) => {
        writes.push(String(chunk));
        return write(chunk, ...args);
      };
      const { startProgress } = await import(${JSON.stringify(progressModule)});
      const stop = startProgress({ color: ${options.color ?? true}, checkLinks: true });
      await new Promise(resolve => setTimeout(resolve, 350));
      await stop();
      await stop();
      if (process.stdout.isTTY && !process.env.CI && process.env.TERM !== 'dumb') {
        const assert = await import('node:assert/strict');
        assert.ok(writes.some(chunk => chunk.includes('Checking')));
      }
      console.log('Links: report');
      await new Promise(resolve => setTimeout(resolve, 150));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env, CI: options.ci ? 'true' : '', TERM: options.term ?? 'xterm' },
    timeout: 10000,
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

describe('doctor progress', () => {
  it('uses ASCII frames and dim text, then clears before the report', () => {
    const output = runProgress()
    assert.ok(output.includes('\u001B[2m| Checking repository and external links...\u001B[0m'))
    assert.ok([...output].every(character => character.codePointAt(0) < 128))
    assert.ok(!output.includes('\u001B[36m'))
    assert.ok(output.endsWith('\r\u001B[2KLinks: report\n'))
  })

  it('keeps redirected, CI, and dumb-terminal output free of progress', () => {
    for (const options of [{ tty: false }, { ci: true }, { term: 'dumb' }]) {
      assert.equal(runProgress(options), 'Links: report\n')
    }
  })

  it('keeps narrow terminal frames on one line and supports no color', () => {
    const output = runProgress({ columns: 12, color: false })
    assert.equal(stripVTControlCharacters(output), output.replaceAll('\u001B[2K', ''))
    const frames = output.split('\r\u001B[2K').slice(1, -1)
    assert.ok(frames.length > 1)
    assert.ok(frames.every(frame => frame.length <= 11))
  })
})
