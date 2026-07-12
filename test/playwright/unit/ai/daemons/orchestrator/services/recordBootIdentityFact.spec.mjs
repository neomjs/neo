import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../../../../src/Neo.mjs';
import * as core                from '../../../../../../../src/core/_export.mjs';
import {recordBootIdentityFact} from '../../../../../../../ai/daemons/orchestrator/services/recordBootIdentityFact.mjs';

const advisoryFact = () => ({fact: {bootAt: 1000, sourceRef: 'abc'}, classification: 'designed-deferral', advisory: true, reason: 'within-cadence-margin'});

test.describe('recordBootIdentityFact — the orchestrator per-cycle boot-identity writer (#15079)', () => {
    test('produces the fact and persists it to the shared dir', async () => {
        const written = [];
        const source  = {produceBootIdentityFact: async () => advisoryFact()};

        const result = await recordBootIdentityFact({source, dir: '/shared/runtime', writeImpl: async (fact, {dir}) => { written.push({fact, dir}) }});

        expect(result).toMatchObject({classification: 'designed-deferral'});
        expect(written).toHaveLength(1);
        expect(written[0].dir).toBe('/shared/runtime');
        expect(written[0].fact).toMatchObject({classification: 'designed-deferral'});
    });

    test('no-ops (no write) on a missing source / missing produce method / missing dir', async () => {
        const written   = [];
        const writeImpl = async (fact, opts) => { written.push([fact, opts]) };

        expect(await recordBootIdentityFact({dir: '/x', writeImpl})).toBeNull();
        expect(await recordBootIdentityFact({source: {}, dir: '/x', writeImpl})).toBeNull();
        expect(await recordBootIdentityFact({source: {produceBootIdentityFact: async () => advisoryFact()}, dir: '', writeImpl})).toBeNull();
        expect(written).toHaveLength(0);
    });

    test('a null/absent fact from the source is NOT written (the reader keeps its honest advisory-unknown)', async () => {
        const written = [];
        const source  = {produceBootIdentityFact: async () => null};

        expect(await recordBootIdentityFact({source, dir: '/shared', writeImpl: async (...a) => { written.push(a) }})).toBeNull();
        expect(written).toHaveLength(0);
    });

    test('FAIL-SOFT: a throwing source never throws the cycle (returns null)', async () => {
        const source = {produceBootIdentityFact: async () => { throw new Error('gather exploded') }};

        await expect(recordBootIdentityFact({source, dir: '/shared'})).resolves.toBeNull();
    });

    test('FAIL-SOFT: a throwing writer never throws the cycle (returns null)', async () => {
        const source = {produceBootIdentityFact: async () => advisoryFact()};

        await expect(recordBootIdentityFact({source, dir: '/shared', writeImpl: async () => { throw new Error('disk full') }}))
            .resolves.toBeNull();
    });

    // --- observability: the fail-soft null is no longer a blind swallow ---

    test('OBSERVABLE: a genuine write failure fires onError with the error (fail-soft null preserved)', async () => {
        const seen   = [];
        const source = {produceBootIdentityFact: async () => advisoryFact()};

        const result = await recordBootIdentityFact({
            source, dir: '/shared',
            writeImpl: async () => { throw new Error('disk full') },
            onError  : error => seen.push(error.message)
        });

        expect(result).toBeNull();           // fail-soft: never gates the cycle
        expect(seen).toEqual(['disk full']); // …but the failure is surfaced, not swallowed blind (the dead-.catch fix)
    });

    test('a NO-OP (missing source / absent fact) does NOT fire onError — a no-op is not an error', async () => {
        const seen    = [];
        const onError = error => seen.push(error);

        expect(await recordBootIdentityFact({dir: '/x', onError})).toBeNull();                                    // missing source
        expect(await recordBootIdentityFact({source: {produceBootIdentityFact: async () => null}, dir: '/x', onError})).toBeNull(); // absent fact
        expect(seen).toHaveLength(0);
    });

    test('an onError that itself throws never gates the cycle (still resolves null)', async () => {
        const source = {produceBootIdentityFact: async () => advisoryFact()};

        await expect(recordBootIdentityFact({
            source, dir: '/shared',
            writeImpl: async () => { throw new Error('disk full') },
            onError  : () => { throw new Error('observer boom') }
        })).resolves.toBeNull();
    });
});
