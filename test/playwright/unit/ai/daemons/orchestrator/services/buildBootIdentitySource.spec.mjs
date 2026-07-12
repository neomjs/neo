import {test, expect}            from '@playwright/test';
import Neo                       from '../../../../../../../src/Neo.mjs';
import * as core                 from '../../../../../../../src/core/_export.mjs';
import {buildBootIdentitySource} from '../../../../../../../ai/daemons/orchestrator/services/buildBootIdentitySource.mjs';

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
});
