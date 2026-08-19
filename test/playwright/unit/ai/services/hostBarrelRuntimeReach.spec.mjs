import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'child_process';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    // services -> ai -> unit -> playwright -> test -> repo root
    REPO_ROOT  = path.resolve(__dirname, '../../../../..'),
    LOADER     = path.join(__dirname, 'denyCloudPlanePackages.loader.mjs'),

    /**
     * The full cloud-only population. Two are static edges; `better-sqlite3` is not, which is
     * precisely why this file exists — see the boundary note below.
     */
    CLOUD_ONLY = ['chromadb', '@google/generative-ai', 'better-sqlite3', '@chroma-core/default-embed'];

/**
 * @summary Proves a HOST entrypoint cannot be stopped by cloud-plane packages being absent.
 *
 * ## Why this file exists, and why the sibling static walk cannot replace it
 *
 * `hostBarrelImportReach.spec.mjs` walks the static import graph and states its own boundary
 * explicitly: the acceptance property is NOT decidable by static reach alone. `better-sqlite3` is
 * reached through `await import()` inside `initAsync()`, so no static analysis can see it — yet it
 * still loads on barrel import, because `Neo.setupClass()` instantiates the singleton at module
 * load and `core.Base` schedules `initAsync()` on the very next microtask. **The deferral is
 * syntactic, not behavioural.**
 *
 * That gap is not academic. It is the exact mistake this ticket's own history records: a static
 * walk passed while the runtime property was false, and a static-walk result was promoted into a
 * runtime claim. This file is the instrument that can catch that, because it runs a real process
 * with the packages genuinely unresolvable.
 *
 * ## The control is the sibling barrel, deliberately
 *
 * A "survived" result means nothing unless the same denial demonstrably kills something. The
 * control here is `ai/services.mjs` under the identical denial: if the cloud barrel also survived,
 * the loader would not be denying anything and the host result would be vacuous. Using the sibling
 * barrel rather than an arbitrary Chroma-using module makes the control prove two things at once —
 * that the denial is real, and that the SPLIT is what produces the difference.
 *
 * Full-install CI cannot reproduce any of this, because CI has the cloud plane installed.
 *
 * @param {Object}   config
 * @param {String}   config.target Repo-relative module to import in the spawned process.
 * @param {String[]} config.denied Package specifiers the resolve hook must refuse.
 * @returns {Object} `{survived, stdout}`
 */
function probe({target, denied}) {
    const script = `
        process.on('unhandledRejection', e => {
            console.log('DENIED_AT_RUNTIME: ' + (e && e.message));
            process.exit(1);
        });
        await import(process.env.NEO_PROBE_TARGET);
        // Past the microtask that scheduled initAsync, plus margin for its awaits. A shorter wait
        // would let a failing target exit 0 before its rejection lands — the probe would pass on
        // broken code.
        await new Promise(r => setTimeout(r, 400));
        console.log('SURVIVED');
        process.exit(0);
    `;

    const
        dir     = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-host-plane-probe-')),
        probeJs = path.join(dir, 'probe.mjs'),
        regJs   = path.join(dir, 'register.mjs');

    fs.writeFileSync(probeJs, script);
    fs.writeFileSync(regJs, `
        import {register} from 'node:module';
        import {pathToFileURL} from 'node:url';
        register(${JSON.stringify(LOADER)}, pathToFileURL('./'));
    `);

    try {
        const result = spawnSync(process.execPath, ['--import', regJs, probeJs], {
            cwd     : REPO_ROOT,
            encoding: 'utf8',
            stdio   : ['ignore', 'pipe', 'pipe'],
            env     : {
                ...process.env,
                // Playwright injects its own loader flags; inheriting them makes the child resolve
                // through the harness instead of the denial hook and the probe proves nothing.
                NODE_OPTIONS       : '',
                NEO_DENIED_PACKAGES: denied.join(','),
                NEO_PROBE_TARGET   : path.join(REPO_ROOT, target)
            }
        });

        return {survived: result.status === 0 && /SURVIVED/.test(`${result.stdout || ''}`), stdout: `${result.stdout || ''}${result.stderr || ''}`}
    } finally {
        fs.removeSync(dir)
    }
}

