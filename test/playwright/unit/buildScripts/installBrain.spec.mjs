import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    buildNpmArgs,
    resolveBrainInstallClosure,
    resolveBrainInstallPlan,
    resolveNpmCommand
} from '../../../../buildScripts/util/installBrain.mjs';

const
    __filename        = fileURLToPath(import.meta.url),
    repoRoot          = path.resolve(path.dirname(__filename), '../../../..'),
    brainManifestPath = path.join(repoRoot, 'package.brain.json'),
    brainLockPath     = path.join(repoRoot, 'package-lock.brain.json'),
    rootManifestPath  = path.join(repoRoot, 'package.json');

/**
 * @summary The two-path install tier: Body default, Brain opt-in. These guards run in
 * the BODY project precisely so they execute on a base install — a guard living behind the
 * brain seam could never fire where the boundary matters most.
 */
test.describe('buildScripts/util/installBrain — the Brain-tier opt-in (#16364)', () => {
    test('the base manifest declares NONE of the Brain set (absence, not a better value)', () => {
        // The tier boundary IS the absence: re-adding a Brain package to root devDependencies
        // re-imposes the native compile on every Body contributor. Asserting absence cannot rot
        // the way asserting a "correct" location can — there is no correct value here.
        const rootManifest = JSON.parse(fs.readFileSync(rootManifestPath, 'utf8')),
              offenders    = ['better-sqlite3', 'chromadb', '@chroma-core/default-embed']
                  .filter(name => rootManifest.devDependencies?.[name] !== undefined);

        expect(offenders, `Brain-tier packages leaked back into the base manifest: ${offenders.join(', ')}`).toEqual([]);
        expect(rootManifest.scripts['install-brain']).toBe('node ./buildScripts/util/installBrain.mjs');
    });

    test('package.brain.json pins the Brain set the installer overlays', () => {
        const specifiers = resolveBrainInstallPlan(brainManifestPath);

        // better-sqlite3 (the native compile this tier exists to spare Body contributors) and
        // chromadb (the vector store + Chroma CLI) are the load-bearing pair; the manifest may
        // grow, but never shrink below them.
        expect(specifiers.some(s => s.startsWith('better-sqlite3@'))).toBe(true);
        expect(specifiers.some(s => s.startsWith('chromadb@'))).toBe(true);
        for (const specifier of specifiers) {
            expect(specifier).toMatch(/^(@[\w.-]+\/)?[\w.-]+@[\d^~>=< ]/);
        }
    });

    test('a malformed manifest fails with a named parse error, not npm’s opaque one', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-brain-spec-')),
              bad = path.join(dir, 'package.brain.json');

        fs.writeFileSync(bad, '{not json');
        expect(() => resolveBrainInstallPlan(bad)).toThrow(/cannot parse .* as JSON/);

        fs.writeFileSync(bad, '{"devDependencies": {}}');
        expect(() => resolveBrainInstallPlan(bad)).toThrow(/empty Brain set/);

        fs.rmSync(dir, {force: true, recursive: true});
    });

    test('the committed closure agrees with the manifest and installs EXACT specifiers only', () => {
        // The determinism contract: install specifiers come from package-lock.brain.json (the
        // frozen graph), never from live range resolution — the same SHA installs the same Brain
        // tier on every machine. Shape, never a frozen population: the closure grows and shrinks
        // with registry state at regeneration time, so only exactness + root coverage is pinned.
        const {topLevel} = resolveBrainInstallClosure({manifestFile: brainManifestPath, lockFile: brainLockPath});

        expect(topLevel.length).toBeGreaterThan(3);
        for (const root of ['better-sqlite3', 'chromadb', '@chroma-core/default-embed']) {
            expect(topLevel.some(s => s.startsWith(`${root}@`)), `closure missing root ${root}`).toBe(true);
        }
        for (const specifier of topLevel) {
            expect(specifier, `non-exact specifier: ${specifier}`).toMatch(/^(@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
        }
    });

    test('the platform-matching variant installs at the LOCK version — the parent range cannot float', () => {
        // chromadb declares its bindings as ^1.3.4 — a RANGE. Without the matched pin, tomorrow's
        // 1.3.5 resolves live at the same SHA (the re-review blocker). The matching variant is
        // passed exactly, satisfying the parent's range with the lock's version; incompatible
        // variants never reach npm (an explicit darwin binary EBADPLATFORMs the linux runner —
        // that also fired for real).
        const lock     = JSON.parse(fs.readFileSync(brainLockPath, 'utf8')),
              expected = lock.packages['node_modules/chromadb-js-bindings-darwin-arm64'].version;

        const darwin = resolveBrainInstallClosure({manifestFile: brainManifestPath, lockFile: brainLockPath, platform: 'darwin', arch: 'arm64', isMusl: false});

        expect(darwin.topLevel).toContain(`chromadb-js-bindings-darwin-arm64@${expected}`);
        expect(darwin.topLevel.some(s => /chromadb-js-bindings-(linux|win32)/.test(s))).toBe(false);

        const linux = resolveBrainInstallClosure({manifestFile: brainManifestPath, lockFile: brainLockPath, platform: 'linux', arch: 'x64', isMusl: false});

        expect(linux.topLevel).toContain(`chromadb-js-bindings-linux-x64-gnu@${expected}`);
        expect(linux.topLevel.some(s => /chromadb-js-bindings-(darwin|win32)/.test(s))).toBe(false);

        // libc split on musl: the musl sibling wins, the glibc spelling is skipped.
        const muslVersion = lock.packages['node_modules/@img/sharp-linuxmusl-x64'].version,
              musl        = resolveBrainInstallClosure({manifestFile: brainManifestPath, lockFile: brainLockPath, platform: 'linux', arch: 'x64', isMusl: true});

        expect(musl.topLevel).toContain(`@img/sharp-linuxmusl-x64@${muslVersion}`);
        expect(musl.topLevel.some(s => s.startsWith('@img/sharp-linux-x64@'))).toBe(false);
    });

    test('the closure is consumed as a TREE: nested range-pins install into their parents (the terminal falsifier)', () => {
        // tar-fs declares chownr ^1.1.1 — a RANGE. Left to live resolution, tomorrow's 1.1.5
        // silently rewrites the graph the lock froze at 1.1.4: the exact-positive control for
        // "the same SHA installs a different graph". Range-backed nested pins install INTO their
        // parent's tree; exact-parent nested pins are already frozen and need no pass.
        const {nested, topLevel} = resolveBrainInstallClosure({manifestFile: brainManifestPath, lockFile: brainLockPath});

        expect(topLevel).toContain('chownr@3.0.0');
        expect(nested).toContainEqual({parent: 'tar-fs', name: 'chownr', version: '1.1.4'});
        // onnxruntime-common's nested pin is exact-parent-declared — frozen without an install pass.
        expect(nested.some(pin => pin.name === 'onnxruntime-common')).toBe(false);
    });

    test('a manifest/lock disagreement is a named drift error — never a silent float to live ranges', () => {
        const dir      = fs.mkdtempSync(path.join(os.tmpdir(), 'install-brain-drift-')),
              manifest = path.join(dir, 'package.brain.json'),
              lock     = path.join(dir, 'package-lock.brain.json');

        fs.writeFileSync(manifest, JSON.stringify({devDependencies: {'better-sqlite3': '12.11.1', chromadb: '3.5.0'}}));
        fs.writeFileSync(lock, JSON.stringify({packages: {'': {devDependencies: {'better-sqlite3': '12.11.1', chromadb: '3.4.0'}}}}));

        expect(() => resolveBrainInstallClosure({manifestFile: manifest, lockFile: lock})).toThrow(/disagree/);
        expect(() => resolveBrainInstallClosure({manifestFile: manifest, lockFile: path.join(dir, 'missing.json')})).toThrow(/closure not found/);

        fs.rmSync(dir, {force: true, recursive: true});
    });

    test('resolveNpmCommand follows the repo’s Windows launcher seam', () => {
        expect(resolveNpmCommand('win32')).toBe('npm.cmd');
        expect(resolveNpmCommand('darwin')).toBe('npm');
        expect(resolveNpmCommand('linux')).toBe('npm');
    });

    test('buildNpmArgs overlays without mutating package.json or the lockfile', () => {
        // --no-save is the whole mechanism: a merged manifest would be a permanently dirty tree
        // for every Brain-side seat, and one careless commit would re-tier the repo.
        expect(buildNpmArgs(['better-sqlite3@12.11.1'])).toEqual([
            'install', '--no-save', '--no-audit', '--no-fund', 'better-sqlite3@12.11.1'
        ]);
    });

    test('--ignore-scripts forwards for script-hostile environments (image builds)', () => {
        // The deploy image build installs with lifecycle scripts off by contract (husky must not
        // run without .git); the flag forwards so the overlay honors the same boundary, and the
        // caller keeps explicit ownership of config materialization.
        expect(buildNpmArgs(['better-sqlite3@12.11.1'], {ignoreScripts: true})).toEqual([
            'install', '--no-save', '--no-audit', '--no-fund', '--ignore-scripts', 'better-sqlite3@12.11.1'
        ]);
        expect(buildNpmArgs(['better-sqlite3@12.11.1'])).not.toContain('--ignore-scripts');
    });

    test('--dry-run prints the exact npm command without executing it', () => {
        const output = execFileSync(process.execPath, [
            path.join(repoRoot, 'buildScripts/util/installBrain.mjs'), '--dry-run'
        ], {encoding: 'utf8'}).trim();

        expect(output).toMatch(/^npm install --no-save --no-audit --no-fund /);
        expect(output).toContain('better-sqlite3@');
        expect(output).toContain('chromadb@');
    });
});
