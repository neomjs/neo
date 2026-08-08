import {test, expect}                                                        from '@playwright/test';
import fs                                                                    from 'fs-extra';
import path                                                                  from 'path';
import {fileURLToPath}                                                       from 'url';
import {classifyExportCompleteness, EXPORT_COMPLETENESS, recordExportGrowth} from '../../../../../../ai/services/memory-core/helpers/exportCompleteness.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

test.describe('exportCompleteness — a collection that GREW is not a partial export', () => {
    test('the exact production abort (32272/32271) is growth, not a loss', () => {
        // Every backup on the plane died on this comparison: one row MORE than the pre-pass count,
        // because a live agent wrote a single memory mid-export.
        expect(classifyExportCompleteness(32272, 32271)).toBe(EXPORT_COMPLETENESS.grew)
    });

    test('a genuine loss still aborts — the guard keeps its teeth', () => {
        expect(classifyExportCompleteness(32270, 32271)).toBe(EXPORT_COMPLETENESS.partial);
        expect(classifyExportCompleteness(0, 61206)).toBe(EXPORT_COMPLETENESS.partial)
    });

    test('an exact match is complete', () => {
        expect(classifyExportCompleteness(32271, 32271)).toBe(EXPORT_COMPLETENESS.complete);
        expect(classifyExportCompleteness(0, 0)).toBe(EXPORT_COMPLETENESS.complete)
    });

    test('an unreadable count refuses — it can never certify a bundle', () => {
        // The failure this whole module exists to remove: an absent measurement vouching for
        // everything beneath it. Neither `complete` nor `grew` is an honest answer here.
        for (const bad of [undefined, null, NaN, Infinity, -Infinity, '32271', {}]) {
            expect(classifyExportCompleteness(bad, 32271)).toBe(EXPORT_COMPLETENESS.indeterminate);
            expect(classifyExportCompleteness(32271, bad)).toBe(EXPORT_COMPLETENESS.indeterminate)
        }
    });

    test('growth is stamped on the receipt, so the bundle never reads as a clean capture', () => {
        const stats = {collection: 'neo-agent-memory', expected: 32271, exported: 32272};

        recordExportGrowth(stats);

        expect(stats.grewDuringExport).toBe(true);
        expect(stats.growthDelta).toBe(1)
    });
});

test.describe('exportCompleteness — every export path states what it actually captured', () => {
    // The predicate was wrong at BOTH Memory Core sites, and the second was found only by grepping
    // for the SHAPE rather than for the error that fired. The third — the Knowledge Base mirror —
    // was found only by asking who consumes the count. This is the mechanical sunset: a fourth
    // export path fails here instead of silently mis-reporting backups again.
    const EXPORT_PATHS = [
        {file: 'ai/services/memory-core/DatabaseService.mjs',    classifierCalls: 2},
        {file: 'ai/services/knowledge-base/DatabaseService.mjs', classifierCalls: 1}
    ];

    for (const {file, classifierCalls} of EXPORT_PATHS) {
        test(`${file} compares counts only through the shared classifier`, () => {
            const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');

            const bareComparisons = source
                .split('\n')
                .map((line, index) => ({line: line.trim(), number: index + 1}))
                .filter(({line}) => /\bexported\s*(!==|!=|===|==)\s*(stats\.)?(expected|count)\b/.test(line));

            expect(bareComparisons, 'bare exported/expected comparisons must route through ' +
                `classifyExportCompleteness — found: ${JSON.stringify(bareComparisons)}`).toEqual([]);

            // Positive control: the scan really is pointed at a file that classifies, so an empty
            // result means "routed", never "the file moved and the scan found nothing".
            expect(source.match(/classifyExportCompleteness\(/g)).toHaveLength(classifierCalls)
        });
    }

    test('the KB export returns what it WROTE, never the pre-pass snapshot', () => {
        // `exportDatabase`'s count feeds the backup orchestrator's verifyBundleIntegrity KB
        // row-count parity. Returning the snapshot made the verifier compare it against itself,
        // so an export that dropped rows in the per-id rescue path verified clean.
        const source = fs.readFileSync(
            path.join(REPO_ROOT, 'ai/services/knowledge-base/DatabaseService.mjs'), 'utf8'
        );

        expect(source).not.toMatch(/^\s*return count;\s*$/m);

        // The written total still travels as `exported`; the pre-pass snapshot now travels beside it
        // under a LABELLED `expected` rather than being passed off as the export figure: without an
        // expectation a zero has nothing to be zero against, so a zero-row export cannot fail its own
        // contract. A swap of these two bindings is the regression this guards, and it would read
        // plausibly at a glance.
        // Pins the BINDING, not the exact literal: `expected` must carry the pre-pass snapshot
        // (`count`) and `exported` the written total. A swap is the regression — it reads plausibly
        // and silently restores the original defect. Additive fields on the same return are allowed,
        // so this does not break every time the receipt grows.
        expect(source).toMatch(/return\s*\{\s*expected\s*:\s*count\s*,\s*exported\b/);
        // and the rescue path must TALLY its drops, not only log them
        expect(source).toMatch(/skipped\+\+/)
    });
});
