import { test, expect }  from '@playwright/test';
import { execSync }      from 'node:child_process';
import path              from 'node:path';
import fs                from 'node:fs';
import os                from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../../');
const scriptPath = path.join(repoRoot, 'ai/scripts/diagnostics/check-substrate-size.mjs');

/**
 * Self-test for the substrate size guard, focused on the COMBINED-budget arm.
 *
 * A per-file limit cannot express "these files are loaded together, so their sum is the cost". Such
 * a boundary was graduated for the pr-review surface, lived only as prose, and the guide then
 * drifted past it unnoticed. These specs pin the arm that would have caught it — and, more
 * importantly, pin that the guard can still FAIL.
 *
 * The script reads from `process.cwd()`, so each case runs it against a synthetic root rather than
 * the live repo: a spec that asserts against real file sizes would flip red the day someone edits
 * the guide, which is drift-coupling, not a test.
 */
test.describe('check-substrate-size.mjs — combined budgets', () => {
    let tempDir;

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-substrate-size-'));
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const writeFile = (relPath, bytes) => {
        const full = path.join(tempDir, relPath);

        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, 'x'.repeat(bytes));
    };

    // The per-file targets must exist and stay under 24 KiB, or that arm fails for its own reasons
    // and tells us nothing about the combined arm under test.
    const seedPerFileTargets = () => {
        writeFile('AGENTS.md', 1000);
        writeFile('.agents/ANTIGRAVITY_RULES.md', 1000);
    };

    const seedCombined = (circuitBreakerBytes, guideBytes) => {
        writeFile('.agents/skills/pr-review/audits/review-cost-circuit-breaker.md', circuitBreakerBytes);
        writeFile('.agents/skills/pr-review/references/pr-review-guide.md', guideBytes);
    };

    const run = () => {
        try {
            return { status: 0, output: execSync(`node ${scriptPath}`, { cwd: tempDir, encoding: 'utf-8', stdio: 'pipe' }) };
        } catch (error) {
            return { status: error.status, output: (error.stdout || '') + (error.stderr || '') };
        }
    };

    test('the combined budget FAILS when the pair exceeds its limit — the drift that went unnoticed', () => {
        seedPerFileTargets();
        // The historical breach, reproduced exactly: 4,506 + 36,986 = 41,492 against a `< 41,357` gate.
        seedCombined(4506, 36986);

        const result = run();

        expect(result.status).toBe(1);
        expect(result.output).toContain('EXCEEDS');
        // 136, not 135: the overage is measured against the largest LEGAL sum (41,356), not against
        // the exclusive gate number. The +135 in the ticket's story is the guide's growth
        // (36,851 → 36,986), which is a different quantity that happens to be adjacent.
        expect(result.output).toContain('OVER by 136 bytes');
    });

    test('the combined budget PASSES under its limit and reports HEADROOM, not just a verdict', () => {
        seedPerFileTargets();
        // The repaired state that brought the surface back under: 2,207 + 36,544 = 38,751.
        seedCombined(2207, 36544);

        const result = run();

        expect(result.status).toBe(0);
        // Headroom is the point: this drift is gradual, so a shrinking margin is the signal. By the
        // time the verdict flips, the substrate is already broken. It counts bytes an author may
        // still ADD — 2,605 against the largest legal sum of 41,356, not 2,606 against the gate.
        expect(result.output).toContain('headroom 2605 bytes');
    });

    test('EXACTLY at the limit FAILS — the graduated boundary is `< 41,357`, so landing on it is the breach', () => {
        // The number is the baseline the surface had to get BELOW; equality is not the last legal
        // state, it is the state the gate was created to reject.
        //
        // This spec previously asserted the opposite and was green. Its own name claimed "the
        // contract is < limit" while the assertion certified `<=` — the rule stated correctly in
        // prose and violated in the same breath, which is worse than an untested boundary because it
        // looks like coverage. Caught by @neo-gpt-emmy's RA-1, not by the suite.
        seedPerFileTargets();
        seedCombined(1, 41356); // = 41,357 exactly

        expect(run().status).toBe(1);
    });

    test('one byte UNDER the limit passes — the largest legal sum is 41,356', () => {
        seedPerFileTargets();
        seedCombined(1, 41355); // = 41,356

        const result = run();

        expect(result.status).toBe(0);
        // Zero headroom, and still passing: the next byte is the breach.
        expect(result.output).toContain('headroom 0 bytes');
    });

    test('one byte over the gate is a failure — the boundary is exact, not approximate', () => {
        seedPerFileTargets();
        seedCombined(1, 41357); // = 41,358

        expect(run().status).toBe(1);
    });

    test('a MISSING budgeted file fails closed — a renamed member must not silently shrink the sum', () => {
        seedPerFileTargets();
        // Only one member present: a budget that quietly drops the other measures a fiction and passes.
        writeFile('.agents/skills/pr-review/references/pr-review-guide.md', 100);

        const result = run();

        expect(result.status).toBe(1);
        expect(result.output).toContain('not found');
    });

    test('the per-file arm still fails independently — the combined arm did not replace it', () => {
        writeFile('AGENTS.md', 24577);
        writeFile('.agents/ANTIGRAVITY_RULES.md', 1000);
        seedCombined(2207, 36544);

        const result = run();

        expect(result.status).toBe(1);
        expect(result.output).toContain('EXCEEDS');
    });
});
