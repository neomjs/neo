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

    test('parses ES2025 import attributes (`with {type: \'json\'}`) and produces a module-context chunk', () => {
        const fixture = `import packageJson from '../../../package.json' with {type: 'json'};

const version = packageJson.version;

export default {version};
`;
        const chunks = SourceParser.parse(fixture, 'fixture/import-with.mjs');

        // Success-only oracle: under the old `ecmaVersion: 2022` pin, acorn
        // rejects the `with` keyword and `parse()` falls into the warn-catch
        // branch that returns `[]`. An `Array.isArray(chunks)` assertion alone
        // would pass on BOTH the broken and fixed paths (false-positive). We
        // assert on the artifact only the fixed path produces: one
        // `module-context` chunk (the no-class branch emits exactly one).
        expect(chunks).toHaveLength(1);
        expect(chunks[0].kind).toBe('module-context');
        expect(chunks[0].source).toBe('fixture/import-with.mjs');
        expect(chunks[0].content).toContain("with {type: 'json'}");
    });

    test('parses shebang-prefixed module entry scripts and emits class/method chunks', () => {
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

        // Success-only oracle: shebang-stripping path must yield more than
        // module-context. The class body produces a config chunk and at
        // least one method chunk; a pre-fix parse failure would return [].
        expect(chunks.length).toBeGreaterThan(1);
        const kinds = chunks.map(c => c.kind);
        expect(kinds).toContain('module-context');
        expect(kinds).toContain('class-config');
        const methodChunk = chunks.find(c => c.kind === 'method' || c.type === 'method');
        expect(methodChunk).toBeTruthy();
    });

    test('returns empty array (warn-not-throw) for truly malformed source', () => {
        const fixture = `import x from 'y'; this is not valid javascript {{{`;
        const chunks = SourceParser.parse(fixture, 'fixture/malformed.mjs');

        // Parse failure path: chunks=[] (warning logged, caller continues
        // with empty result rather than crashing the KB sync). The
        // malformed-source contract is preserved across the ecmaVersion
        // bump — only success cases shift; legitimately unparseable input
        // still warns and returns empty.
        expect(chunks).toEqual([]);
    });
});
