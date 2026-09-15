import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

/**
 * Compact JSDoc was proposed to reduce visual bulk around simple declarations. Valid JavaScript and a
 * successful JSDoc invocation do not imply correct metadata, so these arms pin what the PRODUCTION
 * parser actually preserves — the supported subset documented in `.github/CODING_GUIDELINES.md` §12.
 *
 * Every arm compares a one-line form against its multiline control AND asserts the complete metadata
 * explicitly. Equality alone is not enough: two doclets that have both lost their default and their
 * type are equal to each other, so a `toEqual` pair passes while the thing under test is gone. Each
 * arm therefore names the type and the default it expects before comparing.
 *
 * `check-jsdoc-types.mjs` does not cover this: it validates type EXPRESSIONS, not preservation of
 * defaults, descriptions or access.
 *
 * **Every case lives in ONE fixture parsed ONCE.** Parsing per arm meant fourteen `jsdoc` subprocess
 * spawns inside a four-worker unit tier. One parse is also the better instrument: every row is read
 * out of the same parser invocation, so no row can differ from another by parser state.
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
    arrTightCompact   : `/** @member {String[]} arrTightCompact=['alpha','beta'] */`,
    arrTightMultiline : `/**\n     * @member {String[]} arrTightMultiline=['alpha','beta']\n     */`,
    objTightCompact   : `/** @member {Object} objTightCompact={a:1} */`,
    objTightMultiline : `/**\n     * @member {Object} objTightMultiline={a:1}\n     */`,

    // The whitespace family. None of these involves a comma — that was the misreading this file's
    // earlier version encoded.
    strSpaceCompact  : `/** @member {String} strSpaceCompact='hello world' */`,
    strSpaceMultiline: `/**\n     * @member {String} strSpaceMultiline='hello world'\n     */`,
    objSpaceMultiline: `/**\n     * @member {Object} objSpaceMultiline={a: 1}\n     */`,
    arrSpaceMultiline: `/**\n     * @member {String[]} arrSpaceMultiline=['one two']\n     */`,

    // The escape hatch: a separate @default line preserves whatever the inline form truncates.
    defaultTagStr: `/**\n     * @member {String} defaultTagStr\n     * @default 'hello world'\n     */`,
    defaultTagArr: `/**\n     * @member {String[]} defaultTagArr\n     * @default ['alpha', 'beta']\n     */`,
    defaultTagObj: `/**\n     * @member {Object} defaultTagObj\n     * @default {a: 1}\n     */`
};

let doclets;

/**
 * @param {String} name The documented member's name.
 * @returns {Object} `{defaultvalue, description, access, type}` as the pipeline reports them.
 */
const reported = name => {
    const member = doclets.find(doclet => doclet.kind === 'member' && doclet.name === name);

    return {
        access      : member?.access       ?? null,
        defaultvalue: member?.defaultvalue ?? null,
        description : member?.description  ?? null,
        type        : member?.type?.names  ?? null
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

        // Non-vacuity: a fixture that produced no member doclets would make every comparison below
        // pass by comparing two empty objects.
        expect(doclets.filter(doclet => doclet.kind === 'member').length)
            .toBeGreaterThanOrEqual(Object.keys(CASES).length)
    });

    test.afterAll(() => {
        tempDir && fs.rmSync(tempDir, {recursive: true, force: true})
    });

    test('SUPPORTED: a whitespace-free primitive default is identical one-line and multiline', () => {
        const compact = reported('primitiveCompact');

        expect(compact.type).toEqual(['String']);
        expect(compact.defaultvalue).toBe(`'neo'`);
        expect(compact.description).toBeNull();
        expect(compact).toEqual(reported('primitiveMultiline'))
    });

    test('SUPPORTED: a null default is identical one-line and multiline, with its type intact', () => {
        const compact = reported('nullCompact');

        // The type assertion is the load-bearing one. `null === null` is satisfied by a doclet that
        // lost BOTH its default and its type, so equality alone cannot see that regression.
        expect(compact.type).toEqual(['Object', 'null']);
        expect(compact.defaultvalue).toBeNull();
        expect(compact).toEqual(reported('nullMultiline'))
    });

    test('SUPPORTED: a trailing description is identical one-line and multiline', () => {
        const compact = reported('describedCompact');

        expect(compact.type).toEqual(['Number']);
        expect(compact.defaultvalue).toBe(3);
        expect(compact.description).toBe('The size');
        expect(compact).toEqual(reported('describedMultiline'))
    });

    test('SUPPORTED: whitespace-free array and object defaults keep their value in both layouts', () => {
        const arr = reported('arrTightCompact'),
              obj = reported('objTightCompact');

        // The closing `]` is GONE, in both layouts. JSDoc's optional-parameter syntax is
        // `[name=default]`, so a value whose last character is `]` has it consumed as that marker's
        // close. `{a:1}` keeps both braces because no such syntax claims them. This is why the arm
        // asserts the measured string rather than the authored one — and why asserting only
        // `toEqual(multiline)` hid it: both layouts are damaged identically.
        expect(arr.defaultvalue).toBe(`['alpha','beta'`);
        expect(arr.description).toBeNull();
        expect(arr).toEqual(reported('arrTightMultiline'));

        expect(obj.defaultvalue).toBe(`{a:1}`);
        expect(obj.description).toBeNull();
        expect(obj).toEqual(reported('objTightMultiline'))
    });

    test('FORBIDDEN: a second tag on one line becomes description text and the access is LOST', () => {
        expect(reported('taggedMultiline').access).toBe('protected');

        expect(reported('taggedCompact').access).toBeNull();
        expect(reported('taggedCompact').description).toContain('@protected')
    });

    test('FORBIDDEN: a one-line array default empties the GENERATED default', () => {
        // `generateDocsJson` re-extracts array/object defaults from the comment text between `=` and
        // the next newline, and a one-line block HAS no next newline. `indexOf` returns -1 and
        // `substr(0, -1)` is the empty string.
        expect(reported('arrTightCompact').defaultvalue).not.toBeNull();

        const comment = CASES.arrTightCompact;
        let   value   = comment.substr(comment.indexOf('=') + 1);

        expect(value.substr(0, value.indexOf('\n')), 'a one-line array default generates as empty').toBe('')
    });

    test('THE REAL RULE: an inline default truncates at the first WHITESPACE — no comma required', () => {
        // The earlier version of this file blamed the comma. It is the whitespace: a plain String
        // with a space and no brackets at all truncates identically, in BOTH layouts.
        const compactStr   = reported('strSpaceCompact'),
              multilineStr = reported('strSpaceMultiline');

        expect(compactStr.defaultvalue).toBe(`'hello`);
        expect(compactStr.description).toBe(`world'`);
        expect(multilineStr.defaultvalue).toBe(`'hello`);
        expect(multilineStr.description).toBe(`world'`);

        // A space after an object's colon: no comma anywhere.
        expect(reported('objSpaceMultiline').defaultvalue).toBe(`{a:`);
        expect(reported('objSpaceMultiline').description).toBe(`1}`);

        // A single quoted array element containing a space: no comma anywhere.
        expect(reported('arrSpaceMultiline').defaultvalue).toBe(`['one`);
        expect(reported('arrSpaceMultiline').description).toBe(`two']`)
    });

    test('non-vacuity: removing the whitespace removes the truncation, in both layouts', () => {
        // Proves the whitespace is the variable rather than the brackets or the quoting.
        expect(reported('arrTightCompact').description).toBeNull();
        expect(reported('arrTightMultiline').description).toBeNull();
        expect(reported('objTightMultiline').description).toBeNull()
    });

    test('THE ESCAPE HATCH: a separate @default line preserves whitespace the inline form destroys', () => {
        // Same values that truncate above, written as their own tag, survive intact — including the
        // array and object forms. This is what an author with a whitespace-bearing default must use.
        const str = reported('defaultTagStr'),
              arr = reported('defaultTagArr'),
              obj = reported('defaultTagObj');

        expect(str.defaultvalue).toBe(`'hello world'`);
        expect(str.description).toBeNull();
        expect(str.type).toEqual(['String']);

        expect(arr.defaultvalue).toBe(`['alpha', 'beta']`);
        expect(arr.description).toBeNull();

        expect(obj.defaultvalue).toBe(`{a: 1}`);
        expect(obj.description).toBeNull()
    })
});
