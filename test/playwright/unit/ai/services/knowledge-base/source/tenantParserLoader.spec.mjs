import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    TENANT_PARSER_ERROR_CODES,
    loadTenantParser,
    resolveTenantParserPath
} from '../../../../../../../ai/services/knowledge-base/source/tenantParserLoader.mjs';

/**
 * The subject is the REFUSALS, not the happy path.
 *
 * This module decides which modules a tenant may cause the server to `import()`, so every assertion
 * below is a containment property rather than a resolution convenience. The one arm that could make
 * the rest vacuous — a valid specifier actually loading — is included as the positive control: a
 * refuser that refuses everything would satisfy every other test in this file.
 *
 * Fixtures are a real directory tree rather than injected seams, because the properties under test
 * are filesystem properties. A mocked `existsSync` proves the branch was taken; it cannot prove that
 * `a/../../x` and `../x` resolve to the same place, or that a symlink defeats a textual prefix check.
 */
test.describe('tenantParserLoader — a tenant names a module BELOW a deployment-pinned root', () => {
    let tmpRoot, root;

    test.beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-parser-'));
        root    = path.join(tmpRoot, 'root');

        fs.mkdirSync(path.join(root, 'nested'), {recursive: true});
        fs.mkdirSync(path.join(tmpRoot, 'outside'), {recursive: true});

        fs.writeFileSync(path.join(root, 'Good.mjs'), 'export default class Good {}\n');
        fs.writeFileSync(path.join(root, 'nested', 'Deep.mjs'), 'export default class Deep {}\n');
        fs.writeFileSync(path.join(root, 'Named.mjs'), 'export class Custom {}\nexport default null;\n');
        fs.writeFileSync(path.join(root, 'NoExport.mjs'), 'export const notAClass = 1;\n');
        fs.writeFileSync(path.join(tmpRoot, 'outside', 'Evil.mjs'), 'export default class Evil {}\n');
    });

    test.afterEach(() => fs.rmSync(tmpRoot, {recursive: true, force: true}));

    test('POSITIVE CONTROL: a valid specifier resolves and loads — without this the refusals are vacuous', async () => {
        expect(resolveTenantParserPath({specifier: 'Good.mjs', root})).toBe(fs.realpathSync(path.join(root, 'Good.mjs')));
        expect(resolveTenantParserPath({specifier: './Good.mjs', root})).toBe(fs.realpathSync(path.join(root, 'Good.mjs')));
        expect(resolveTenantParserPath({specifier: 'nested/Deep.mjs', root})).toBe(fs.realpathSync(path.join(root, 'nested', 'Deep.mjs')));

        const ParserClass = await loadTenantParser({specifier: 'Good.mjs', root});

        expect(ParserClass.name).toBe('Good');
    });

    test('an unset root DISABLES the feature — there is deliberately no default path', () => {
        // The default is '' and that is load-bearing: this is an EXECUTION root, so a fallback here
        // would be a default answer to "which modules may this process import".
        for (const empty of ['', '   ', undefined, null]) {
            let code;
            try { resolveTenantParserPath({specifier: 'Good.mjs', root: empty}) } catch (error) { code = error.code }

            expect(code, JSON.stringify(empty)).toBe(TENANT_PARSER_ERROR_CODES.rootNotSet);
        }
    });

    test('an ABSOLUTE specifier refuses — naming a root is not the tenant\'s to do', () => {
        let code;
        try { resolveTenantParserPath({specifier: path.join(tmpRoot, 'outside', 'Evil.mjs'), root}) } catch (error) { code = error.code }

        expect(code).toBe(TENANT_PARSER_ERROR_CODES.unsafeShape);
    });

    test('escapes refuse AFTER resolution, so a laundered traversal is the same violation as a plain one', () => {
        // A `..` scan is a lexical test of a structural property. `../outside/Evil.mjs` and
        // `nested/../../outside/Evil.mjs` differ textually and are identical in effect — a pattern
        // that catches only the first is the shape of every blind sweep in this codebase's history.
        for (const specifier of ['../outside/Evil.mjs', 'nested/../../outside/Evil.mjs', './nested/../../outside/Evil.mjs']) {
            let code;
            try { resolveTenantParserPath({specifier, root}) } catch (error) { code = error.code }

            expect(code, specifier).toBe(TENANT_PARSER_ERROR_CODES.escapesRoot);
        }
    });

    test('a SYMLINK inside the root pointing outside it refuses — a textual prefix check would pass it', () => {
        fs.symlinkSync(path.join(tmpRoot, 'outside', 'Evil.mjs'), path.join(root, 'Linked.mjs'));

        let code;
        try { resolveTenantParserPath({specifier: 'Linked.mjs', root}) } catch (error) { code = error.code }

        expect(code).toBe(TENANT_PARSER_ERROR_CODES.escapesRoot);
    });

    test('a BARE specifier cannot reach node_modules — contained by resolution, not by a pattern', () => {
        // No bare-specifier guard exists, deliberately. `acorn` and `MyParser.mjs` are textually
        // alike, so any pattern separating them mis-sorts one — a first draft's predicate passed
        // `acorn` through while claiming to block it. Containment is structural instead: the name is
        // resolved against the root (which never consults node_modules) and the LOADER imports an
        // absolute path, so `acorn` lands inside the root and fails as a missing file.
        let code;
        try { resolveTenantParserPath({specifier: 'acorn', root}) } catch (error) { code = error.code }

        expect(code).toBe(TENANT_PARSER_ERROR_CODES.notFound);
    });

    test('a declared-but-missing module is NOT_FOUND, distinct from KB_PARSER_NOT_REGISTERED', () => {
        // The distinction is the whole reason for a separate code. A missing parser today degrades to
        // `raw-text`, which INGESTS SUCCESSFULLY — whole-file chunks, no error, retrieval quietly
        // worse. A configuration defect must not be reportable as a coverage gap.
        let error;
        try { resolveTenantParserPath({specifier: 'Absent.mjs', root}) } catch (caught) { error = caught }

        expect(error.code).toBe(TENANT_PARSER_ERROR_CODES.notFound);
        expect(error.code).not.toBe('KB_PARSER_NOT_REGISTERED');
        expect(error.message).toContain('configuration defect');
    });

    test('loadTenantParser refuses through the same predicate — the boundary is not resolve-only', async () => {
        // The resolver could be correct and the loader still bypass it. Asserted rather than assumed.
        let code;
        try { await loadTenantParser({specifier: '../outside/Evil.mjs', root}) } catch (error) { code = error.code }

        expect(code).toBe(TENANT_PARSER_ERROR_CODES.escapesRoot);
    });

    test('a module exposing no class fails loudly rather than registering undefined', async () => {
        let code;
        try { await loadTenantParser({specifier: 'NoExport.mjs', root}) } catch (error) { code = error.code }

        expect(code).toBe(TENANT_PARSER_ERROR_CODES.noExport);
    });

    test('a named export is taken when the declaration asks for one', async () => {
        const ParserClass = await loadTenantParser({specifier: 'Named.mjs', root, exportName: 'Custom'});

        expect(ParserClass.name).toBe('Custom');
    });

    test('every refusal names its remediation — the failure message is the whole product', () => {
        // A refusal that says only "refused" sends the reader to the source to reason about patterns,
        // which is the activity that produces these defects.
        const cases = [
            [{specifier: 'Good.mjs', root: ''},                    'NEO_KB_TENANT_PARSER_ROOT'],
            [{specifier: '../outside/Evil.mjs', root},             'outside the pinned root'],
            [{specifier: path.join(tmpRoot, 'x.mjs'), root},       'never names a root'],
            [{specifier: 'Absent.mjs', root},                      'fix the declaration or the mount']
        ];

        for (const [args, expected] of cases) {
            let message;
            try { resolveTenantParserPath(args) } catch (error) { message = error.message }

            expect(message, JSON.stringify(args.specifier)).toContain(expected);
        }
    });
});
