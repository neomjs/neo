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
    REPO_ROOT  = path.resolve(__dirname, '../../../../..');

/**
 * @summary Pins the concurrent-first-use contract of `ChromaManager.ensureChromaReady()`.
 *
 * **The interleaving point, named as two boundaries** rather than as actors: a second caller's
 * `ensureChromaReady()` returns strictly between call 1's `this.client = new ChromaClient(...)`
 * assignment and call 1's `await this.connect()` resolving. Inside that window the client exists
 * but is not connected and its embedding functions are not registered.
 *
 * The defect this guards: an `if (this.client) return` placed BEFORE the in-flight-promise check
 * lets the second caller skip the memoized initialization entirely. It is not a promise-contract
 * nit — a guarded public entry point (`getMemoryCollection`) then runs `getOrCreateCollection`
 * against the half-initialized client, and releasing call 1 afterwards cannot recover that
 * already-failed operation.
 *
 * **Why a spawned process.** `#chromaReady` is private with no reset, and the run-scoped Chroma
 * means the singletons have usually already initialized by the time an in-process spec runs. Only
 * a fresh process can observe the first-use window at all.
 *
 * Reported by @neo-gpt against `fddfde357b` on both managers; this is his probe made deterministic.
 */
function probe({managerKey}) {
    const script = `
        const SDK = await import(${JSON.stringify(path.join(REPO_ROOT, 'ai/services.mjs'))});
        const mgr = SDK[${JSON.stringify(managerKey)}];

        let release;
        const gate        = new Promise(resolve => { release = resolve });
        const realConnect = mgr.connect.bind(mgr);

        // Hold call 1 INSIDE connect(): past the client assignment, before connect resolves.
        mgr.connect = async () => { await gate; return realConnect() };

        const first = mgr.ensureChromaReady();
        first.catch(() => {});

        // Let call 1 reach the held connect().
        await new Promise(r => setTimeout(r, 300));

        let secondSettled = false;
        const second = mgr.ensureChromaReady();
        second.then(() => { secondSettled = true }, () => { secondSettled = true });

        // A guarded PUBLIC entry, taken while call 1 is still held. It must not execute against a
        // client that has not connected.
        const realGetOrCreate = mgr.client.getOrCreateCollection.bind(mgr.client);
        mgr.client.getOrCreateCollection = async (...args) => {
            if (!mgr.connected) throw new Error('collection escaped before connect');
            return realGetOrCreate(...args)
        };

        let collectionOutcome = 'pending';
        const collection = mgr.getMemoryCollection
            ? mgr.getMemoryCollection()
            : mgr.getKnowledgeBaseCollection();
        collection.then(
            () => { collectionOutcome = 'resolved' },
            e  => { collectionOutcome = 'rejected:' + e.message }
        );

        await new Promise(r => setTimeout(r, 300));

        const beforeRelease = {secondSettled, clientPresent: !!mgr.client, connected: mgr.connected, collectionOutcome};

        release();
        await first;
        await second;
        await new Promise(r => setTimeout(r, 200));

        const afterRelease = {secondSettled, clientPresent: !!mgr.client, connected: mgr.connected, collectionOutcome};

        console.log('PROBE_RESULT ' + JSON.stringify({beforeRelease, afterRelease}));
        process.exit(0);
    `;

    const
        dir     = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-chroma-ensure-race-')),
        probeJs = path.join(dir, 'probe.mjs');

    fs.writeFileSync(probeJs, script);

    try {
        const result = spawnSync(process.execPath, [probeJs], {
            cwd     : REPO_ROOT,
            encoding: 'utf8',
            stdio   : ['ignore', 'pipe', 'pipe'],
            // Playwright injects loader flags; inheriting them makes the child resolve through the
            // harness instead of the real module graph.
            env    : {...process.env, NODE_OPTIONS: ''},
            timeout: 120000
        });

        const
            output = `${result.stdout || ''}${result.stderr || ''}`,
            match  = /PROBE_RESULT (\{.*\})/.exec(output);

        return {parsed: match ? JSON.parse(match[1]) : null, output}
    } finally {
        fs.removeSync(dir)
    }
}

for (const [label, managerKey] of [['knowledge-base', 'KB_ChromaManager'], ['memory-core', 'Memory_ChromaManager']]) {
    test.describe(`ChromaManager.ensureChromaReady concurrent first use — ${label}`, () => {
        test('a second caller arriving mid-initialization JOINS it rather than bypassing it', () => {
            const {parsed, output} = probe({managerKey});

            expect(parsed, `probe produced no result\n--- output ---\n${output}`).not.toBeNull();

            const {beforeRelease, afterRelease} = parsed;

            // The window is real: the client exists and connect has not completed.
            expect(beforeRelease.clientPresent, JSON.stringify(parsed)).toBe(true);
            expect(beforeRelease.connected,     JSON.stringify(parsed)).toBe(false);

            // The contract. A leading `if (this.client) return` settles call 2 here.
            expect(
                beforeRelease.secondSettled,
                'the second ensureChromaReady() settled while the first was still inside connect(), ' +
                'so it bypassed the in-flight initialization and its caller holds a client that is ' +
                'not connected and whose embedding functions are not registered. Check the in-flight ' +
                'promise BEFORE the externally-supplied-client seam.' +
                `\n\n${JSON.stringify(parsed, null, 2)}`
            ).toBe(false);

            // The consequence, which is what makes this release-blocking rather than a nit.
            expect(
                beforeRelease.collectionOutcome,
                'a guarded public collection entry executed against a half-initialized client' +
                `\n\n${JSON.stringify(parsed, null, 2)}`
            ).not.toMatch(/^rejected:collection escaped before connect/);

            // Releasing completes both, and the state is fully initialized.
            expect(afterRelease.secondSettled, JSON.stringify(parsed)).toBe(true);
            expect(afterRelease.connected,     JSON.stringify(parsed)).toBe(true)
        })
    })
}
