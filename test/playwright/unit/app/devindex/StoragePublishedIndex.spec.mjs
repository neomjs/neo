import {setup} from '../../../setup.mjs';

const appName = 'DevIndexPublishedIndexTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import config         from '../../../../../apps/devindex/services/config.mjs';
import Storage        from '../../../../../apps/devindex/services/Storage.mjs';

/**
 * @summary The Data Factory reads its previous index from the artifact it published.
 *
 * The producer used to take its previous state from whatever `actions/checkout` left on disk, which
 * is why the pipeline needed a clone of a multi-gigabyte repository to reach one file it only reads
 * the tip of. These arms pin the three properties that make the fetched path safe to prefer: it
 * agrees with the tree path byte-for-byte, it is used only when provably ours, and every retreat to
 * the tree is audible.
 */
test.describe('DevIndex Storage — the published index as the read side (#17374)', () => {
    const
        RECORDS = [
            {l: 'ada',   tc: 40000},
            {l: 'grace', tc: 31337},
            {l: 'vega',  tc: 12000}
        ],
        SERIALIZED = RECORDS.map(record => JSON.stringify(record)).join('\n');

    let originalFetch, originalReadJson;

    test.beforeEach(() => {
        originalFetch    = globalThis.fetch;
        originalReadJson = Storage.readJson.bind(Storage);
    });

    test.afterEach(() => {
        globalThis.fetch  = originalFetch;
        Storage.readJson  = originalReadJson;
    });

    /**
     * Serves a body, or throws, in place of the network.
     * @param {String|Function} body
     * @param {Object} [options]
     * @returns {Array} Recorded requests, for asserting the call itself rather than only its output.
     */
    const stubFetch = (body, {ok = true, status = 200} = {}) => {
        const calls = [];

        globalThis.fetch = async (url, init) => {
            calls.push({url, init});

            if (typeof body === 'function') return body();

            return {ok, status, text: async () => body}
        };

        return calls
    };

    /** Stubs the provenance read only; every other path keeps the real reader. */
    const stubProvenance = record => {
        Storage.readJson = async (path, defaultValue) =>
            path === config.paths.indexProvenance ? record : originalReadJson(path, defaultValue)
    };

    const digestOfSerialized = () => Storage.digestOf(SERIALIZED);

    test('AC-1: the fetched path and the checkout path return identical records', async () => {
        // The current behaviour is this change's own control. If the two paths can disagree, the
        // migration is not a migration — it is a second, differently-wrong source of truth.
        stubFetch(SERIALIZED);
        stubProvenance({digest: digestOfSerialized()});

        const fromArtifact = await Storage.getUsers();

        globalThis.fetch = async () => { throw new Error('network down') };
        Storage.readJson = async (path, defaultValue) =>
            path === config.paths.users ? RECORDS : originalReadJson(path, defaultValue);

        const fromCheckout = await Storage.getUsers();

        expect(fromArtifact).toEqual(RECORDS);
        expect(fromArtifact).toEqual(fromCheckout);
    });

    test('AC-5: the request goes to the single declared config URL, not a reassembled one', async () => {
        const calls = stubFetch(SERIALIZED);

        stubProvenance({digest: digestOfSerialized()});
        await Storage.getUsers();

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(config.publishedIndex.url);
        // Pinned independently of the config read, so a host silently reassembled at the use site
        // would fail here even if it happened to equal the config value today.
        expect(calls[0].url.startsWith('https://')).toBe(true);
    });

    test('AC-2: a fetch failure falls back to the tree AND says so — never silently', async () => {
        // A silent fallback is the failure this ticket must not ship: it leaves the git coupling in
        // place while the method appears to have removed it, and nothing downstream surfaces it.
        globalThis.fetch = async () => { throw new Error('ECONNREFUSED') };

        Storage.readJson = async (path, defaultValue) =>
            path === config.paths.users ? RECORDS : originalReadJson(path, defaultValue);

        const warned   = [];
        const realWarn = console.warn;

        console.warn = message => warned.push(String(message));

        try {
            const result = await Storage.getUsers();

            expect(result).toEqual(RECORDS);
            expect(warned.some(line => line.includes('Falling back to the checkout copy'))).toBe(true);
            expect(warned.some(line => line.includes('ECONNREFUSED'))).toBe(true);
        } finally {
            console.warn = realWarn
        }
    });

    test('AC-2: a non-2xx response is a fallback, not a body to parse', async () => {
        // `response.text()` on a 404 returns an error PAGE, which would parse as garbage or throw
        // deep in the JSON reader rather than at the boundary that knows what happened.
        stubFetch('<!DOCTYPE html><html>404</html>', {ok: false, status: 404});

        Storage.readJson = async (path, defaultValue) =>
            path === config.paths.users ? RECORDS : originalReadJson(path, defaultValue);

        const warned   = [];
        const realWarn = console.warn;

        console.warn = message => warned.push(String(message));

        try {
            const result = await Storage.getUsers();

            expect(result).toEqual(RECORDS);
            expect(warned.some(line => line.includes('HTTP 404'))).toBe(true);
        } finally {
            console.warn = realWarn
        }
    });

    test('a 200 carrying an unparseable body falls back on the BOOTSTRAP run, rather than throwing', async () => {
        // The uncovered path, and the dangerous one. With provenance recorded, a mangled body fails
        // the digest comparison and never reaches the parse. With provenance ABSENT — the first run
        // after adoption, which the code itself calls expected — nothing has verified these bytes, so
        // an HTML interstitial or a truncated transfer arrives at `JSON.parse`. Unguarded that throws
        // out of `getUsers()` and takes the run down on the one run documented as normal.
        stubFetch('<!DOCTYPE html><html>portal login</html>', {ok: true, status: 200});
        stubProvenance(null);

        Storage.readJson = async (path, defaultValue) =>
            path === config.paths.indexProvenance ? null :
            path === config.paths.users          ? RECORDS : originalReadJson(path, defaultValue);

        const warned   = [];
        const realWarn = console.warn;

        console.warn = message => warned.push(String(message));

        try {
            // The assertion is that this RESOLVES at all. Before the guard it rejected.
            const result = await Storage.getUsers();

            expect(result).toEqual(RECORDS);
            expect(warned.some(line => line.includes('not parseable JSONL'))).toBe(true);
        } finally {
            console.warn = realWarn
        }
    });

    test('AC-3: a digest mismatch falls back rather than mutating an artifact we did not write', async () => {
        stubFetch(SERIALIZED);
        stubProvenance({digest: 'f'.repeat(64)});

        const warned   = [];
        const realWarn = console.warn;

        console.warn = message => warned.push(String(message));

        try {
            const result = await Storage.getUsers();

            // Fell through to the real tree read rather than returning the fetched records.
            expect(result).not.toEqual(RECORDS);
            expect(warned.some(line => line.includes('does not match what we last wrote'))).toBe(true);
        } finally {
            console.warn = realWarn
        }
    });

    test('AC-3: ABSENCE of provenance is not mismatch — the first run must be able to proceed', async () => {
        // The sibling arm above and this one are the whole point of separating the two states. If
        // "no record" were treated as "wrong record", this path would be unreachable forever and the
        // pipeline would never leave the checkout, while every log line claimed it had.
        stubFetch(SERIALIZED);
        stubProvenance(null);

        const warned   = [];
        const realWarn = console.warn;

        console.warn = message => warned.push(String(message));

        try {
            const result = await Storage.getUsers();

            expect(result).toEqual(RECORDS);
            expect(warned.some(line => line.includes('No index provenance recorded yet'))).toBe(true);
            expect(warned.some(line => line.includes('Falling back'))).toBe(false);
        } finally {
            console.warn = realWarn
        }
    });

    test('AC-4: the curated files still come from the checkout, untouched by this change', async () => {
        // The derived index may leave git; the curated inputs may not. `blocklist.json` carries
        // somebody's opt-out decision and is the one file in that directory nothing can regenerate,
        // so this pins that moving the index read did not quietly widen to the curated files.
        const calls          = stubFetch(SERIALIZED);
        let   requestedPaths = [];

        Storage.readJson = async (path, defaultValue) => {
            requestedPaths.push(path);
            return path === config.paths.blocklist ? ['spam-bot'] : originalReadJson(path, defaultValue)
        };

        const blocked = await Storage.getBlocklist();

        expect([...blocked]).toEqual(['spam-bot']);
        expect(requestedPaths).toContain(config.paths.blocklist);
        // The blocklist read issued no network request of its own.
        expect(calls).toHaveLength(0);
    });

    test('the digest is taken over the bytes written, so it survives a re-serialisation', async () => {
        // Deriving the digest from the in-memory records instead would compare a re-serialisation
        // against a transmission: identical data, different bytes, and a mismatch indistinguishable
        // from tampering.
        const fromBytes   = Storage.digestOf(SERIALIZED),
              fromRecords = Storage.digestOf(RECORDS.map(r => JSON.stringify(r)).join('\n'));

        expect(fromBytes).toBe(fromRecords);
        expect(fromBytes).toMatch(/^[0-9a-f]{64}$/);
        expect(Storage.digestOf(`${SERIALIZED}\n`)).not.toBe(fromBytes);
    });
});
