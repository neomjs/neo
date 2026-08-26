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

/**
 * The per-turn entry points, each naming the harness that loads it and whose constant governs it.
 *
 * **The number's substrate is per-harness, and inheriting one harness's constant into another's
 * contract is how correct-looking arithmetic governs the wrong seat.** `24576` is documented in-repo
 * as ANTIGRAVITY's per-file hard limit. The Claude seat's own cap is an operator-stated constraint
 * whose *semantics* — what it is measured over — remain unconfirmed, because the experiment that
 * would settle them needs an authenticated seat and has not run. Until it does, the Claude row is
 * checked against the inherited number and `limitConfirmed: false` says so out loud, so the next
 * reader inherits a flagged assumption rather than a silent one.
 *
 * @member {Object[]} TARGET_FILES
 */
const TARGET_FILES = [
    {path: 'AGENTS.md',                    harness: 'Antigravity + Claude', limitConfirmed: true},
    {path: '.agents/ANTIGRAVITY_RULES.md', harness: 'Antigravity',          limitConfirmed: true},
    {path: '.claude/CLAUDE.md',            harness: 'Claude Code',          limitConfirmed: false}
];

// A whole-line `@path` import in a CLAUDE.md. Claude Code resolves these relative to the importing
// file and loads the target's CONTENT, so the importer's own byte count is not what the seat pays.
const AT_IMPORT_PATTERN = /^@(\S+)\s*$/;

/**
 * @summary Returns the bytes a harness actually loads for an entry point, following BOTH indirections.
 *
 * A substrate entry point can reach its content two ways, and a near-miss once changed the file from
 * one to the other: `.claude/CLAUDE.md` is a SYMLINK to `AGENTS.md` today, and a proposed change
 * would have replaced it with a real file carrying `@`-imports. A check that reads only one form
 * computes the wrong total — `lstat` on the symlink reports 12 bytes (the target path string), and
 * `stat` on an import stub reports ~25 bytes, while the seat loads tens of kilobytes in both cases.
 *
 * Symlinks resolve through `realpathSync`, which also keys the cycle guard on file identity rather
 * than on the path used to reach it. Imports recurse, because an imported file may import further.
 *
 * @param {String} file Repo-relative or absolute path to the entry point.
 * @param {Set<String>} [seen] Realpaths already counted — cycle guard and double-count guard.
 * @returns {{bytes: Number, members: String[]}} Loaded bytes, and the imported members contributing.
 * @throws {Error} If an import names a file that does not exist — a budget that silently drops a
 *   renamed member measures a fiction and passes, so this fails closed like the combined budgets do.
 */
function resolveLoadedSize(file, seen = new Set()) {
    const
        full = path.isAbsolute(file) ? file : path.join(ROOT_DIR, file),
        real = fs.realpathSync(full);

    // An entry point reachable twice (symlink plus direct import) is paid for once by the loader.
    if (seen.has(real)) {
        return {bytes: 0, members: []};
    }

    seen.add(real);

    const
        text    = fs.readFileSync(real, 'utf8'),
        members = [];

    let bytes = Buffer.byteLength(text, 'utf8');

    text.split('\n').forEach(line => {
        const match = line.match(AT_IMPORT_PATTERN);

        if (!match) {
            return;
        }

        const target = path.resolve(path.dirname(real), match[1]);

        if (!fs.existsSync(target)) {
            throw new Error(`${file} imports '${match[1]}', which does not exist`);
        }

        const child = resolveLoadedSize(target, seen);

        bytes += child.bytes;
        members.push(path.relative(ROOT_DIR, target), ...child.members);
    });

    return {bytes, members};
}

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
// Empty by design. The one entry here bounded a loaded surface whose files now live in the
// canonical agent-skills package rather than this repository. A combined budget over files that are
// absent sums to zero and passes forever, so the rule was moved to the repository that still holds
// its subject instead of being left here as a guard with nothing to guard.
const COMBINED_BUDGETS = [];

let hasError = false;

console.log(`\n🔍 Checking Antigravity Substrate sizes against ${PER_FILE_LIMIT_BYTES} byte per-file limit...`);
console.log('--------------------------------------------------------------------------------');

TARGET_FILES.forEach(({path: file, harness, limitConfirmed}) => {
    const fullPath = path.join(ROOT_DIR, file);

    if (!fs.existsSync(fullPath)) {
        console.error(`❌ Error: Required substrate file ${file} not found.`);
        hasError = true;
        return;
    }

    let loaded;

    try {
        loaded = resolveLoadedSize(file);
    } catch (error) {
        // Fail closed for the same reason the combined budgets do: an unresolvable member means the
        // total is unknown, and an unknown total must never render as a pass.
        console.error(`❌ Error: ${error.message}`);
        hasError = true;
        return;
    }

    const
        size   = loaded.bytes,
        over   = size > PER_FILE_LIMIT_BYTES,
        status = over ? '❌ EXCEEDS' : '✅ PASS';

    console.log(`📄 ${file.padEnd(30)} : ${size} bytes [${status}] · ${harness}${limitConfirmed ? '' : ' · limit INHERITED from another harness, semantics unconfirmed'}`);

    // Headroom, not just pass/fail: this drift is gradual, so a shrinking margin is the signal — by
    // the time it flips to EXCEEDS the substrate is already truncating. Counts bytes an author may
    // still ADD, which is the question they are actually asking.
    console.log(`   limit ${PER_FILE_LIMIT_BYTES} · ${over ? `OVER by ${size - PER_FILE_LIMIT_BYTES}` : `headroom ${PER_FILE_LIMIT_BYTES - size}`} bytes`);

    // Name what the total is made of whenever it is not just the file itself, so a reader can see
    // WHY an entry point costs more than its own bytes rather than re-deriving the import chain.
    loaded.members.length && console.log(`   composed via @-import: ${loaded.members.join(', ')}`);

    if (over) {
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
