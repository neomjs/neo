import {expect, test}      from '@playwright/test';
import {createRequire}     from 'module';
import {resolvePackageBin} from '../../../../buildScripts/util/resolvePackageBin.mjs';
import fs                  from 'fs';
import os                  from 'os';
import path                from 'path';

/**
 * @summary Resolution of a dependency's executable entry, across node_modules layouts.
 *
 * The defect these cover is not "the path is ugly" — it is that a cwd-relative
 * literal reads from wherever the build was *started*, and `build/all.mjs` starts the build programs
 * with the **consumer's** cwd. So the property under test is that resolution is driven by the
 * caller's module location and by the package's own manifest, and never by `process.cwd()`.
 *
 * The layouts are built on disk rather than mocked, because the whole failure is a filesystem-shape
 * failure: a mock that returns a path would pass for a resolver that ignores hoisting entirely.
 */

/**
 * Throwaway root, pinned to its realpath.
 *
 * `os.tmpdir()` is a symlink on macOS (`/var` → `/private/var`), and Node's resolver reports
 * realpaths. Comparing a resolved path against an unresolved fixture path fails on the symlink
 * rather than on the behaviour under test — and would read as a resolution defect that is not one.
 * @returns {String}
 */
function makeTempRoot() {
    return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-17868-')))
}

/** Builds a throwaway `node_modules` tree and returns a resolver bound to it. */
function makeLayout({nested}) {
    const root = makeTempRoot(),
          // hoisted: <root>/node_modules/dep ; nested: <root>/node_modules/host/node_modules/dep
          depDir  = nested
              ? path.join(root, 'node_modules', 'host', 'node_modules', 'dep')
              : path.join(root, 'node_modules', 'dep'),
          callDir = nested ? path.join(root, 'node_modules', 'host') : root;

    fs.mkdirSync(path.join(depDir, 'bin'), {recursive: true});
    fs.mkdirSync(callDir, {recursive: true});
    fs.writeFileSync(path.join(depDir, 'package.json'), JSON.stringify({
        name: 'dep', version: '1.0.0', bin: {dep: 'bin/dep.js'}
    }));
    fs.writeFileSync(path.join(depDir, 'bin', 'dep.js'), '// entry\n');
    fs.writeFileSync(path.join(callDir, 'caller.mjs'), '// caller\n');

    return {
        root,
        expected: path.join(depDir, 'bin', 'dep.js'),
        resolve : createRequire(path.join(callDir, 'caller.mjs')).resolve
    }
}

test.describe('resolvePackageBin', () => {
    test('resolves the declared bin entry in a hoisted layout', () => {
        const {root, expected, resolve} = makeLayout({nested: false});

        try {
            expect(resolvePackageBin('dep', resolve)).toBe(expected)
        } finally {
            fs.rmSync(root, {recursive: true, force: true})
        }
    });

    test('resolves the declared bin entry in a nested layout', () => {
        const {root, expected, resolve} = makeLayout({nested: true});

        try {
            expect(resolvePackageBin('dep', resolve)).toBe(expected)
        } finally {
            fs.rmSync(root, {recursive: true, force: true})
        }
    });

    /**
     * The mutation control for the actual defect. The old code was `'./node_modules/.bin/<name>'`
     * read from cwd; this asserts the resolved answer does NOT coincide with that literal resolved
     * against the process cwd, so a regression back to a cwd-relative form reds here rather than
     * passing because both happen to exist in this repo's own layout.
     */
    test('the resolved entry is not the cwd-relative shim path', () => {
        const {root, expected, resolve} = makeLayout({nested: true});

        try {
            const resolved = resolvePackageBin('dep', resolve);

            expect(resolved).toBe(expected);
            expect(resolved).not.toBe(path.resolve(process.cwd(), 'node_modules/.bin/dep'));
            expect(resolved.startsWith(root)).toBe(true)
        } finally {
            fs.rmSync(root, {recursive: true, force: true})
        }
    });

    test('honours a bin map key other than the package name', () => {
        const root   = makeTempRoot(),
              depDir = path.join(root, 'node_modules', 'dep');

        fs.mkdirSync(path.join(depDir, 'bin'), {recursive: true});
        fs.writeFileSync(path.join(depDir, 'package.json'), JSON.stringify({
            name: 'dep', version: '1.0.0', bin: {other: 'bin/other.js', dep: 'bin/dep.js'}
        }));
        fs.writeFileSync(path.join(root, 'caller.mjs'), '// caller\n');

        try {
            const resolve = createRequire(path.join(root, 'caller.mjs')).resolve;

            expect(resolvePackageBin('dep', resolve, {binName: 'other'}))
                .toBe(path.join(depDir, 'bin', 'other.js'))
        } finally {
            fs.rmSync(root, {recursive: true, force: true})
        }
    });

    test('accepts a string bin declaration', () => {
        const root   = makeTempRoot(),
              depDir = path.join(root, 'node_modules', 'dep');

        fs.mkdirSync(path.join(depDir, 'bin'), {recursive: true});
        fs.writeFileSync(path.join(depDir, 'package.json'), JSON.stringify({
            name: 'dep', version: '1.0.0', bin: 'bin/dep.js'
        }));
        fs.writeFileSync(path.join(root, 'caller.mjs'), '// caller\n');

        try {
            const resolve = createRequire(path.join(root, 'caller.mjs')).resolve;

            expect(resolvePackageBin('dep', resolve)).toBe(path.join(depDir, 'bin', 'dep.js'))
        } finally {
            fs.rmSync(root, {recursive: true, force: true})
        }
    });

    test('throws a named error when the manifest declares no bin', () => {
        const root   = makeTempRoot(),
              depDir = path.join(root, 'node_modules', 'dep');

        fs.mkdirSync(depDir, {recursive: true});
        fs.writeFileSync(path.join(depDir, 'package.json'), JSON.stringify({name: 'dep', version: '1.0.0'}));
        fs.writeFileSync(path.join(root, 'caller.mjs'), '// caller\n');

        try {
            const resolve = createRequire(path.join(root, 'caller.mjs')).resolve;

            expect(() => resolvePackageBin('dep', resolve)).toThrow(/declares no bin entry/)
        } finally {
            fs.rmSync(root, {recursive: true, force: true})
        }
    });
});

test.describe('the engine\'s own dependencies resolve through the real chain', () => {
    const resolve = createRequire(import.meta.url).resolve;

    test('webpack resolves to its declared entry script, not a .bin shim', () => {
        const resolved = resolvePackageBin('webpack', resolve);

        expect(fs.existsSync(resolved)).toBe(true);
        expect(resolved.endsWith('bin/webpack.js')).toBe(true);
        expect(resolved.includes(`${path.sep}.bin${path.sep}`)).toBe(false)
    });

    /**
     * Guards the trap documented in `buildScripts/build/parse5.mjs`: the bare specifier lands on the
     * exact file the old hardcoded literal named, while the subpath that *looks* like that literal
     * is not exported and throws. A future "cleanup" toward the visible path reds here.
     */
    test('parse5 resolves by bare specifier only', () => {
        expect(resolve('parse5').endsWith(path.join('parse5', 'dist', 'index.js'))).toBe(true);
        expect(() => resolve('parse5/dist/index.js')).toThrow()
    });
});
