import { test, expect } from '@playwright/test';
import { combineOutput, parseAuthOutput, parseVersionOutput, interpretExecError } from '../../../../ai/mcp/server/github-workflow/services/healthHelpers.mjs';

test.describe('healthHelpers', () => {
  test('parseAuthOutput handles stdout and stderr', async () => {
    let out = combineOutput('Logged in to github.com as someone', '');
    let res = parseAuthOutput(out);
    expect(res.authenticated).toBe(true);

    out = combineOutput('', 'Logged in to github.com as someone');
    res = parseAuthOutput(out);
    expect(res.authenticated).toBe(true);

    out = combineOutput('', 'Not logged in');
    res = parseAuthOutput(out);
    expect(res.authenticated).toBe(false);
  });

  test('parseVersionOutput', async () => {
    let v = parseVersionOutput('gh version 2.30.0', '2.0.0');
    expect(v.installed).toBe(true);
    expect(v.versionOk).toBe(true);

    v = parseVersionOutput('gh version 1.9.0', '2.0.0');
    expect(v.installed).toBe(true);
    expect(v.versionOk).toBe(false);

    v = parseVersionOutput('', '2.0.0');
    expect(v.installed).toBe(false);
  });

  test('interpretExecError', async () => {
    expect(interpretExecError({ code: 'ENOENT' })).toBe(true);
    expect(interpretExecError(new Error('spawn gh ENOENT'))).toBe(true);
    expect(interpretExecError(null)).toBe(false);
  });
});
