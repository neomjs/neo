import {test, expect}                                  from '@playwright/test';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir}                                        from 'node:os';
import path                                            from 'node:path';
import {findBridgeScriptRoot}                          from '../../findBridgeScriptRoot.mjs';

/**
 * Coverage for the Bridge working-directory derivation the Playwright fixture owes `spawnBridge`.
 *
 * The contract: a returned directory has been CONFIRMED to declare the script, so `npm run <script>`
 * resolves there; a directory that merely looks like a project root is not an answer. `null` is a
 * real result the caller acts on — it leaves the cwd unassigned so the spawn refuses by name.
 */
const SCRIPT = 'ai:server-neural-link';

/**
 * @param {Object} tree Relative dir -> package.json contents (or null to create the dir bare).
 * @returns {String} The temp root.
 */
function buildTree(tree) {
    const root = mkdtempSync(path.join(tmpdir(), 'bridge-root-'));

    for (const [relative, manifest] of Object.entries(tree)) {
        const dir = path.join(root, relative);

        mkdirSync(dir, {recursive: true});

        if (manifest !== null) writeFileSync(path.join(dir, 'package.json'), manifest)
    }

    return root
}

test.describe('test/playwright/findBridgeScriptRoot — validated Bridge cwd derivation', () => {
    const roots = [];

    test.afterAll(() => roots.forEach(root => rmSync(root, {force: true, recursive: true})));

    const make = tree => { const root = buildTree(tree); roots.push(root); return root };

    test('returns the ancestor that declares the script', () => {
        const root = make({
            '.'              : JSON.stringify({scripts: {[SCRIPT]: 'node ./run.mjs'}}),
            'test/playwright': null
        });

        expect(findBridgeScriptRoot(path.join(root, 'test/playwright'), SCRIPT)).toBe(root)
    });

    test('a package.json WITHOUT the script is not an answer — the walk continues past it', () => {
        const root = make({
            '.'             : JSON.stringify({scripts: {[SCRIPT]: 'node ./run.mjs'}}),
            'packages/inner': JSON.stringify({name: 'inner', scripts: {build: 'tsc'}})
        });

        // The nearer manifest looks exactly like a project root and owns nothing relevant. Returning
        // it is the defect this function exists to prevent: `npm run` there exits non-zero, and the
        // caller sees a distant ENOENT instead of the named refusal.
        expect(findBridgeScriptRoot(path.join(root, 'packages/inner'), SCRIPT)).toBe(root)
    });

    test('the NEAREST declaring ancestor wins over a further one', () => {
        const root = make({
            '.'            : JSON.stringify({scripts: {[SCRIPT]: 'node ./outer.mjs'}}),
            'nested'       : JSON.stringify({scripts: {[SCRIPT]: 'node ./inner.mjs'}}),
            'nested/deeper': null
        });

        expect(findBridgeScriptRoot(path.join(root, 'nested/deeper'), SCRIPT)).toBe(path.join(root, 'nested'))
    });

    test('returns null when no ancestor declares the script', () => {
        const root = make({'.': JSON.stringify({name: 'unrelated'}), 'a/b': null});

        expect(findBridgeScriptRoot(path.join(root, 'a/b'), SCRIPT)).toBeNull()
    });

    test('a malformed manifest does not end the walk', () => {
        const root = make({
            '.'     : JSON.stringify({scripts: {[SCRIPT]: 'node ./run.mjs'}}),
            'broken': '{ this is not json'
        });

        expect(findBridgeScriptRoot(path.join(root, 'broken'), SCRIPT)).toBe(root)
    });

    test('an empty script value is not a declaration', () => {
        const root = make({'.': JSON.stringify({scripts: {[SCRIPT]: ''}}), 'x': null});

        expect(findBridgeScriptRoot(path.join(root, 'x'), SCRIPT)).toBeNull()
    });

    test('this checkout resolves to a root that really declares the script', async () => {
        const {default: pkg} = await import(
            path.join(findBridgeScriptRoot(path.dirname(new URL(import.meta.url).pathname), SCRIPT), 'package.json'),
            {with: {type: 'json'}}
        );

        // The positive control for the walk itself: run against the real tree rather than a fixture,
        // so a derivation that only works on synthetic trees cannot pass this file.
        expect(pkg.scripts[SCRIPT]).toBeTruthy()
    })
});
