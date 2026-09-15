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
 */
const OPTIONS = {
    access        : 'all',
    includePattern: '.+\\.(m)js(doc)?$',
    recurse       : true,
    undocumented  : false
};

let parse, tempDir;

/**
 * @param {String} comment The JSDoc block, verbatim.
 * @param {String} memberName The documented member's name.
 * @returns {Promise<Object>} `{defaultvalue, description, access}` as the pipeline reports them.
 */
const docletFor = async (comment, memberName) => {
    const file = path.join(tempDir, `Probe${Math.random().toString(36).slice(2)}.mjs`);

    fs.writeFileSync(file, `/** @class Probe */\nclass Probe {\n    ${comment}\n    ${memberName} = null\n}\n\nexport default Probe;\n`);

    const docs   = await parse({...OPTIONS, files: [file]}),
          member = docs.find(doclet => doclet.kind === 'member' && doclet.name === memberName);

    fs.rmSync(file);

    return {
        defaultvalue: member?.defaultvalue ?? null,
        description : member?.description  ?? null,
        access      : member?.access       ?? null
    }
};

test.describe('compact JSDoc — what the production doclet pipeline preserves', () => {
    test.beforeAll(async () => {
        ({parse} = await import('../../../../buildScripts/docs/docletPipeline/index.mjs'));
        tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-compact-jsdoc-'))
    });

    test.afterAll(() => {
        tempDir && fs.rmSync(tempDir, {recursive: true, force: true})
    });

    test('SUPPORTED: a primitive default is identical one-line and multiline', async () => {
        const compact   = await docletFor(`/** @member {String} name='neo' */`, 'name'),
              multiline = await docletFor(`/**\n     * @member {String} name='neo'\n     */`, 'name');

        expect(compact).toEqual(multiline);
        expect(compact.defaultvalue).toBe(`'neo'`)
    });

    test('SUPPORTED: a null default is identical one-line and multiline', async () => {
        const compact   = await docletFor(`/** @member {Object|null} data=null */`, 'data'),
              multiline = await docletFor(`/**\n     * @member {Object|null} data=null\n     */`, 'data');

        expect(compact).toEqual(multiline)
    });

    test('SUPPORTED: a trailing description is identical one-line and multiline', async () => {
        const compact   = await docletFor(`/** @member {Number} size=3 The size */`, 'size'),
              multiline = await docletFor(`/**\n     * The size\n     * @member {Number} size=3\n     */`, 'size');

        expect(compact.defaultvalue).toBe(3);
        expect(compact.description).toBe('The size');
        expect(compact).toEqual(multiline)
    });

    test('FORBIDDEN: a second tag on one line becomes description text and the access is LOST', async () => {
        const compact   = await docletFor(`/** @member {Number} count=0 @protected */`, 'count'),
              multiline = await docletFor(`/**\n     * @member {Number} count=0\n     * @protected\n     */`, 'count');

        // The multiline control is what correct looks like.
        expect(multiline.access).toBe('protected');

        // The compact form silently loses it — and the tag surfaces as prose instead.
        expect(compact.access).toBeNull();
        expect(compact.description).toContain('@protected')
    });

    test('FORBIDDEN: an array default on one line empties the GENERATED default', async () => {
        // The parser keeps something, so the divergence is not visible at the doclet layer alone —
        // `generateDocsJson` re-extracts array/object defaults from the comment text between `=` and
        // the next newline, and a one-line block HAS no next newline. `indexOf` returns -1 and
        // `substr(0, -1)` is the empty string.
        const compact = await docletFor(`/** @member {String[]} cls=['alpha','beta'] */`, 'cls');

        expect(compact.defaultvalue).not.toBeNull();

        const generated = (() => {
            const comment = `/** @member {String[]} cls=['alpha','beta'] */`;
            let   value   = comment.substr(comment.indexOf('=') + 1);

            return value.substr(0, value.indexOf('\n'))
        })();

        expect(generated, 'a one-line array default generates as empty').toBe('')
    });

    test('NOT a compact defect: a space after a comma leaks into the description in BOTH forms', async () => {
        // This is the reattribution that matters. The leak was read as a compact-syntax risk; it is
        // the documented multiline convention's behaviour too, and 32 members in `src/` carry it
        // today. Pinning both forms keeps a future compact decision from being blamed for it.
        const compact   = await docletFor(`/** @member {String[]} cls=['alpha', 'beta'] */`, 'cls'),
              multiline = await docletFor(`/**\n     * @member {String[]} cls=['alpha', 'beta']\n     */`, 'cls');

        expect(compact.defaultvalue).toBe(`['alpha',`);
        expect(compact.description).toBe(`'beta']`);

        // Same truncation, same leak, in the form the guidelines currently prescribe.
        expect(multiline.defaultvalue).toBe(`['alpha',`);
        expect(multiline.description).toBe(`'beta']`)
    });

    test('the comma-space leak disappears without the space, in both forms', async () => {
        // Non-vacuity for the arm above: the space is the variable, not the brackets.
        const compact   = await docletFor(`/** @member {String[]} cls=['alpha','beta'] */`, 'cls'),
              multiline = await docletFor(`/**\n     * @member {String[]} cls=['alpha','beta']\n     */`, 'cls');

        expect(compact.description).toBeNull();
        expect(multiline.description).toBeNull()
    })
});