test.describe('host-plane runtime reach — a store handle must be unreachable by import alone (#16710)', () => {
    test('the HOST barrel survives eager singleton boot with every cloud-only package absent', () => {
        const {survived, stdout} = probe({
            target: 'ai/services.host.mjs',
            denied: CLOUD_ONLY
        });

        expect(
            survived,
            'importing `ai/services.host.mjs` resolved a cloud-plane package during eager singleton ' +
            'boot, so a host process cannot load it. This is the half the static walk cannot see: ' +
            'moving an import into `initAsync()` is NOT deferral, because `setupClass` instantiates ' +
            'the singleton and `core.Base` schedules `initAsync` on the next microtask.' +
            `\n\n--- probe output ---\n${stdout}`
        ).toBe(true)
    });

    test('CONTROL: the CLOUD barrel dies under the identical denial', () => {
        // Without this, "survived" above could mean the loader denied nothing. Using the sibling
        // barrel rather than an arbitrary Chroma consumer makes one control carry two claims: the
        // denial is real, AND the split is what produces the difference.
        const {survived, stdout} = probe({
            target: 'ai/services.mjs',
            denied: CLOUD_ONLY
        });

        expect(
            survived,
            'the cloud barrel survived with every cloud-only package denied, so the loader is not ' +
            'denying anything and the host result above is vacuous.' +
            `\n\n--- probe output ---\n${stdout}`
        ).toBe(false);

        // A control that merely fails is not a control — it must fail FOR THE STATED REASON. A
        // spawn that died of a syntax error, a bad cwd, or a missing loader would satisfy the
        // assertion above while proving nothing about denial.
        expect(
            stdout,
            `the cloud barrel did not die of the DENIAL; it died of something else, so this control ` +
            `does not license the host result.\n\n--- probe output ---\n${stdout}`
        ).toMatch(/DENIED_CLOUD_PLANE_PACKAGE/)
    });

    test('CONTROL: the host barrel is killed when a package IT uses is denied', () => {
        // The second failure direction. The test above proves the denial can kill *something*; this
        // proves the probe is actually observing THIS module's resolution rather than reporting a
        // generic success. Denying a package the host barrel genuinely needs must stop it.
        const {survived, stdout} = probe({
            target: 'ai/services.host.mjs',
            denied: ['js-yaml']
        });

        expect(
            survived,
            'denying `js-yaml` — which the host barrel measurably resolves — did not stop it, so ' +
            'this probe is not observing the host barrel\'s own resolution.' +
            `\n\n--- probe output ---\n${stdout}`
        ).toBe(false);

        expect(
            stdout,
            `the host barrel died, but not of the js-yaml denial — so this control does not show ` +
            `the probe observes its resolution.\n\n--- probe output ---\n${stdout}`
        ).toMatch(/js-yaml/)
    });

    test('the shared Playwright fixture survives the same denial — a consumer must not inherit the Brain (#17369)', () => {
        // 104 spec files import this fixture, so whatever it resolves, every consumer's test process
        // resolves too. It reached the Brain through `ai/services.mjs` for seven Neural Link symbols,
        // and a downstream adopter's CI aborted at teardown on the native `better-sqlite3` binding it
        // never used.
        //
        // This lives here rather than in a lint because the property is a RUNTIME one and the static
        // guard cannot see it twice over: `engine-brain-boundary-lint.yml` path-filters on
        // `buildScripts/**` and `src/**`, and a walk cannot see that `initAsync()` is scheduled by
        // `setupClass` on the next microtask — the same reason this file exists at all. e2e is not in
        // the CI matrix, so before this arm nothing in CI stopped the regression returning.
        //
        // Discriminating, not merely green: at `dev`'s barrel-importing revision this same call dies
        // with `DENIED_CLOUD_PLANE_PACKAGE: chromadb`. The two CONTROL arms above license that
        // reading — they establish the denial is real and that the probe observes the target's own
        // resolution, so this arm does not have to re-prove either.
        const {survived, stdout} = probe({
            target: 'test/playwright/fixtures.mjs',
            denied: CLOUD_ONLY
        });

        expect(
            survived,
            'the shared Playwright fixture resolved a cloud-plane package, so every project using it ' +
            'pulls the Brain into its test process. Import the seven Neural Link services directly ' +
            'from `ai/services/neural-link/*` rather than through `ai/services.mjs`, and keep the ' +
            '`Neo` / `core/_export` pair — the barrel supplied that class-system bootstrap ' +
            'incidentally, and without it this dies as `ReferenceError: Neo is not defined` from ' +
            '`src/core/Compare.mjs`, a file the fixture never names.' +
            `\n\n--- probe output ---\n${stdout}`
        ).toBe(true)
    })
});
