import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import fsExtra         from 'fs-extra';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {findFileUrls}  from '../../../../../buildScripts/util/check-dist-paths.mjs';

const
    REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..'),
    CHECK     = path.join(REPO_ROOT, 'buildScripts/util/check-dist-paths.mjs');

/**
 * @summary Writes a small build tree: one root bundle and one chunk, plus whatever the test plants.
 * @param {Object<String, String>} [planted] Relative path → file content.
 * @returns {String} The tree's root.
 */
function buildTree(planted = {}) {
    const dir   = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-dist-paths-')),
          files = {'main.js': 'export default 1;', 'chunks/main/1.js': 'export const a = 2;', ...planted};

    Object.entries(files).forEach(([file, content]) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
        fs.writeFileSync(path.join(dir, file), content)
    });

    return dir
}

test.describe('check-dist-paths: a production build ships no file:/// URL', () => {
    test('a clean tree reports nothing, and the CLI exits 0', () => {
        const dir = buildTree();

        try {
            expect(findFileUrls(dir)).toEqual([]);
            expect(spawnSync(process.execPath, [CHECK, dir], {encoding: 'utf8'}).status).toBe(0)
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('RED: an inlined build path in a nested chunk is named, and the CLI exits 1', () => {
        const dir = buildTree({'chunks/app/7.js': 'const u = "file:///home/builder/neo/src/Main.mjs";'});

        try {
            expect(findFileUrls(dir)).toEqual(['chunks/app/7.js']);

            const result = spawnSync(process.execPath, [CHECK, dir], {encoding: 'utf8'});

            expect(result.status).toBe(1);
            expect(result.stderr).toContain('chunks/app/7.js')
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('only scripts are read: a .mjs counts, a .css or .json with the same text does not', () => {
        const dir = buildTree({
            'MicroLoader.mjs'            : 'import "file:///x";',
            'css/neo-theme-neo-light.css': '/* file:///x */',
            'neo-config.json'            : '{"x": "file:///x"}'
        });

        try {
            expect(findFileUrls(dir)).toEqual(['MicroLoader.mjs'])
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('a linked resource folder, kept a link by the production copy, is scanned like any other', () => {
        const
            outside = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-dist-paths-linked-')),
            source  = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-dist-paths-resources-')),
            control = buildTree(),
            leaking = buildTree();

        try {
            // The workspace's resources hold a link to a folder elsewhere, as `webpack.config.main.mjs` copies them
            fs.writeFileSync(path.join(outside, 'leak.js'), 'const u = "file:///home/builder/app/src/x.mjs";');
            fs.writeFileSync(path.join(outside, 'clean.js'), 'export default 3;');
            fs.symlinkSync(outside, path.join(source, 'linked'), 'dir');

            fsExtra.copySync(source, path.join(control, 'resources'));
            fs.rmSync(path.join(outside, 'leak.js'));
            expect(fs.lstatSync(path.join(control, 'resources/linked')).isSymbolicLink(), 'the copy keeps the link').toBe(true);
            expect(findFileUrls(control), 'control: the linked folder holds only a clean script').toEqual([]);

            fs.writeFileSync(path.join(outside, 'leak.js'), 'const u = "file:///home/builder/app/src/x.mjs";');
            fsExtra.copySync(source, path.join(leaking, 'resources'));
            expect(findFileUrls(leaking)).toEqual(['resources/linked/leak.js']);
            expect(spawnSync(process.execPath, [CHECK, leaking], {encoding: 'utf8'}).status).toBe(1)
        } finally {
            [outside, source, control, leaking].forEach(dir => fs.rmSync(dir, {force: true, recursive: true}))
        }
    });

    test('a link cycle ends, and a link that cannot be followed fails', () => {
        const dir = buildTree({'chunks/app/7.js': 'const u = "file:///x";'});

        try {
            fs.symlinkSync(dir, path.join(dir, 'chunks/loop'), 'dir');
            expect(findFileUrls(dir), 'a folder reached again through a link is walked once').toEqual(['chunks/app/7.js']);

            fs.symlinkSync(path.join(dir, 'gone'), path.join(dir, 'broken'), 'dir');
            expect(() => findFileUrls(dir)).toThrow('broken is a link that cannot be followed');

            const result = spawnSync(process.execPath, [CHECK, dir], {encoding: 'utf8'});

            expect(result.status).toBe(1);
            expect(result.stderr).toContain('cannot be followed')
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('RED: a missing build folder fails instead of passing empty', () => {
        const result = spawnSync(process.execPath, [CHECK, path.join(os.tmpdir(), `neo-dist-paths-missing-${Date.now()}`)], {encoding: 'utf8'});

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('does not exist')
    })
});
