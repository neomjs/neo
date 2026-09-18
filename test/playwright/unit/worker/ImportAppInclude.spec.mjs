import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * @summary `Neo.worker.App#importApp()` reaches every app entry through one lazy webpack context, and its
 * `webpackInclude` decides which entries that context holds.
 *
 * A magic comment has no runtime to exercise: webpack reads it at build time and tests it against each module's
 * absolute path. So these arms read the comment from the source and test it the way webpack does. An entry the
 * include misses gets no chunk, and a bundled App worker fails on it with `Cannot find module`.
 *
 * The root is synthetic on purpose: a checkout whose own path runs through a folder named `apps`, `examples` or
 * `src` would match every entry below it, whatever the include says about the entries themselves.
 */
const source  = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../src/worker/App.mjs'), 'utf8'),
      literal = source.match(/importApp\(path\)[\s\S]*?webpackInclude: (\/.+\/)\s*\*\//)[1],
      include = new RegExp(literal.slice(1, -1)),
      root    = '/opt/neo';

test.describe('Neo.worker.App — the app entries importApp() can reach', () => {
    for (const entry of ['docs/app.mjs', 'apps/portal/app.mjs', 'examples/button/base/app.mjs', 'src/component/app.mjs']) {
        test(`${entry} is in the context`, () => {
            expect(include.test(`${root}/${entry}`)).toBe(true)
        })
    }

    test('an app.mjs at the root of the tree is not', () => {
        expect(include.test(`${root}/app.mjs`)).toBe(false)
    })
});
