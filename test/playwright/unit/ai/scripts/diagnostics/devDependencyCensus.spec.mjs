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

    test.describe('the live census itself (smoke — shape, never a frozen population)', () => {
        test('every devDependency classifies with a known verdict, native class, tier, and side vocabulary', () => {
            const root          = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..'),
                  report        = census(root),
                  manifest      = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')),
                  brainPath     = path.join(root, 'package.brain.json'),
                  brainManifest = fs.existsSync(brainPath) ? JSON.parse(fs.readFileSync(brainPath, 'utf8')) : null;

            // Shape, not population. Exact importer counts are mutable repo state — sibling lanes
            // remove importers, and the census's own removal follow-ups shrink the package set —
            // so asserting them here would be an unowned tripwire that fires on someone else's PR.
            // The exact-population reproduction is a SHA-stamped receipt carried by the census's
            // originating ticket comment, re-runnable on demand; this suite asserts the census
            // never crashes, never leaves a package unclassified, and uses only known vocabulary.
            // The census reads BOTH install-tier manifests: the root manifest alone is an
            // incomplete dependency authority since the tier split.
            expect(report.totals.packages).toBe(
                Object.keys(manifest.devDependencies || {}).length
                + Object.keys(brainManifest?.devDependencies || {}).length
            );

            const NATIVE = new Set(['native-compile', 'prebuilt-fetch', 'none', 'unknown']);
            const SIDES  = new Set(['container-plane', 'host-edge', 'build', 'test', 'ad-hoc-script', 'body', 'contributor-tooling']);
            const KINDS  = new Set(['static', 'dynamic', 'require']);
            const TIERS  = new Set(['base', 'brain']);

            for (const p of report.packages) {
                expect(TIERS.has(p.tier), `${p.name}: tier '${p.tier}' outside the vocabulary`).toBe(true);
                expect(NATIVE.has(p.native.nativeClass), `${p.name}: nativeClass '${p.native.nativeClass}' outside the vocabulary`).toBe(true);
                for (const i of p.importers) {
                    expect(SIDES.has(i.side), `${p.name} @ ${i.path}: side '${i.side}' unclassified`).toBe(true);
                    for (const k of i.kinds) {
                        expect(KINDS.has(k), `${p.name} @ ${i.path}: kind '${k}' unknown`).toBe(true);
                    }
                }
            }

            // The one durable content assertion: the package the originating work is about is
            // seen at all — in its Brain-tier row since the install-tier split. Its exact
            // importer count is deliberately NOT asserted (see above).
            const sqlite = report.packages.find(p => p.name === 'better-sqlite3');

            expect(sqlite.tier).toBe('brain');
            expect(sqlite.importers.length).toBeGreaterThan(0);
        });
    });
});
