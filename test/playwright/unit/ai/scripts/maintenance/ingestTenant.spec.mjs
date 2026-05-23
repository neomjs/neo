import {setup} from '../../../../setup.mjs';

const appName = 'IngestTenantCliTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {Readable}     from 'stream';

/**
 * Unit coverage for the `ai:ingest-tenant` Phase 2C bulk-facade CLI (#11635).
 *
 * Tests the three exported pure units — `parseArgs`, `readJsonlRecords`, `runIngest` —
 * substrate-free: `runIngest` takes an injected `ingestFn`, so batching / error-handling /
 * summary-aggregation are verified without the Knowledge Base. The module is dynamically
 * imported in `beforeAll` (after `setup()`), and its `import.meta` main guard keeps the CLI
 * from auto-running when imported here. End-to-end CLI + Chroma behaviour is the separate
 * integration test.
 */

/**
 * Wraps an array as an async iterable for `runIngest`'s `records` parameter.
 * @param {Array} entries
 * @returns {AsyncIterable}
 */
async function* asAsyncIterable(entries) {
    for (const entry of entries) {
        yield entry;
    }
}

test.describe('ai/scripts/maintenance/ingestTenant — Phase 2C CLI (#11635)', () => {
    let parseArgs, readJsonlRecords, runIngest;

    test.beforeAll(async () => {
        ({parseArgs, readJsonlRecords, runIngest} = await import('../../../../../../ai/scripts/maintenance/ingestTenant.mjs'));
    });

    test.describe('parseArgs', () => {
        test('parses the tenantId positional and --from-file', () => {
            expect(parseArgs(['neo-shared', '--from-file', 'chunks.jsonl'])).toEqual({
                tenantId : 'neo-shared',
                fromFile : 'chunks.jsonl',
                fromStdin: false,
                batchSize: 500
            });
        });

        test('parses --from-stdin and a custom --batch-size', () => {
            expect(parseArgs(['tenant-a', '--from-stdin', '--batch-size', '100'])).toEqual({
                tenantId : 'tenant-a',
                fromFile : null,
                fromStdin: true,
                batchSize: 100
            });
        });

        test('defaults batchSize to 500 and tenantId to null when absent', () => {
            expect(parseArgs([])).toEqual({
                tenantId : null,
                fromFile : null,
                fromStdin: false,
                batchSize: 500
            });
        });
    });

    test.describe('readJsonlRecords', () => {
        test('yields one record per JSONL line and skips blank lines', async () => {
            const entries = [];

            for await (const entry of readJsonlRecords(Readable.from('{"a":1}\n\n  \n{"a":2}\n'))) {
                entries.push(entry);
            }

            expect(entries).toEqual([
                {record: {a: 1}, lineNo: 1},
                {record: {a: 2}, lineNo: 4}
            ]);
        });

        test('yields a parseError for a malformed line without aborting the stream', async () => {
            const entries = [];

            for await (const entry of readJsonlRecords(Readable.from('{"a":1}\nNOT JSON\n{"a":3}\n'))) {
                entries.push(entry);
            }

            expect(entries[0]).toEqual({record: {a: 1}, lineNo: 1});
            expect(entries[1].lineNo).toBe(2);
            expect(typeof entries[1].parseError).toBe('string');
            expect(entries[1].record).toBeUndefined();
            expect(entries[2]).toEqual({record: {a: 3}, lineNo: 3});
        });
    });

    test.describe('runIngest', () => {
        test('batches records into batchSize groups', async () => {
            const batchSizes = [];
            const records    = asAsyncIterable(
                [1, 2, 3, 4, 5].map(n => ({record: {n}, lineNo: n}))
            );

            const totals = await runIngest({
                records,
                batchSize: 2,
                ingestFn : files => {
                    batchSizes.push(files.length);
                    return {ingested: files.length, embeddingsGenerated: files.length, deleted: 0, errors: []};
                }
            });

            expect(batchSizes).toEqual([2, 2, 1]);
            expect(totals.batches).toBe(3);
            expect(totals.ingested).toBe(5);
            expect(totals.embeddingsGenerated).toBe(5);
        });

        test('counts JSONL parseError entries and records structured errors', async () => {
            const ingested = [];
            const records  = asAsyncIterable([
                {record: {n: 1}, lineNo: 1},
                {parseError: 'Unexpected token', lineNo: 2},
                {record: {n: 3}, lineNo: 3},
                {parseError: 'Unexpected end of JSON input', lineNo: 4}
            ]);

            const totals = await runIngest({
                records,
                batchSize: 10,
                ingestFn : files => {
                    ingested.push(...files);
                    return {ingested: files.length, embeddingsGenerated: files.length, deleted: 0, errors: []};
                }
            });

            expect(totals.parseErrors).toBe(2);
            expect(totals.errors).toHaveLength(2);
            expect(totals.errors[0].code).toBe('KB_INGEST_CLI_JSONL_PARSE_FAILED');
            expect(totals.errors[0].message).toContain('Line 2');
            // ingestFn receives only the valid records
            expect(ingested).toEqual([{n: 1}, {n: 3}]);
            expect(totals.ingested).toBe(2);
        });

        test('propagates per-batch summary errors into totals.errors', async () => {
            const totals = await runIngest({
                records  : asAsyncIterable([{record: {n: 1}, lineNo: 1}]),
                batchSize: 10,
                ingestFn : () => ({
                    ingested           : 1,
                    embeddingsGenerated: 0,
                    deleted            : 0,
                    errors             : [{code: 'KB_VECTOR_EMBED_FAILED', message: 'embed failed'}]
                })
            });

            expect(totals.ingested).toBe(1);
            expect(totals.errors).toHaveLength(1);
            expect(totals.errors[0].code).toBe('KB_VECTOR_EMBED_FAILED');
        });

        test('returns the zero-summary shape for an empty stream and never calls ingestFn', async () => {
            let called = false;

            const totals = await runIngest({
                records  : asAsyncIterable([]),
                batchSize: 10,
                ingestFn : () => {
                    called = true;
                    return {ingested: 0, embeddingsGenerated: 0, deleted: 0, errors: []};
                }
            });

            expect(called).toBe(false);
            expect(totals).toEqual({
                ingested           : 0,
                embeddingsGenerated: 0,
                deleted            : 0,
                batches            : 0,
                parseErrors        : 0,
                errors             : []
            });
        });
    });
});
