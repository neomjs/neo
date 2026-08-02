import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    census,
    classifySide,
    detectNativeClass,
    edgeTargetsPackage,
    extractImportEdges,
    findImporters,
    parseSource
} from '../../../../../../ai/scripts/diagnostics/devDependencyCensus.mjs';

/**
 * @summary Contract suite for the devDependency census. Pins the detection rules the ticket's
 * ACs stand on: real imports are distinguished from mentions mechanically (static + dynamic +
 * require arms), the dynamic arm carries a positive control (a static-only pattern is verified
 * to undercount on this codebase), `fast-glob` must never match `glob`, and the native-compile
 * classification prints its detection basis. The census is the deliverable that makes any later
 * removal safe — a wrong "unused" verdict here deletes a package a lane still needs.
 */

const edgesOf = source => extractImportEdges(parseSource(source));

test.describe('devDependency census', () => {

    test.describe('extractImportEdges', () => {
        test('static, dynamic, and require arms all fire', () => {
            expect(edgesOf(`import x from 'pkg-a';`)).toEqual([{kind: 'static', source: 'pkg-a'}]);
            expect(edgesOf(`const m = await import('pkg-b');`)).toEqual([{kind: 'dynamic', source: 'pkg-b'}]);
            expect(edgesOf(`const c = require('pkg-c');`)).toEqual([{kind: 'require', source: 'pkg-c'}]);
            expect(edgesOf(`import {deep} from '@scope/pkg-d/sub/path';`))
                .toEqual([{kind: 'static', source: '@scope/pkg-d/sub/path'}]);
        });

        test('comments and strings are never edges', () => {
            const edges = edgesOf(`// import x from 'pkg-e'\nconst s = "import y from 'pkg-e'";`);
            expect(edges).toEqual([]);
        });

        test('non-literal dynamic imports surface as dynamic-unresolved, never silence', () => {
            const edges = edgesOf('const m = await import(name);');
            expect(edges).toEqual([{kind: 'dynamic-unresolved', source: null}]);
        });
    });

    test.describe('edgeTargetsPackage', () => {
        test('exact name and subpath match; sibling names do not', () => {
            expect(edgeTargetsPackage('glob', 'glob')).toBe(true);
            expect(edgeTargetsPackage('glob/by/path', 'glob')).toBe(true);
            expect(edgeTargetsPackage('@scope/pkg', '@scope/pkg')).toBe(true);
            expect(edgeTargetsPackage('fast-glob', 'glob')).toBe(false);   // the undercount/overcount trap
            expect(edgeTargetsPackage('globalthis', 'glob')).toBe(false);
            expect(edgeTargetsPackage('webpack', 'webpack-cli')).toBe(false);
        });
    });

    test.describe('findImporters — the positive control', () => {
        test('a dynamic-only importer IS found (the static-grep undercount proof)', () => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), 'depcensus-'));
            fs.writeFileSync(path.join(root, 'dynamic.mjs'),
                `export async function open() { const m = await import('better-sqlite3'); return m; }`);
            fs.writeFileSync(path.join(root, 'mentionOnly.mjs'),
                `// better-sqlite3 is mentioned in this comment\nexport const note = 'better-sqlite3';`);

            // git grep needs a tracked tree; init a throwaway repo for the fixture
            execFileSync('git', ['init', '-q'], {cwd: root});
            execFileSync('git', ['add', '.'], {cwd: root});

            const {importers, mentionFiles} = findImporters('better-sqlite3', root);

            expect(importers.map(i => i.path)).toEqual(['dynamic.mjs']);
            expect(importers[0].kinds).toEqual(['dynamic']);
            expect(mentionFiles).toEqual(['mentionOnly.mjs']);
        });
    });

    test.describe('classifySide', () => {
        test('every prefix lands on its documented side', () => {
            expect(classifySide('test/playwright/unit/x.spec.mjs')).toBe('test');
            expect(classifySide('buildScripts/build/themes.mjs')).toBe('build');
            expect(classifySide('ai/scripts/maintenance/backup.mjs')).toBe('ad-hoc-script');
            expect(classifySide('ai/services/memory-core/Mailbox.mjs')).toBe('container-plane');
            expect(classifySide('ai/daemons/orchestrator/daemon.mjs')).toBe('container-plane');
            expect(classifySide('ai/daemons/wake/daemon.mjs')).toBe('host-edge');
            expect(classifySide('src/data/Store.mjs')).toBe('body');
            expect(classifySide('webpack.config.mjs')).toBe('host-edge'); // root-level fallback
        });
    });

    test.describe('detectNativeClass', () => {
        test('native-compile, prebuilt-fetch, and none are told apart with the basis printed', () => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), 'depcensus-native-'));
            const mk   = (pkg, manifest, extraFile) => {
                const dir = path.join(root, 'node_modules', pkg);
                fs.mkdirSync(dir, {recursive: true});
                fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
                if (extraFile) fs.writeFileSync(path.join(dir, extraFile), '');
            };

            mk('pkg-gyp', {scripts: {install: 'prebuild-install || node-gyp rebuild --release'}});
            mk('pkg-fetch', {scripts: {postinstall: 'node install.js'}});
            mk('pkg-plain', {});
            mk('pkg-binding', {}, 'binding.gyp');

            expect(detectNativeClass('pkg-gyp', root).nativeClass).toBe('native-compile');
            expect(detectNativeClass('pkg-binding', root).nativeClass).toBe('native-compile');
            expect(detectNativeClass('pkg-fetch', root).nativeClass).toBe('prebuilt-fetch');
            expect(detectNativeClass('pkg-plain', root).nativeClass).toBe('none');
            expect(detectNativeClass('pkg-missing', root).nativeClass).toBe('unknown');
        });
    });

    test.describe('the live census itself (smoke — the repo must census clean)', () => {
        test('all 45 packages classify and the two known populations reproduce', () => {
            const root   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
            const report = census(root);

            expect(report.totals.packages).toBe(45);

            // The ticket's verified numbers, reproduced: better-sqlite3 = 56 importers
            // (26 non-test + 30 test), chromadb = 12 (9 non-test + 3 test). A census that
            // cannot reproduce its own known populations has not been validated.
            const byName  = Object.fromEntries(report.packages.map(p => [p.name, p]));
            const nonTest = p => p.importers.filter(i => i.side !== 'test').length;
            const test    = p => p.importers.filter(i => i.side === 'test').length;

            expect(nonTest(byName['better-sqlite3'])).toBe(26);
            expect(test(byName['better-sqlite3'])).toBe(30);
            expect(byName['better-sqlite3'].native.nativeClass).toBe('native-compile');

            expect(nonTest(byName['chromadb'])).toBe(9);
            expect(test(byName['chromadb'])).toBe(3);
            expect(byName['chromadb'].native.nativeClass).toBe('none');
        });
    });
});
