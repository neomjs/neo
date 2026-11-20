import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {declaredPackageRoots} from '../../../../../buildScripts/util/declaredPackageRoots.mjs';
import {themeCssRoots}        from '../../../../../buildScripts/util/themeCssRoots.mjs';

/**
 * @summary Pins the one list of theme source roots that build-themes, create-theme and watch-themes share:
 * override order, the Engine-only case, and the checks a declared `neo.css` root passes.
 */
test.describe('buildScripts/util/themeCssRoots', () => {
    const roots = [];

    function workspace(name, dependencies, packages={}) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-roots-'));

        roots.push(root);
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({name, dependencies}));

        Object.entries(packages).forEach(([packageName, manifest]) => {
            const packageRoot = path.join(root, 'node_modules', packageName);

            fs.mkdirSync(path.join(packageRoot, 'themes/src'), {recursive: true});
            fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({name: packageName, ...manifest}))
        });

        return root
    }

    test.afterAll(() => {
        roots.forEach(root => fs.rmSync(root, {force: true, recursive: true}))
    });

    test('a workspace layers engine, declared packages by name, then its own sources', () => {
        const root = workspace('demo-workspace', {'neo.mjs': '1.0.0', 'z-skin': '1.0.0', '@acme/grid-ext': '1.0.0', 'plain-pkg': '1.0.0'}, {
            'z-skin'        : {neo: {css: 'themes'}},
            '@acme/grid-ext': {neo: {css: 'themes'}},
            'plain-pkg'     : {}
        });

        expect(themeCssRoots(root, {insideNeo: false})).toEqual([
            path.join(root, 'node_modules/neo.mjs/resources/css'),
            path.join(root, 'node_modules/@acme/grid-ext/themes'),
            path.join(root, 'node_modules/z-skin/themes'),
            path.join(root, 'resources/css')
        ])
    });

    test('inside the engine only the engine\'s own sources count, declared dependencies or not', () => {
        const root = workspace('neo.mjs', {'@acme/grid-ext': '1.0.0'}, {'@acme/grid-ext': {neo: {css: 'themes'}}});

        expect(themeCssRoots(root, {insideNeo: true})).toEqual([path.join(root, 'resources/css')])
    });

    test('the caller decides what the Engine is, never the package name', () => {
        const root = workspace('neo.mjs-demo', {'neo.mjs': '1.0.0', skin: '1.0.0'}, {skin: {neo: {css: 'themes'}}});

        expect(themeCssRoots(root, {insideNeo: false})).toEqual([
            path.join(root, 'node_modules/neo.mjs/resources/css'),
            path.join(root, 'node_modules/skin/themes'),
            path.join(root, 'resources/css')
        ])
    });

    test('a declared neo.css must be one directory inside its package', () => {
        const refuse = (css, message) => {
            const root = workspace('demo-workspace', {skin: '1.0.0'}, {skin: {neo: {css}}});

            expect(() => themeCssRoots(root, {insideNeo: false}), JSON.stringify(css)).toThrow(message)
        };

        refuse(['themes'],  'skin: neo.css must be a package-relative directory');
        refuse('missing',   'skin: neo.css root missing is not a directory');
        refuse('../escape', 'skin: invalid neo.css root "../escape"')
    });

    test('the single-directory shape is opt-in: array keys still refuse a string', () => {
        const root = workspace('demo-workspace', {addon: '1.0.0'}, {addon: {neo: {mainAddons: 'themes'}}});

        expect(() => declaredPackageRoots(root, 'mainAddons')).toThrow('addon: neo.mainAddons must be an array of package-relative directories')
    })
});
