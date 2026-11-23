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
      exclude = new RegExp(source.match(/importApp\(path\)[\s\S]*?webpackExclude: (\/.+\/)\s*\*\//)[1].slice(1, -1)),
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
    });

    test('protected Windows volume directories are excluded before fs.stat (#6619)', () => {
        expect(exclude.test('D:\\System Volume Information')).toBe(true);
        expect(exclude.test('D:\\$RECYCLE.BIN')).toBe(true);
        expect(exclude.test('D:\\apps\\my-app')).toBe(false)
    })
});

/**
 * @summary `webpackExclude` in `importApp()` must admit the app tree of a package resolved through a pnpm store.
 *
 * A package resolved through a pnpm store keeps its real path under
 * `node_modules/.pnpm/neo.mjs@<version>/node_modules/neo.mjs/`, so the exclude must admit that path to the package's
 * own apps while every other `node_modules` tree stays out. webpack tests the exclude against each walked entry's
 * absolute path, and it also tests directories while walking, so the apps directory itself is checked too.
 */
test.describe('Neo.worker.App — importApp() exclude across install layouts (#20717)', () => {
    test('a package app under a plain node_modules tree is kept', () => {
        expect(exclude.test('/ws/node_modules/neo.mjs/apps/portal/app.mjs')).toBe(false)
    });

    test('a package app under a pnpm store path is kept', () => {
        expect(exclude.test('/ws/node_modules/.pnpm/neo.mjs@1.0.0/node_modules/neo.mjs/apps/portal/app.mjs')).toBe(false)
    });

    test('the apps directory under a pnpm store path is kept', () => {
        expect(exclude.test('/ws/node_modules/.pnpm/neo.mjs@1.0.0/node_modules/neo.mjs/apps')).toBe(false)
    });

    test('a pnpm store path with a peer suffix (underscore) is kept', () => {
        expect(exclude.test('/ws/node_modules/.pnpm/neo.mjs@13.4.0_webpack@5.99.0/node_modules/neo.mjs/apps/portal/app.mjs')).toBe(false)
    });

    test('a pnpm store path with a peer suffix (parentheses) is kept', () => {
        expect(exclude.test('/ws/node_modules/.pnpm/neo.mjs@13.4.0(webpack@5.99.0)/node_modules/neo.mjs/apps/portal/app.mjs')).toBe(false)
    });

    test('a pnpm store path with Windows separators is kept', () => {
        expect(exclude.test('C:\\ws\\node_modules\\.pnpm\\neo.mjs@1.0.0\\node_modules\\neo.mjs\\apps\\portal\\app.mjs')).toBe(false)
    });

    test('a foreign dependency under node_modules is excluded', () => {
        expect(exclude.test('/ws/node_modules/other/apps/x/app.mjs')).toBe(true)
    });

    test('a foreign entry in the pnpm store is excluded', () => {
        expect(exclude.test('/ws/node_modules/.pnpm/other@1.0.0/node_modules/other/apps/x/app.mjs')).toBe(true)
    });

    test('a dependency nested inside the stored package is excluded', () => {
        expect(exclude.test('/ws/node_modules/.pnpm/neo.mjs@1.0.0/node_modules/neo.mjs/node_modules/other/apps/x/app.mjs')).toBe(true)
    })
});
