import {test, expect}                                             from '@playwright/test';
import {spawnSync}                                                from 'node:child_process';
import path                                                       from 'node:path';
import {fileURLToPath}                                            from 'node:url';
import {describeScan, findUnparseableTypes, extractType, inScope} from '../../../../../../buildScripts/util/check-jsdoc-types.mjs';

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../buildScripts/util/check-jsdoc-types.mjs');

/**
 * Self-test for the JSDoc-type lint: the mechanical gate that stops TS-like type expressions the
 * docs build (the jsdoc engine → catharsis) cannot parse from breaking `npm run generate-docs-json` (the last
 * `build all` step) + the docs app. Verifies it flags the build-breaking no-space record-union (+ malformed
 * types), passes the catharsis-valid spaced / parenthesized / plain / top-level-union forms, scans only
 * `/**` doc blocks (not `/*` or `//`), and scopes to the authored-source surface (src/ai/examples/apps/docs-app) —
 * intentionally broader than the docs build (unparseable JSDoc is a defect anywhere, not only where it parses today).
 */
const block = (...lines) => ['/**', ...lines.map(l => ' * ' + l), ' */'].join('\n');

test.describe('check-jsdoc-types guard', () => {
    test('flags a bare union in a record value with no space after the colon (the build-breaker)', () => {
        const hits = findUnparseableTypes(block('@returns {{layout:Object|null, errors:String[]}}'));

        expect(hits.map(h => h.line)).toEqual([2]);
        expect(hits[0].tag).toBe('returns');
        expect(hits[0].expr).toBe('{layout:Object|null, errors:String[]}')
    });

    test('passes the same union when spaced or parenthesized (the catharsis-valid forms)', () => {
        expect(findUnparseableTypes(block('@returns {{layout: Object|null, errors: String[]}}'))).toEqual([]);
        expect(findUnparseableTypes(block('@returns {{layout:(Object|null), errors:String[]}}'))).toEqual([])
    });

    test('passes plain / array / generic / top-level-union types', () => {
        // a top-level `{Object|null}` union is valid — only a bare union INSIDE a record value breaks
        expect(findUnparseableTypes(block(
            '@param {String} a',
            '@param {String[]} b',
            '@param {Array<String>} c',
            '@returns {Object|null}'
        ))).toEqual([])
    });

    test('scans only /** doc blocks — ignores /* block comments and // lines', () => {
        // sitemap-style: a malformed type inside a single-star /* block is not a build input → not flagged
        expect(findUnparseableTypes(['/*', ' * @member {String[}', ' */'].join('\n'))).toEqual([]);
        expect(findUnparseableTypes('// @returns {Object|null|}')).toEqual([])
    });

    test('flags a malformed type INSIDE a /** doc block', () => {
        expect(findUnparseableTypes(block('@member {String[}')).map(h => h.line)).toEqual([2])
    });

    test('extractType returns the inner type expression (tag braces stripped)', () => {
        const record = ' * @returns {{a:String}}';
        expect(extractType([record], 0, record.indexOf('{'))).toBe('{a:String}');

        const scalar = ' * @param {String} name';
        expect(extractType([scalar], 0, scalar.indexOf('{'))).toBe('String')
    });

    test('inScope covers the authored-source surface (src/ai/examples/apps/docs-app), broader than the docs build', () => {
        expect(inScope('src/dashboard/DockZoneModel.mjs')).toBe(true);
        expect(inScope('ai/WriteGuard.mjs')).toBe(true);
        expect(inScope('examples/dashboard/dock/MainContainer.mjs')).toBe(true);
        expect(inScope('docs/app/view/Main.mjs')).toBe(true);
        expect(inScope('apps/portal/view/Main.mjs')).toBe(true);
        expect(inScope('apps/ai/view/Main.mjs')).toBe(true); // ALL apps, not only docs-build-configured ones

        // out of scope: build scripts, tests, underscore aggregators, the config overlays, non-.mjs
        expect(inScope('buildScripts/util/check-jsdoc-types.mjs')).toBe(false);
        expect(inScope('test/playwright/unit/foo.spec.mjs')).toBe(false);
        expect(inScope('src/core/_export.mjs')).toBe(false);
        expect(inScope('ai/config.mjs')).toBe(false);
        expect(inScope('ai/mcp/server/memory-core/config.mjs')).toBe(false);
        expect(inScope('README.md')).toBe(false)
    })
});

