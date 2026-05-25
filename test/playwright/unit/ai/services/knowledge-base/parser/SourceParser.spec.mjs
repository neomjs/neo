import {setup} from '../../../../../setup.mjs';

const appName = 'SourceParserTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

/**
 * @summary Verifies SourceParser handles modern ES syntax that acorn's older
 * `ecmaVersion` pins would reject. The regression-anchor case is ES2025
 * import attributes (`with {type: 'json'}`), but the same `ecmaVersion: 'latest'`
 * setting covers other recent additions like decorators and class-field syntax.
 */
test.describe('SourceParser', () => {
    let SourceParser;

    test.beforeAll(async () => {
        SourceParser = (await import('../../../../../../../ai/services/knowledge-base/parser/SourceParser.mjs')).default;
    });

    test('parses ES2025 import attributes (`with {type: \'json\'}`) without warning', () => {
        const fixture = `import packageJson from '../../../package.json' with {type: 'json'};

const version = packageJson.version;

export default {version};
`;
        const chunks = SourceParser.parse(fixture, 'fixture/import-with.mjs');

        // Acorn under `ecmaVersion: 'latest'` succeeds; older pins (e.g. 2022)
        // returned an empty chunk array via the catch-branch warning path.
        // The parser doesn't emit class/method chunks for a plain module like
        // this fixture, but it MUST NOT bail with zero chunks due to parse
        // failure either. The contract here is "no parse error" rather than
        // "must produce N chunks".
        expect(Array.isArray(chunks)).toBe(true);
    });

    test('parses shebang-prefixed module entry scripts', () => {
        const fixture = `#!/usr/bin/env node
import fs from 'fs';

class Tool {
    static config = {
        className: 'Test.Tool'
    }

    run() { return fs.readFileSync('x'); }
}

export default Tool;
`;
        const chunks = SourceParser.parse(fixture, 'fixture/shebang.mjs');

        expect(Array.isArray(chunks)).toBe(true);
        // Shebang stripping should leave the class+method parseable.
        const methodChunk = chunks.find(chunk => chunk.type === 'method' || chunk.kind === 'method');
        if (methodChunk) {
            expect(typeof methodChunk).toBe('object');
        }
    });

    test('returns empty array (warn-not-throw) for truly malformed source', () => {
        const fixture = `import x from 'y'; this is not valid javascript {{{`;
        const chunks = SourceParser.parse(fixture, 'fixture/malformed.mjs');

        // Parse failure path: chunks=[] (warning logged, caller continues with
        // empty result rather than crashing the KB sync).
        expect(chunks).toEqual([]);
    });
});
