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
        const specifiers = resolveBrainInstallClosure({manifestFile: brainManifestPath, lockFile: brainLockPath});

        expect(specifiers.length).toBeGreaterThan(3);
        for (const root of ['better-sqlite3', 'chromadb', '@chroma-core/default-embed']) {
            expect(specifiers.some(s => s.startsWith(`${root}@`)), `closure missing root ${root}`).toBe(true);
        }
        for (const specifier of specifiers) {
            expect(specifier, `non-exact specifier: ${specifier}`).toMatch(/^(@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+(-[\w.]+)?$/);
        }
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
