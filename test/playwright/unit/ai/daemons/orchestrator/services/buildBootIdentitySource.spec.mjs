import {test, expect}            from '@playwright/test';
import Neo                       from '../../../../../../../src/Neo.mjs';
import * as core                 from '../../../../../../../src/core/_export.mjs';
import fs                        from 'fs/promises';
import {buildBootIdentitySource} from '../../../../../../../ai/daemons/orchestrator/services/buildBootIdentitySource.mjs';

const MODULE_URL = new URL('../../../../../../../ai/daemons/orchestrator/services/buildBootIdentitySource.mjs', import.meta.url);

test.describe('buildBootIdentitySource — the orchestrator-side boot-identity source composition (#15079)', () => {
    test('constructs a source that produces an advisory fact, building the gatherer with bootAt + the REM dir', async () => {
        const seen           = [];
        const createGatherer = ({bootAt, remRunStateDir}) => {
            seen.push({bootAt, remRunStateDir});
            return async () => ({bootAt, sourceRef: 'abc', lastCycleAt: null});
        };

        const source = buildBootIdentitySource({remRunStateDir: '/rem', bootAt: 1000, createGatherer});

        expect(seen).toEqual([{bootAt: 1000, remRunStateDir: '/rem'}]); // the gatherer is built with bootAt + the shared REM dir
        expect(typeof source.produceBootIdentityFact).toBe('function');

        const result = await source.produceBootIdentityFact();
        expect(result.advisory).toBe(true);       // read-observe advisory, never a restart command
        expect(result.fact.bootAt).toBe(1000);
        expect(result.fact.sourceRef).toBe('abc');
    });

    test('FAIL-SOFT: a throwing gatherer factory returns null — never a broken orchestrator boot', () => {
        const createGatherer = () => { throw new Error('gatherer construction exploded') };

        expect(buildBootIdentitySource({remRunStateDir: '/rem', createGatherer})).toBeNull();
    });

    test('FAIL-SOFT: a failed service construction returns null', () => {
        // Neo.create(null, ...) throws → caught → null (the orchestrator then simply never writes a fact)
        expect(buildBootIdentitySource({remRunStateDir: '/rem', createGatherer: () => async () => ({}), ServiceClass: null})).toBeNull();
    });

    // --- global-Neo (no non-entrypoint import) + the real freshness composition ---

    test('ADR-0019 C1: the module has NO non-entrypoint `import Neo` (it uses the global Neo)', async () => {
        const src = await fs.readFile(MODULE_URL, 'utf8');
        expect(src).not.toMatch(/^\s*import\s+Neo\b/m); // a non-entrypoint `import Neo` is the C1 forbidden pattern
    });

    test('threads freshnessConfig so the classifier yields a real (non-unknown) verdict on a live cadence', async () => {
        // A last cycle 1s ago against a 60s cadence → designed-deferral (NOT the perpetual `unknown` of cfg={}).
        const createGatherer = () => async () => ({bootAt: 1000, lastCycleAt: 5000, schedulerResumeState: 'none'});

        const source = buildBootIdentitySource({
            remRunStateDir : '/rem',
            freshnessConfig: {designedCadenceMs: 60_000, marginMs: 0},
            nowFn          : () => 6000,
            createGatherer
        });

        const result = await source.produceBootIdentityFact();
        expect(result.classification).toBe('designed-deferral'); // the cadence is threaded → non-unknown
        expect(result.advisory).toBe(true);
    });

    test('WITHOUT a freshnessConfig the classifier stays `unknown` (the gap the wiring closes)', async () => {
        const createGatherer = () => async () => ({bootAt: 1000, lastCycleAt: 5000, schedulerResumeState: 'none'});

        const source = buildBootIdentitySource({remRunStateDir: '/rem', nowFn: () => 6000, createGatherer});
        const result = await source.produceBootIdentityFact();
        expect(result.classification).toBe('unknown'); // no designedCadenceMs → insufficient-facts
    });
});
