import {test, expect}                 from '@playwright/test';
import Neo                            from '../../../../../../src/Neo.mjs';
import * as core                      from '../../../../../../src/core/_export.mjs';
import {createBootIdentityReadSource} from '../../../../../../ai/services/fleet/createBootIdentityReadSource.mjs';

test.describe('createBootIdentityReadSource — the fleet-server reader over the shared boot-identity fact-file (#15079)', () => {
    test('produceBootIdentityFact returns the persisted advisory fact when the store has one, reading the given dir', async () => {
        const persisted = {fact: {bootAt: 1000, sourceRef: 'abc123'}, classification: 'current', advisory: true, reason: 'fresh'};
        const seen      = [];
        const source    = createBootIdentityReadSource({dir: '/shared/runtime', readImpl: async ({dir}) => { seen.push(dir); return persisted; }});

        expect(await source.produceBootIdentityFact()).toEqual(persisted);
        expect(seen).toEqual(['/shared/runtime']); // the reader is pointed at the shared dir
    });

    test('produceBootIdentityFact yields an advisory-unknown fact when the file is absent — never fabricated liveness', async () => {
        const source = createBootIdentityReadSource({dir: '/shared/runtime', readImpl: async () => null});

        expect(await source.produceBootIdentityFact()).toEqual({
            fact          : null,
            classification: 'unknown',
            advisory      : true,
            reason        : 'no-boot-identity-fact-file'
        });
    });

    test('the unknown fallback is a FRESH object each call — a caller can never mutate the shared constant', async () => {
        const source = createBootIdentityReadSource({dir: '/shared/runtime', readImpl: async () => null});

        const a = await source.produceBootIdentityFact();
        a.reason = 'mutated';
        const b = await source.produceBootIdentityFact();

        expect(b.reason).toBe('no-boot-identity-fact-file'); // b is unaffected by mutating a
    });

    test('the shape matches the in-process BootIdentityHealthService contract (advisory, never a restart command)', async () => {
        const source = createBootIdentityReadSource({dir: '/shared/runtime', readImpl: async () => null});
        const result = await source.produceBootIdentityFact();

        // read-observe: advisory + no restart/lifecycle command surface — the R3 read ÷ write seam
        expect(result.advisory).toBe(true);
        expect(result).not.toHaveProperty('restart');
        expect(typeof source.produceBootIdentityFact).toBe('function');
    });
});
