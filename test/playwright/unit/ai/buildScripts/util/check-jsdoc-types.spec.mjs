import {test, expect}                            from '@playwright/test';
import {findUnparseableTypes, extractType, inScope} from '../../../../../../buildScripts/util/check-jsdoc-types.mjs';

/**
 * Self-test for the JSDoc-type lint: the mechanical gate that stops TS-like type expressions the
 * docs build (jsdoc-x → catharsis) cannot parse from breaking `npm run generate-docs-json` (the last
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
