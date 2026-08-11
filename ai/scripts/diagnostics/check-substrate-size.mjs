/**
 * @plane in-plane
 */
import fs   from 'fs';
import path from 'path';

/**
 * Pre-Flight (structural fast-path): authoring `ai/scripts/diagnostics/check-substrate-size.mjs`
 * matches sibling pattern of `ai/scripts/lint/lint-skill-manifest.mjs` in `ai/scripts/`;
 * both are mechanical enforcement / CI scripts for agent substrate validation;
 * sibling-file-lift applies; no novel directory choice.
 */

const ROOT_DIR = path.resolve(process.cwd());

// Per-file budget limit for Antigravity memory files (24 KiB hard limit).
const PER_FILE_LIMIT_BYTES = 24576;

// The surfaces that Antigravity injects globally on every turn.
const TARGET_FILES = [
    'AGENTS.md',
    '.agents/ANTIGRAVITY_RULES.md'
];

/**
 * Budgets over a GROUP of files rather than each file alone.
 *
 * A per-file limit cannot express "these two files are read together, so their SUM is the cost" —
 * the shape a graduated merge-eligibility boundary takes. Without a group model such a boundary can
 * only live as prose, and prose drifts silently: this budget's own surface grew past its limit by a
 * hundred-odd bytes and sat there unnoticed, because nothing was watching. Gradual drift is exactly
 * what a human reader cannot see and a byte count can.
 *
 * `limitBytes` is a graduated number owned by the decision that set it — named in `label`, so the
 * failure output points at the authority rather than at this file. Never re-baseline it to
 * accommodate drift: that inverts the point. Raising it is a decision with a rationale, not a lint
 * edit.
 *
 * **`limitBytes` is EXCLUSIVE.** The graduating decision reads "the combined two-file boundary is
 * `< 41,357 B`", and that number is the pre-existing baseline the surface had to get *below* — so
 * landing exactly on it is the breach, not the last legal state. The largest legal sum is therefore
 * `limitBytes - 1`, and every comparison and message below is expressed against that one relation.
 * Reporting headroom against `limitBytes` instead would tell an author "headroom 1" at the precise
 * size where the next byte fails.
 */
const COMBINED_BUDGETS = [
    {
        label     : 'pr-review loaded surface (#15257)',
        limitBytes: 41357,
        files     : [
            '.agents/skills/pr-review/audits/review-cost-circuit-breaker.md',
            '.agents/skills/pr-review/references/pr-review-guide.md'
        ]
    }
];

let hasError = false;

console.log(`\n🔍 Checking Antigravity Substrate sizes against ${PER_FILE_LIMIT_BYTES} byte per-file limit...`);
console.log('--------------------------------------------------------------------------------');

TARGET_FILES.forEach(file => {
    const fullPath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(fullPath)) {
        console.error(`❌ Error: Required substrate file ${file} not found.`);
        hasError = true;
        return;
    }

    const stats  = fs.statSync(fullPath);
    const size   = stats.size;
    const status = size > PER_FILE_LIMIT_BYTES ? '❌ EXCEEDS' : '✅ PASS';

    console.log(`📄 ${file.padEnd(30)} : ${size} bytes [${status}]`);

    if (size > PER_FILE_LIMIT_BYTES) {
        hasError = true;
    }
});

console.log('--------------------------------------------------------------------------------');

COMBINED_BUDGETS.forEach(budget => {
    console.log(`\n🔍 Checking combined budget "${budget.label}" against < ${budget.limitBytes} bytes...`);
    console.log('--------------------------------------------------------------------------------');

    let combined = 0,
        missing  = false;

    budget.files.forEach(file => {
        const fullPath = path.join(ROOT_DIR, file);

        if (!fs.existsSync(fullPath)) {
            // Fail closed: a budget that silently drops a renamed file measures a fiction and passes.
            console.error(`❌ Error: Budgeted file ${file} not found.`);
            missing  = true;
            hasError = true;
            return;
        }

        const size = fs.statSync(fullPath).size;

        combined += size;
        console.log(`📄 ${file.padEnd(62)} : ${size} bytes`);
    });

    if (missing) return;

    // The boundary is EXCLUSIVE (`< limitBytes`), so the largest legal sum is one byte below it.
    // Deriving that once and comparing everything against it keeps the verdict, the headroom and the
    // overage on a single relation — the earlier shape checked `> limitBytes` while its own spec
    // claimed the contract was `< limitBytes`, so equality passed and the green test certified the
    // opposite boundary.
    const maxBytes = budget.limitBytes - 1,
          over     = combined > maxBytes,
          status   = over ? '❌ EXCEEDS' : '✅ PASS';

    // Report headroom, not just pass/fail: the drift this exists to catch is gradual, so a shrinking
    // margin is the signal — by the time it flips to EXCEEDS the substrate is already broken.
    // Headroom counts bytes an author may still ADD, which is the question they are actually asking.
    console.log(`Σ  ${'combined'.padEnd(62)} : ${combined} bytes [${status}]`);
    console.log(`   limit < ${budget.limitBytes} (max ${maxBytes}) · ${over ? `OVER by ${combined - maxBytes}` : `headroom ${maxBytes - combined}`} bytes`);

    if (over) hasError = true
});

console.log('--------------------------------------------------------------------------------');

if (hasError) {
    console.error(`\n❌ Substrate Size Check FAILED!`);
    console.error(`Either a file exceeds the Antigravity hard limit of ${PER_FILE_LIMIT_BYTES} bytes, or a combined budget above is over its limit.`);
    console.error(`Per-file breach: the bottom of the offending file is silently truncated and agents lose critical memory.`);
    console.error(`Combined breach: the graduated budget for a jointly-loaded surface is spent — see the ticket that set it.\n`);
    console.error(`Fix by migrating granular instructions to .agents/skills/ Atlas files (Progressive Disclosure).`);
    console.error(`Do NOT raise a limit to make this pass: a graduated budget is a decision, not a lint setting.`);
    process.exit(1);
}

console.log(`\n✅ Substrate Size Check PASSED. Per-file under ${PER_FILE_LIMIT_BYTES} bytes; all combined budgets within limit.\n`);
process.exit(0);
