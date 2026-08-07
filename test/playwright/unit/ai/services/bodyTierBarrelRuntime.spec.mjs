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
    LOADER     = path.join(__dirname, 'denyBrainTierPackages.loader.mjs');

/**
 * @summary Proves `ai/services.mjs` survives a Body-tier install, where `chromadb` is absent.
 *
 * **Why a spawned process and not an import.** The property is a RUNTIME one and the static import
 * graph cannot see it. `Neo.setupClass()` instantiates the manager singletons at module load and
 * `core.Base` schedules `initAsync()` on the very next microtask — so a dynamic `import('chromadb')`
 * inside `initAsync()` is not demand-lazy at all. It runs on barrel import, and in the Body tier it
 * rejects into an unhandled rejection that terminates the process. A static-reachability walk
 * reports "clean" throughout; only a real process with the package denied observes it.
 *
 * That distinction is the whole reason this file exists: the previous guard was a static walk, it
 * passed, and the runtime property was false. Full-install CI cannot reproduce it either, because
 * CI has the Brain tier installed.
 *
 * **Scope, stated because it is narrower than "the barrel is Body-tier safe".** This pins the
 * `chromadb` property only. Denying the FULL Brain-only population additionally surfaces
 * `better-sqlite3`, which is eagerly resolved by the same boot and is owned elsewhere — see the
 * sibling test below, which records that as a known state rather than asserting it away.
 */
function probe({target, denied}) {
    const script = `
        process.on('unhandledRejection', e => {
            console.log('DENIED_AT_RUNTIME: ' + (e && e.message));
            process.exit(1);
        });
        await import(process.env.NEO_PROBE_TARGET);
        // Past the microtask that scheduled initAsync, plus margin for its awaits.
        await new Promise(r => setTimeout(r, 400));
        console.log('SURVIVED');
        process.exit(0);
    `;

    const
        dir     = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-body-tier-probe-')),
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

        const output = `${result.stdout || ''}${result.stderr || ''}`;

        return {survived: result.status === 0 && /SURVIVED/.test(output), stdout: output}
    } finally {
        fs.removeSync(dir)
    }
}

test.describe('ai/services.mjs Body-tier runtime contract (#16488)', () => {
    test('the SDK barrel survives eager singleton boot with chromadb absent', () => {
        const {survived, stdout} = probe({
            target: 'ai/services.mjs',
            denied: ['chromadb']
        });

        expect(
            survived,
            'importing the SDK barrel resolved `chromadb` during eager singleton boot, so the Body ' +
            'install tier cannot load the canonical entry point. Moving the import into ' +
            '`initAsync()` is NOT sufficient — `setupClass` instantiates the singleton and ' +
            '`core.Base` schedules `initAsync` immediately. Resolve it on first Chroma USE instead.' +
            `\n\n--- probe output ---\n${stdout}`
        ).toBe(true)
    });

    test('POSITIVE CONTROL: a known Chroma-using entry point still hits the denial', () => {
        // Without this, a "survived" above could mean the loader never denied anything — a probe
        // that cannot fail proves nothing about the one that passed.
        const {survived, stdout} = probe({
            target: 'ai/scripts/maintenance/defragChromaDB.mjs',
            denied: ['chromadb']
        });

        expect(
            survived,
            'the denial loader did not stop a module that statically imports `chromadb`, so the ' +
            'passing barrel probe above proves nothing.' +
            `\n\n--- probe output ---\n${stdout}`
        ).toBe(false);
        expect(stdout).toMatch(/chromadb/)
    });

    test('KNOWN STATE: better-sqlite3 is still resolved at barrel boot, and is NOT this ticket', () => {
        // Recorded rather than asserted away. The `chromadb` boundary is what the sibling tests
        // pin; denying the full Brain-only population shows the barrel is not yet
        // Body-tier-importable in general, because `better-sqlite3` is eagerly resolved by the
        // same boot.
        //
        // This test documents the boundary of the claim above. When the sibling package is made
        // demand-driven too, this expectation flips and the barrel becomes genuinely Body-tier safe
        // — at which point this test should be rewritten to assert survival, not deleted.
        const {survived, stdout} = probe({
            target: 'ai/services.mjs',
            denied: ['chromadb', 'better-sqlite3', '@chroma-core/default-embed']
        });

        expect(survived, `--- probe output ---\n${stdout}`).toBe(false);
        expect(stdout).toMatch(/better-sqlite3/)
    })
});
