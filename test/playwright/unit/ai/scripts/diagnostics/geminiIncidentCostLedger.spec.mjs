import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'node:fs';
import path           from 'node:path';

const
    repoRoot   = process.cwd(),
    scriptPath = path.join(repoRoot, 'ai/scripts/diagnostics/gemini-incident-cost-ledger.mjs');

/**
 * @summary Unit coverage for the Gemini incident cost ledger helper.
 *
 * Verifies that the diagnostic can parse orchestrator miniSummary backfill events inside a
 * bounded time window and convert aggregate, private-content-safe length stats into cost bands.
 *
 * @see ai/scripts/diagnostics/gemini-incident-cost-ledger.mjs
 */
test.describe('gemini-incident-cost-ledger diagnostic', () => {
    test('rejects unknown flags through commander', async () => {
        const {parseArgs} = await import('../../../../../../ai/scripts/diagnostics/gemini-incident-cost-ledger.mjs');

        expect(() => parseArgs(['--unknown-flag'])).toThrow(/unknown option '--unknown-flag'/);
    });

    test('parses backfill log events and computes private-content-safe cost bands', () => {
        const
            fixtureDir  = path.join(repoRoot, 'tmp', `gemini-ledger-${process.pid}-${Date.now()}`),
            fixtureFile = path.join(fixtureDir, 'orchestrator.log');

        fs.mkdirSync(fixtureDir, {recursive: true});

        fs.writeFileSync(fixtureFile, [
            '[2026-06-08T06:40:00.000Z] [PID:1] [INFO] [ProcessSupervisor] Starting memory miniSummary backfill (pending-memory-minisummary:50).',
            '[2026-06-08T06:41:00.000Z] [PID:1] [INFO] [ProcessSupervisor] memory miniSummary backfill completed successfully.',
            '[2026-06-08T06:42:00.000Z] [PID:1] [INFO] [Orchestrator] Deferring memory miniSummary backfill; heavy maintenance task session summarization is active (pending-memory-minisummary:50).',
            '[2026-06-08T06:43:00.000Z] [PID:1] [INFO] [ProcessSupervisor] Starting memory miniSummary backfill (pending-memory-minisummary:50).',
            '[2026-06-08T06:44:00.000Z] [PID:1] [INFO] [Orchestrator] Deferring session summarization; heavy maintenance task memory miniSummary backfill is active (periodic-sweep:600000).',
            '[2026-06-08T06:46:00.000Z] [PID:1] [INFO] [ProcessSupervisor] Starting memory miniSummary backfill (pending-memory-minisummary:50).'
        ].join('\n'));

        try {
            const output = execFileSync('node', [
                scriptPath,
                '--log', fixtureFile,
                '--window-start', '2026-06-08T06:41:30.000Z',
                '--window-end', '2026-06-08T06:45:00.000Z',
                '--input-chars-mean', '1000',
                '--output-tokens', '50',
                '--fixed-prompt-chars', '0',
                '--billing-cost', '50',
                '--json'
            ], {cwd: repoRoot, encoding: 'utf8'});

            const ledger = JSON.parse(output);

            expect(ledger.totals.starts).toBe(1);
            expect(ledger.totals.completions).toBe(0);
            expect(ledger.totals.pendingDeferrals).toBe(1);
            expect(ledger.totals.activeTaskDeferrals).toBe(1);
            expect(ledger.totals.maxRepresentedCallAttempts).toBe(50);
            expect(ledger.estimates).toHaveLength(1);
            expect(ledger.estimates[0].label).toBe('mean');
            expect(ledger.estimates[0].inputTokensPerCall).toBe(250);
            expect(ledger.estimates[0].estimatedCost).toBeCloseTo(0.01375, 8);
            expect(ledger.billing.residuals[0].cost).toBeCloseTo(49.98625, 8);
        } finally {
            fs.rmSync(fixtureDir, {recursive: true, force: true});
        }
    });
});
