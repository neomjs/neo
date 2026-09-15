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
 * @summary The member-default stage from `generateDocsJson.mjs`, replicated line-for-line.
 *
 * Asserting the parser's `defaultvalue` certifies a value the generator then OVERWRITES — which is
 * the failure class this whole file exists for: a valid parse is not correct metadata. For an array
 * or object type the generator re-extracts from the comment text between `=` and the next newline.
 * That repairs the `]` the parser drops, empties a one-line block, and — when there is no `=` at all —
 * takes `indexOf`'s `-1` plus one as zero and publishes the opening comment marker.
 *
 * @param {Object} member
 * @returns {*} What the docs build would publish as this member's default.
 */
const generatedDefault = member => {
    if (member.defaultvalue && member.type?.names) {
        const type = member.type.names[0].toLowerCase();

        if (type.indexOf('array') > -1 || type.indexOf('object') > -1) {
            let value = member.comment.substr(member.comment.indexOf('=') + 1);

            return value.substr(0, value.indexOf('\n'))
        }
    }

    return member.defaultvalue
};

/**
 * @param {String} name The documented member's name.
 * @returns {Object} `{hasDefault, access, defaultvalue, generated, description, type}`.
 */
const reported = name => {
    const member = doclets.find(doclet => doclet.kind === 'member' && doclet.name === name);

    return {
        // PRESENCE, separately from value. `defaultvalue ?? null` cannot tell a documented `=null`
        // from a member carrying no default at all, so a regression that deletes the key satisfies
        // every value assertion. Measured: `=null` yields the key holding null; no default yields no
        // key — so the discriminator is real rather than assumed.
        hasDefault  : member ? ('defaultvalue' in member) : false,
        access      : member?.access       ?? null,
        defaultvalue: member?.defaultvalue ?? null,
        generated   : member ? generatedDefault(member)   : null,
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

        // PRESENCE first. `toBeNull()` plus a type check is still satisfied by a doclet whose
        // `defaultvalue` key was deleted outright — the value reads null either way. Only the key
        // tells a documented `=null` apart from a member with no default at all.
        expect(compact.hasDefault, 'the default is present, not merely null-valued').toBe(true);
        expect(compact.type).toEqual(['Object', 'null']);
        expect(compact.defaultvalue).toBeNull();
        expect(compact.generated).toBeNull();
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

        // At the PARSER the closing `]` is gone in both layouts: JSDoc's optional-parameter syntax is
        // `[name=default]`, so a value ending in `]` has it consumed as that marker's close. `{a:1}`
        // keeps its braces because no syntax claims them.
        expect(arr.defaultvalue).toBe(`['alpha','beta'`);
        expect(obj.defaultvalue).toBe(`{a:1}`);

        // At the GENERATOR the multiline form is repaired — re-extraction from the comment restores
        // the bracket. THIS is what ships, and it is why the multiline inline form is the supported
        // one for arrays and objects.
        expect(reported('arrTightMultiline').generated).toBe(`['alpha','beta']`);
        expect(reported('objTightMultiline').generated).toBe(`{a:1}`);

        expect(arr.description).toBeNull();
        expect(obj.description).toBeNull()
    });

    test('FORBIDDEN: a second tag on one line becomes description text and the access is LOST', () => {
        expect(reported('taggedMultiline').access).toBe('protected');

        expect(reported('taggedCompact').access).toBeNull();
        expect(reported('taggedCompact').description).toContain('@protected')
    });

    test('FORBIDDEN: a one-line array or object default empties the GENERATED default', () => {
        // Run through the real generator stage rather than a copied substring expression. A one-line
        // block has no newline after `=`, so `indexOf` returns -1 and `substr(0, -1)` is empty — the
        // member documents with no default while the PARSER still reports one, which is exactly the
        // divergence an equality-only or parser-only assertion cannot see.
        expect(reported('arrTightCompact').defaultvalue).not.toBeNull();
        expect(reported('arrTightCompact').generated, 'a one-line array generates empty').toBe('');
        expect(reported('objTightCompact').generated, 'a one-line object generates empty').toBe('')
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

    test('THE ESCAPE HATCH is STRING-ONLY: a separate @default preserves whitespace a String cannot express inline', () => {
        const str = reported('defaultTagStr');

        expect(str.type).toEqual(['String']);
        expect(str.hasDefault).toBe(true);
        expect(str.defaultvalue).toBe(`'hello world'`);
        expect(str.generated, 'a String default is not re-extracted, so it survives').toBe(`'hello world'`);
        expect(str.description).toBeNull()
    });

    test('THE TRAP: a separate @default on an array or object publishes `/**` as the default', () => {
        // This arm exists because an earlier version of §12 recommended exactly this form. It parses
        // perfectly — and that is the trap, because the generator then overwrites it.
        //
        // For an array/object type the generator re-extracts from the comment between `=` and the next
        // newline. A separate `@default` line contains NO `=`, so `indexOf` returns -1, `-1 + 1` is 0,
        // and `substr(0)` takes the comment from its first character — up to the first newline, which
        // is the opening `/**`.
        const arr = reported('defaultTagArr'),
              obj = reported('defaultTagObj');

        // The parser is entirely happy. Certifying here is what made the wrong rule look verified.
        expect(arr.defaultvalue).toBe(`['alpha', 'beta']`);
        expect(obj.defaultvalue).toBe(`{a: 1}`);

        // What actually ships.
        expect(arr.generated, 'the array default publishes as the comment marker').toBe('/**');
        expect(obj.generated, 'the object default publishes as the comment marker').toBe('/**')
    })
});
