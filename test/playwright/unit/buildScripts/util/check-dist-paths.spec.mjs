import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
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

    test('RED: a missing build folder fails instead of passing empty', () => {
        const result = spawnSync(process.execPath, [CHECK, path.join(os.tmpdir(), `neo-dist-paths-missing-${Date.now()}`)], {encoding: 'utf8'});

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('does not exist')
    })
});
