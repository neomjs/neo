import {test, expect}    from '@playwright/test';
import {parseCiFailures} from '../../../../../../ai/services/ingestion/parseCiFailures.mjs';

/**
 * Coverage for the pure file-level CI-failure dedup parser (slice 1 of the CI-triage lane). The report shape is
 * V-B-A'd against a live Playwright JSON report (nested suites[].specs[] with spec.ok + spec.file).
 * The file-level dedup + the total-on-malformed contract are pinned here.
 */
test.describe('ai/services/ingestion/parseCiFailures', () => {
    const report = specs => ({suites: [{specs}]});

    test('extracts a single failing spec-file', () => {
        expect(parseCiFailures(report([{file: 'data/Store.spec.mjs', ok: false}]))).toEqual(['data/Store.spec.mjs']);
    });

    test('file-level dedup: N failing tests in one file → ONE path', () => {
        const r = {suites: [{specs: [
            {file: 'data/Store.spec.mjs', ok: false},
            {file: 'data/Store.spec.mjs', ok: false},
            {file: 'data/Store.spec.mjs', ok: false}
        ]}]};
        expect(parseCiFailures(r)).toEqual(['data/Store.spec.mjs']);
    });

    test('multiple failing files → unique paths; passing specs excluded', () => {
        const r = {suites: [{specs: [
            {file: 'a.spec.mjs', ok: false},
            {file: 'b.spec.mjs', ok: true},
            {file: 'c.spec.mjs', ok: false}
        ]}]};
        expect(parseCiFailures(r).sort()).toEqual(['a.spec.mjs', 'c.spec.mjs']);
    });

    test('walks NESTED suites (suite.suites[])', () => {
        const r = {suites: [{specs: [], suites: [{specs: [{file: 'nested.spec.mjs', ok: false}]}]}]};
        expect(parseCiFailures(r)).toEqual(['nested.spec.mjs']);
    });

    test('accepts a raw JSON string', () => {
        expect(parseCiFailures(JSON.stringify(report([{file: 'x.spec.mjs', ok: false}])))).toEqual(['x.spec.mjs']);
    });

    test('all-passing report → []', () => {
        expect(parseCiFailures(report([{file: 'x.spec.mjs', ok: true}]))).toEqual([]);
    });

    test('total on malformed / non-object / unparseable input (never throws in the ingestion path)', () => {
        expect(parseCiFailures(null)).toEqual([]);
        expect(parseCiFailures(undefined)).toEqual([]);
        expect(parseCiFailures(42)).toEqual([]);
        expect(parseCiFailures('not json')).toEqual([]);
        expect(parseCiFailures({})).toEqual([]);
        expect(parseCiFailures({suites: 'bad'})).toEqual([]);
    });
});
