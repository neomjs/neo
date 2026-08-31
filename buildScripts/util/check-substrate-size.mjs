import fs              from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * @module buildScripts/util/check-substrate-size
 * @summary Enforces the per-turn agent substrate byte budget across every harness entry point.
 *
 * ## Why this lives here
 *
 * The engine owns the substrate files. `AGENTS.md`, `.agents/ANTIGRAVITY_RULES.md` and
 * `.claude/CLAUDE.md` are committed in this repository, so the check that measures them belongs
 * beside its targets. It previously lived at `ai/scripts/diagnostics/check-substrate-size.mjs`,
 * which moved to `neomjs/neo-agent-brain` with the rest of `ai/` during the split — while the files
 * it guards stayed here. The result was a guard that was declared and built but routed nowhere:
 * unreferenced by any `package.json` script or workflow in *either* repository, and exiting 1 on
 * "Required substrate file not found" for all three targets when run in the repo that held it.
 *
 * Placement follows the sibling `buildScripts/util/check-*.mjs` family
 * (`check-engine-brain-boundary`, `check-package-contents`, `check-relative-links`,
 * `check-theme-surfaces`) — structural fast-path, no novel directory choice. Re-creating `ai/` in
 * the engine to host it would reintroduce exactly the tree the split removed, and
 * `check-engine-brain-boundary` exists to keep that direction one-way.
 *
 * ## What "size" means
 *
 * The cost a seat pays is the bytes its entry point *loads*, which is not the bytes the entry point
 * *is*. `lstat` on `.claude/CLAUDE.md` reports 12 — the length of the string `../AGENTS.md` — while
 * the seat reads ~24 KB through it. So both indirections are followed: symlinks via `realpathSync`,
 * and whole-line `@path` imports recursively, because an imported file may import further.
 *
 * @see https://github.com/neomjs/neo/issues/17175
 */

/**
 * Per-file budget, in bytes. Documented in-repo as ANTIGRAVITY's hard limit.
 *
 * Do NOT raise this to make a run pass: a graduated budget is an architectural decision, not a lint
 * setting. The remedy for a breach is Progressive Disclosure — move granular instruction into
 * `.agents/skills/` Atlas files.
 *
 * @member {Number} PER_FILE_LIMIT_BYTES
 */
export const PER_FILE_LIMIT_BYTES = 24576;

/**
 * The per-turn entry points, each naming the harness that loads it and whose constant governs it.
 *
 * **The number's substrate is per-harness, and inheriting one harness's constant into another's
 * contract is how correct-looking arithmetic governs the wrong seat.** `24576` is ANTIGRAVITY's
 * documented per-file hard limit. The Claude seat's own cap is an operator-stated constraint whose
 * *semantics* — what it is measured over — remain unconfirmed, because the experiment that would
 * settle them needs a fresh authenticated seat and has not run. Until it does, the
 * Claude row is checked against the inherited number and `limitConfirmed: false` says so out loud,
 * so the next reader inherits a flagged assumption rather than a silent one.
 *
 * @member {Object[]} TARGET_FILES
 */
export const TARGET_FILES = [
    {path: 'AGENTS.md',                    harness: 'Antigravity + Claude', limitConfirmed: true},
    {path: '.agents/ANTIGRAVITY_RULES.md', harness: 'Antigravity',          limitConfirmed: true},
    {path: '.claude/CLAUDE.md',            harness: 'Claude Code',          limitConfirmed: false}
];

/**
 * A whole-line `@path` import in a CLAUDE.md. Claude Code resolves these relative to the importing
 * file and loads the target's CONTENT, so the importer's own byte count is not what the seat pays.
 *
 * @member {RegExp} AT_IMPORT_PATTERN
 */
export const AT_IMPORT_PATTERN = /^@(\S+)\s*$/;

/**
 * @summary Returns the bytes a harness actually loads for an entry point, following BOTH indirections.
 *
 * A substrate entry point can reach its content two ways, and a near-miss once changed the file from
 * one to the other: `.claude/CLAUDE.md` is a SYMLINK to `AGENTS.md` today, and a proposed change
 * would have replaced it with a real file carrying `@`-imports. A check that reads only one form computes the
 * wrong total — `lstat` on the symlink reports 12 bytes (the target path string), and `stat` on an
 * import stub reports ~25 bytes, while the seat loads tens of kilobytes in both cases.
 *
 * Symlinks resolve through `realpathSync`, which also keys the cycle guard on file identity rather
 * than on the path used to reach it. Imports recurse, because an imported file may import further.
 *
 * @param {String} file Repo-relative or absolute path to the entry point.
 * @param {Object}   [options={}]
 * @param {String}   [options.root=REPO_ROOT] Base for relative paths and for reported member names.
 * @param {Set<String>} [options.seen] Realpaths already counted — cycle guard and double-count guard.
 * @returns {{bytes: Number, members: String[]}} Loaded bytes, and the imported members contributing.
 * @throws {Error} If an import names a file that does not exist — a budget that silently drops a
 *   renamed member measures a fiction and passes, so this fails closed rather than skipping.
 */
