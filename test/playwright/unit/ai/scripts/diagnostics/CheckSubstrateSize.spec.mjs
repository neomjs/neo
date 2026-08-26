import { test, expect }  from '@playwright/test';
import { execFileSync }  from 'node:child_process';
import path              from 'node:path';
import fs                from 'node:fs';
import os                from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../../');
const scriptPath = path.join(repoRoot, 'ai/scripts/diagnostics/check-substrate-size.mjs');

/**
 * Self-test for the substrate size guard: every measured file stays under the per-file limit, and
 * the guard can still FAIL.
 *
 * The interesting surface is the Claude entry point, which reaches its content two ways — a symlink
 * or a file of `@`-imports — and a guard that measures only one of them reports a 24 KiB load as
 * tiny forever.
 *
 * The script reads from `process.cwd()`, so each case runs it against a synthetic root rather than
 * the live repo: a spec that asserts against real file sizes would flip red the day someone edits
 * one of them, which is drift-coupling, not a test.
 */
test.describe('check-substrate-size.mjs', () => {
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

    // Mirrors production: `.claude/CLAUDE.md` is a symlink, not a regular file.
    const symlinkClaudeEntry = (target = '../AGENTS.md') => {
        const full = path.join(tempDir, '.claude/CLAUDE.md');

        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.symlinkSync(target, full);
    };

    // `execFileSync` with an argv array, never `execSync` with an interpolated string: `scriptPath`
    // is derived from `import.meta.url`, so a repo checked out under a path containing a space or a
    // shell metacharacter would have the command re-split by the shell. `process.execPath` also pins
    // the child to the same Node binary running this suite rather than whichever `node` is on PATH.
    const run = () => {
        try {
            return { status: 0, output: execFileSync(process.execPath, [scriptPath], { cwd: tempDir, encoding: 'utf-8', stdio: 'pipe' }) };
        } catch (error) {
            return { status: error.status, output: (error.stdout || '') + (error.stderr || '') };
        }
    };

    test('a file one byte over the per-file limit fails', () => {
        writeFile('AGENTS.md', 24577);
        writeFile('.agents/ANTIGRAVITY_RULES.md', 1000);
        symlinkClaudeEntry();

        const result = run();

        expect(result.status).toBe(1);
        expect(result.output).toContain('EXCEEDS');
    });

    /**
     * The Claude entry point.
     *
     * `.claude/CLAUDE.md` reaches its content two ways, and a near-miss once changed the file from
     * one to the other: it is a symlink today, and a proposed change would have replaced it with a
     * real file carrying `@`-imports. The guard measured NEITHER — the path was not a target at all,
     * which is why that change rode green while altering what every Claude seat loads.
     *
     * Each case keeps `AGENTS.md` under its own per-file limit, so a failure here can only come from
     * the Claude entry rather than leaking in from the arm above.
     */
    test.describe('the Claude load path', () => {
        // The importer's own bytes count too — the seat loads this file AND its targets.
        const writeClaudeImporter = (...targets) => {
            const full = path.join(tempDir, '.claude/CLAUDE.md');

            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, targets.map(target => `@${target}`).join('\n') + '\n');

            return fs.statSync(full).size;
        };

        // Keeps the other arm comfortably legal, so a failure here can only come from the Claude
        // entry point rather than leaking in from a file this block is not about.
        const seedUnrelatedArms = () => {
            writeFile('AGENTS.md', 24000);
            writeFile('.agents/ANTIGRAVITY_RULES.md', 1000);
        };

        test('the SYMLINK form is measured through the link, not as its 12-byte path string', () => {
            seedUnrelatedArms();
            symlinkClaudeEntry();

            const result = run();

            expect(result.status).toBe(0);
            // The discriminator. `lstat` on this path reports 12 — the length of '../AGENTS.md' —
            // and a guard reading that would report a 24 KiB surface as comfortably tiny forever.
            // Seeing the TARGET's size is what proves the link was followed rather than counted.
            expect(result.output).toMatch(/\.claude\/CLAUDE\.md\s+: 24000 bytes/);
        });

        test('the @-IMPORT form is measured as the SUM it loads — the near-miss reproduced', () => {
            seedUnrelatedArms();
            writeFile('extra.md', 1586);

            const stub = writeClaudeImporter('../AGENTS.md', '../extra.md');

            // 27 + 24,000 + 1,586 = 25,613 against a 24,576 limit. Under the old guard this path was
            // unmeasured; under a stat-only guard it reads as the 27-byte stub and passes.
            expect(stub).toBe(27);

            const result = run();

            expect(result.status).toBe(1);
            expect(result.output).toMatch(/\.claude\/CLAUDE\.md\s+: 25613 bytes \[❌ EXCEEDS\]/);
            expect(result.output).toContain('OVER by 1037 bytes');
            // Naming the members is what turns "too big" into an actionable finding.
            expect(result.output).toContain('composed via @-import: AGENTS.md, extra.md');
        });

        test('the same import shape PASSES when the sum fits — the arm measures bytes, not the mere presence of an import', () => {
            seedUnrelatedArms();
            writeFile('extra.md', 100);
            writeClaudeImporter('../AGENTS.md', '../extra.md');

            const result = run();

            // Mutation control for the case above. Without it, an arm that failed on ANY @-import
            // would be indistinguishable from one that failed on the total — and would still be green.
            expect(result.status).toBe(0);
            expect(result.output).toMatch(/\.claude\/CLAUDE\.md\s+: 24127 bytes/);
        });

        test('EXACTLY at the per-file limit passes, and one byte more fails — the boundary is `>`, not `>=`', () => {
            // Worth pinning precisely: production `AGENTS.md` currently sits 2 bytes under this
            // number, so which side of the boundary is legal is not a hypothetical distinction.
            seedUnrelatedArms();
            writeFile('extra.md', 549); // 27 + 24,000 + 549 = 24,576 exactly

            writeClaudeImporter('../AGENTS.md', '../extra.md');
            expect(run().status).toBe(0);

            writeFile('extra.md', 550); // = 24,577
            expect(run().status).toBe(1);
        });

        test('an import naming a missing file fails CLOSED — an unknown total must never render as a pass', () => {
            seedUnrelatedArms();
            writeClaudeImporter('../AGENTS.md', '../vanished.md');

            const result = run();

            expect(result.status).toBe(1);
            expect(result.output).toContain("imports '../vanished.md', which does not exist");
        });
    });
});
