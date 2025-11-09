import assert from 'assert';
import { combineOutput, parseAuthOutput, parseVersionOutput, interpretExecError } from '../services/healthHelpers.mjs';

function run() {
  // Auth parsing
  let out = combineOutput('Logged in to github.com as someone', '');
  let res = parseAuthOutput(out);
  assert.strictEqual(res.authenticated, true, 'Should detect logged in');

  out = combineOutput('', 'Logged in to github.com as someone');
  res = parseAuthOutput(out);
  assert.strictEqual(res.authenticated, true, 'Should detect logged in from stderr');

  out = combineOutput('', 'Not logged in');
  res = parseAuthOutput(out);
  assert.strictEqual(res.authenticated, false, 'Should detect not logged in');

  // Version parsing
  let v = parseVersionOutput('gh version 2.30.0', '2.0.0');
  assert.strictEqual(v.installed, true);
  assert.strictEqual(v.versionOk, true);

  v = parseVersionOutput('gh version 1.9.0', '2.0.0');
  assert.strictEqual(v.installed, true);
  assert.strictEqual(v.versionOk, false);

  v = parseVersionOutput('', '2.0.0');
  assert.strictEqual(v.installed, false);

  // interpretExecError
  assert.strictEqual(interpretExecError({ code: 'ENOENT' }), true);
  assert.strictEqual(interpretExecError(new Error('spawn gh ENOENT')), true);
  assert.strictEqual(interpretExecError(null), false);

  console.log('OK: healthHelpers tests passed');
}

run();