export function resolveLoadedSize(file, {root = REPO_ROOT, seen = new Set()} = {}) {
    const
        full = path.isAbsolute(file) ? file : path.join(root, file),
        real = fs.realpathSync(full);

    // An entry point reachable twice (symlink plus direct import) is paid for once by the loader.
    if (seen.has(real)) {
        return {bytes: 0, members: []}
    }

    seen.add(real);

    const
        text    = fs.readFileSync(real, 'utf8'),
        members = [];

    let bytes = Buffer.byteLength(text, 'utf8');

    text.split('\n').forEach(line => {
        const match = line.match(AT_IMPORT_PATTERN);

        if (!match) {
            return
        }

        const target = path.resolve(path.dirname(real), match[1]);

        if (!fs.existsSync(target)) {
            throw new Error(`${file} imports '${match[1]}', which does not exist`)
        }

        const child = resolveLoadedSize(target, {root, seen});

        bytes += child.bytes;
        members.push(path.relative(root, target), ...child.members)
    });

    return {bytes, members}
}

/**
 * @summary Measures every target and returns one row per entry point — the pure half of the guard.
 *
 * Returned rather than printed so the arms that matter can be asserted without spawning a process:
 * a guard whose only observable is stdout gets tested by reading its own log line back, which
 * confirms the formatter rather than the measurement.
 *
 * @param {Object}     [options={}]
 * @param {String}     [options.root=REPO_ROOT] Tree to measure — a temp fixture in tests.
 * @param {Object[]}   [options.targets=TARGET_FILES]
 * @param {Number}     [options.limit=PER_FILE_LIMIT_BYTES]
 * @returns {Object[]} Rows: `{file, harness, limitConfirmed, bytes, members, over, headroom, error}`.
 *   A row carrying `error` is a failure, never a skip.
 */
export function collectReport({root = REPO_ROOT, targets = TARGET_FILES, limit = PER_FILE_LIMIT_BYTES} = {}) {
    return targets.map(({path: file, harness, limitConfirmed}) => {
        const row = {file, harness, limitConfirmed, bytes: null, members: [], over: false, headroom: null, error: null};

        if (!fs.existsSync(path.join(root, file))) {
            row.error = `Required substrate file ${file} not found.`;
            return row
        }

        let loaded;

        try {
            loaded = resolveLoadedSize(file, {root})
        } catch (error) {
            // Fail closed: an unresolvable member means the total is unknown, and an unknown total
            // must never render as a pass.
            row.error = error.message;
            return row
        }

        row.bytes    = loaded.bytes;
        row.members  = loaded.members;
        row.over     = loaded.bytes > limit;
        row.headroom = limit - loaded.bytes;

        return row
    })
}

/**
 * @summary Prints the report and exits non-zero if any target breached or could not be measured.
 * @returns {Number} The process exit code, so a caller can assert it without a spawn.
 */
export function main({root = REPO_ROOT, targets = TARGET_FILES, limit = PER_FILE_LIMIT_BYTES} = {}) {
    const rows = collectReport({root, targets, limit});

    console.log(`\n🔍 Checking agent substrate sizes against the ${limit} byte per-file limit...`);
    console.log('--------------------------------------------------------------------------------');

    rows.forEach(({file, harness, limitConfirmed, bytes, members, over, headroom, error}) => {
        if (error) {
            console.error(`❌ Error: ${error}`);
            return
        }

        const status = over ? '❌ EXCEEDS' : '✅ PASS';

        console.log(`📄 ${file.padEnd(30)} : ${bytes} bytes [${status}] · ${harness}${limitConfirmed ? '' : ' · limit INHERITED from another harness, semantics unconfirmed'}`);

        // Headroom, not just pass/fail: this drift is gradual, so a shrinking margin is the signal —
        // by the time it flips to EXCEEDS the substrate is already truncating. Counts bytes an
        // author may still ADD, which is the question they are actually asking.
        console.log(`   limit ${limit} · ${over ? `OVER by ${-headroom}` : `headroom ${headroom}`} bytes`);

        // Name what the total is made of whenever it is not just the file itself, so a reader can
        // see WHY an entry point costs more than its own bytes rather than re-deriving the chain.
        members.length && console.log(`   composed via @-import: ${members.join(', ')}`)
    });

    console.log('--------------------------------------------------------------------------------');

    if (rows.some(row => row.error || row.over)) {
        console.error(`\n❌ Substrate Size Check FAILED!`);
        console.error(`A file exceeds the hard limit of ${limit} bytes: the bottom of the offending file is silently truncated and agents lose critical memory.`);
        console.error(`Fix by migrating granular instructions to .agents/skills/ Atlas files (Progressive Disclosure).`);
        console.error(`Do NOT raise a limit to make this pass: a graduated budget is a decision, not a lint setting.`);

        return 1
    }

    console.log(`\n✅ Substrate Size Check PASSED. Every measured file is under ${limit} bytes.\n`);

    return 0
}

// Entrypoint guard, realpath-hardened on BOTH sides. The common spellings compare `process.argv[1]`
// to `import.meta.url` directly, which disagree whenever the script is reached through a symlink:
// argv[1] is the link path, import.meta.url is the resolved target, so the module loads, `main()`
// never runs, and the process exits 0 — a guard that silently stops guarding.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exit(main())
}
