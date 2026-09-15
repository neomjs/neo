import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

/**
 * Compact JSDoc was proposed to reduce visual bulk around simple declarations. Valid JavaScript and a
 * successful JSDoc invocation do not imply correct metadata, so these arms pin what the PRODUCTION
 * parser actually preserves — the supported subset documented in `.github/CODING_GUIDELINES.md` §12.
 *
 * Every arm compares a one-line form against its multiline control. Identical output is what makes a
 * form supported; divergence is what makes it forbidden. Asserting the compact form alone would pass
 * while the convention silently lost a default or an access tag, which is the whole failure class.
 *
 * `check-jsdoc-types.mjs` does not cover this: it validates type EXPRESSIONS, not preservation of
 * defaults, descriptions or access.
 *
 * **Every case lives in ONE fixture parsed ONCE.** The first version parsed per arm — fourteen `jsdoc`
 * subprocess spawns inside a four-worker unit tier, which is real contention for a suite whose vdom
 * wedge guard trips at 5000ms. One parse is also the better instrument: every row is read out of the
 * same parser invocation, so no row can differ from another by parser state.
 */
const CASES = {
    primitiveCompact  : `/** @member {String} primitiveCompact='neo' */`,
    primitiveMultiline: `/**\n     * @member {String} primitiveMultiline='neo'\n     */`,
    nullCompact       : `/** @member {Object|null} nullCompact=null */`,
    nullMultiline     : `/**\n     * @member {Object|null} nullMultiline=null\n     */`,
    describedCompact  : `/** @member {Number} describedCompact=3 The size */`,
    describedMultiline: `/**\n     * The size\n     * @member {Number} describedMultiline=3\n     */`,
    taggedCompact     : `/** @member {Number} taggedCompact=0 @protected */`,
    taggedMultiline   : `/**\n     * @member {Number} taggedMultiline=0\n     * @protected\n     */`,
    spacedCompact     : `/** @member {String[]} spacedCompact=['alpha', 'beta'] */`,
    spacedMultiline   : `/**\n     * @member {String[]} spacedMultiline=['alpha', 'beta']\n     */`,
    tightCompact      : `/** @member {String[]} tightCompact=['alpha','beta'] */`,
    tightMultiline    : `/**\n     * @member {String[]} tightMultiline=['alpha','beta']\n     */`
};

let doclets;

/**
 * @param {String} name The documented member's name.
 * @returns {Object} `{defaultvalue, description, access}` as the pipeline reports them.
 */
const reported = name => {
    const member = doclets.find(doclet => doclet.kind === 'member' && doclet.name === name);

    return {
        defaultvalue: member?.defaultvalue ?? null,
        description : member?.description  ?? null,
        access      : member?.access       ?? null
    }
};

test.describe('compact JSDoc — what the production doclet pipeline preserves', () => {
    let tempDir;

    test.beforeAll(async () => {
        const {parse} = await import('../../../../buildScripts/docs/docletPipeline/index.mjs');

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-compact-jsdoc-'));

        const file    = path.join(tempDir, 'Probe.mjs'),
              members = Object.entries(CASES)
                  .map(([name, comment]) => `    ${comment}\n    ${name} = null`)
                  .join('\n\n');

        fs.writeFileSync(file, `/** @class Probe */\nclass Probe {\n${members}\n}\n\nexport default Probe;\n`);

        doclets = await parse({
            access        : 'all',
            files         : [file],
            includePattern: '.+\\.(m)js(doc)?$',
            recurse       : true,
            undocumented  : false
        });

        // Non-vacuity: a fixture that produced no member doclets would make every arm below pass by
        // comparing two nulls.
        expect(doclets.filter(doclet => doclet.kind === 'member').length)
            .toBeGreaterThanOrEqual(Object.keys(CASES).length)
    });

    test.afterAll(() => {
        tempDir && fs.rmSync(tempDir, {recursive: true, force: true})
    });

    test('SUPPORTED: a primitive default is identical one-line and multiline', () => {
        expect(reported('primitiveCompact').defaultvalue).toBe(`'neo'`);
        expect(reported('primitiveCompact')).toEqual(reported('primitiveMultiline'))
    });

    test('SUPPORTED: a null default is identical one-line and multiline', () => {
        expect(reported('nullCompact')).toEqual(reported('nullMultiline'))
    });

    test('SUPPORTED: a trailing description is identical one-line and multiline', () => {
        const compact = reported('describedCompact');

        expect(compact.defaultvalue).toBe(3);
        expect(compact.description).toBe('The size');
        expect(compact).toEqual(reported('describedMultiline'))
    });

    test('FORBIDDEN: a second tag on one line becomes description text and the access is LOST', () => {
        // The multiline control is what correct looks like.
        expect(reported('taggedMultiline').access).toBe('protected');

        // The compact form silently loses it — and the tag surfaces as prose instead.
        expect(reported('taggedCompact').access).toBeNull();
        expect(reported('taggedCompact').description).toContain('@protected')
    });

    test('FORBIDDEN: an array default on one line empties the GENERATED default', () => {
        // The parser keeps something, so the divergence is not visible at the doclet layer alone —
        // `generateDocsJson` re-extracts array/object defaults from the comment text between `=` and
        // the next newline, and a one-line block HAS no next newline. `indexOf` returns -1 and
        // `substr(0, -1)` is the empty string.
        expect(reported('tightCompact').defaultvalue).not.toBeNull();

        const comment = CASES.tightCompact;
        let   value   = comment.substr(comment.indexOf('=') + 1);

        expect(value.substr(0, value.indexOf('\n')), 'a one-line array default generates as empty').toBe('')
    });

    test('NOT a compact defect: a space after a comma leaks into the description in BOTH forms', () => {
        // This is the reattribution that matters. The leak was read as a compact-syntax risk; it is
        // the documented multiline convention's behaviour too, and 32 members in `src/` carry it
        // today. Pinning both forms keeps a future compact decision from being blamed for it.
        expect(reported('spacedCompact').defaultvalue).toBe(`['alpha',`);
        expect(reported('spacedCompact').description).toBe(`'beta']`);

        // Same truncation, same leak, in the form the guidelines currently prescribe.
        expect(reported('spacedMultiline').defaultvalue).toBe(`['alpha',`);
        expect(reported('spacedMultiline').description).toBe(`'beta']`)
    });

    test('the comma-space leak disappears without the space, in both forms', () => {
        // Non-vacuity for the arm above: the space is the variable, not the brackets.
        expect(reported('tightCompact').description).toBeNull();
        expect(reported('tightMultiline').description).toBeNull()
    })
});