test.describe('the success receipt states the scope it read', () => {
    // This line gets QUOTED — into pull-request evidence sections, by readers who did not run it and
    // have none of the surrounding context. A bare count then reads as coverage of THEIR diff.

    test('a default run names the scope, not only a count', () => {
        const {scope, scanned} = describeScan({supplied: 0, offered: 2048, admitted: 2048, read: 2048});

        expect(scanned).toBe('2048 file(s) read');
        expect(scope).toContain('docs-build parse scope');
        expect(scope).toContain('src')
    });

    test('CONTROL: a run that read NONE of the supplied files is distinguishable from one that read all', () => {
        // The arm that stops "mentions a scope" being satisfiable by prose. Both runs exit 0 and both
        // report zero unparseable types; only the counts separate "I checked your files" from "I
        // checked none of them".
        const none = describeScan({supplied: 2, offered: 2, admitted: 0, read: 0}),
              all  = describeScan({supplied: 2, offered: 2, admitted: 2, read: 2});

        expect(none.scanned).toBe('0 of 2 supplied file(s) read');
        expect(all.scanned).toBe('2 of 2 supplied file(s) read');
        expect(none.scanned).not.toBe(all.scanned)
    });

    test('a partially-dropped set says so — the scope filter is otherwise silent', () => {
        expect(describeScan({supplied: 7, offered: 7, admitted: 3, read: 3}).scanned).toBe('3 of 7 supplied file(s) read');
    });

    test('an ADMITTED file that could not be opened is never counted as read', () => {
        // Selection and IO diverge, so two counts cannot describe the run. A file admitted by scope and
        // then failing to open warns on one line and is skipped on the next; reporting the ADMITTED
        // count as the scanned one is a green claim about a file nobody opened — this checker's own
        // defect, committed inside the fix for it.
        expect(describeScan({supplied: 1, offered: 1, admitted: 1, read: 0}).scanned)
            .toBe('0 of 1 supplied file(s) read, 1 unreadable');

        expect(describeScan({supplied: 0, offered: 9, admitted: 9, read: 7}).scanned)
            .toBe('7 file(s) read, 2 unreadable')
    });

    test('CONTROL: a fully-read run says nothing about unreadable files', () => {
        // Without this, "names the unreadable count" is equally consistent with a suffix that is always
        // present and therefore carries no information.
        expect(describeScan({supplied: 2, offered: 2, admitted: 2, read: 2}).scanned).not.toContain('unreadable')
    });

    test('the CLI actually emits it — a correct formatter proves nothing on its own', () => {
        // Without this, the arms above pin a function `main()` might never call.
        const result = spawnSync('node', [scriptPath, 'package.json'], {encoding: 'utf8'}),
              output = (result.stdout || '') + (result.stderr || '');

        expect(output).toContain('0 of 1 supplied file(s) read');
        expect(output).toContain('docs-build parse scope')
    });

    test('the CLI does not claim to have read a missing in-scope file', () => {
        // The reviewer falsifier, committed. `src/…` is in scope, so the path is admitted and then
        // fails to open — previously reported as `1 of 1 supplied file(s) scanned`, exit 0.
        const result = spawnSync('node', [scriptPath, 'src/doesNotExist17435.mjs'], {encoding: 'utf8'}),
              output = (result.stdout || '') + (result.stderr || '');

        expect(output).toContain('could not read');
        expect(output).toContain('0 of 1 supplied file(s) read, 1 unreadable');
        expect(output).not.toContain('1 of 1 supplied file(s) read,  0 unparseable')
    });

    test('a failure summary names the scope too — a violation list is quoted as often as a green line', () => {
        const result = spawnSync('node', [scriptPath, '--quiet', 'src/Neo.mjs'], {encoding: 'utf8'}),
              output = (result.stdout || '') + (result.stderr || '');

        expect(output).toContain('docs-build parse scope')
    })
});
