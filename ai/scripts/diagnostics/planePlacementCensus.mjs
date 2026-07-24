import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import * as acorn      from 'acorn';

/**
 * @module ai/scripts/diagnostics/planePlacementCensus
 * @summary Read-only census of the two cost axes the data-plane placement election is decided on:
 * **who opens the plane from the host**, and **whether a seat's plane leaves are containable by a
 * bind-mount of that seat**.
 *
 * ## Why this is a committed script rather than a one-off measurement
 *
 * The election's acceptance criteria require cost rows filled from measurement with cited provenance
 * rather than estimates. A number produced by an ad-hoc shell pipeline satisfies the letter of that and
 * not the point: nobody can re-run it, so it becomes an assertion the moment the corpus moves. Every
 * figure this prints is reproducible by anyone with the repo, which is the only form in which a cost row
 * survives its author.
 *
 * ## The two axes
 *
 * **1. Plane-opener census.** A module counts as an opener when its *executable code* both resolves a
 * plane path and performs a filesystem operation on it. **Comments are stripped before matching**, via
 * acorn's `onComment` ranges — this is not a nicety: a naive line match counted doc-comment *mentions*
 * of plane paths as code paths and inflated the count by roughly 20% (61 → 52 at first measurement).
 *
 * The split that actually prices the branch is **host-side runners** (scripts, daemons, buildScripts —
 * invoked directly on the host) versus **in-server modules** (services and MCP servers, loaded inside a
 * server process). On macOS a named volume is VM-interior and host-invisible, so a host-side runner needs
 * a mount or an explicit contract while an in-server module rides the container's volume for free.
 *
 * Modules fitting neither description are reported as **unclassified** rather than silently assigned. The
 * election is decided on these counts, so an unstated classification is the defect this census replaces —
 * `ai/graph/storage/SQLite.mjs` genuinely runs on both sides and saying so is more useful than picking.
 *
 * **2. Symlink-escape audit.** For each entry in a seat's data dir, resolve it and ask whether it stays
 * **inside that seat's own plane root**. An entry resolving outside is not contained by a bind-mount of
 * that directory: inside a container it dangles unless the canonical root is also mounted at the identical
 * absolute host path. This is the measurement that turns the escape class from a residual risk into a
 * mount-time precondition.
 *
 * ## What this deliberately does NOT do
 *
 * It does not classify hydration state — that is `bootstrapWorktree --reconcile`'s job, and duplicating a
 * sibling's classifier would create two answers to one question. Run that tool for the per-seat
 * linked/divergent/residue rows and this one for the two axes above.
 *
 * It also does not decide anything. A census that editorialises is a census nobody can re-use under a
 * different framing.
 *
 * @example
 * // both axes, human-readable, current checkout as the only seat
 * node ai/scripts/diagnostics/planePlacementCensus.mjs
 *
 * // several seats, machine-readable
 * node ai/scripts/diagnostics/planePlacementCensus.mjs --json --seat /path/a --seat /path/b
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Directory name of the AI data plane inside a seat.
 * @type {String}
 */
export const PLANE_DIR_NAME = '.neo-ai-data';

/**
 * Trees searched for plane openers. Test trees are excluded: a spec that touches a plane path is a
 * test-isolation question, not a deployment cost.
 * @type {String[]}
 */
export const OPENER_SEARCH_TREES = ['ai', 'buildScripts', 'src', 'apps'];

/**
 * Matches an expression that resolves a plane path — either a config read or a literal plane reference.
 * @type {RegExp}
 */
export const PLANE_PATH_SOURCE = /storagePaths\.|\.neo-ai-data|NEO_AI_DATA|aiDataRoot/;

/**
 * Matches a filesystem operation. Deliberately broad: the axis is "does this module open the plane",
 * so a `stat` counts as much as a `write` — under a host-invisible volume both fail identically.
 * @type {RegExp}
 */
export const PLANE_FS_OPERATION = /\bfs(?:p|Extra|Sync)?\.(?:read|write|open|create|append|stat|lstat|exists|readdir|mkdir|copy|rm|unlink|watch)|createReadStream|createWriteStream|readFileSync|writeFileSync|existsSync|readdirSync|new Database\(/;

/**
 * Path prefixes whose modules run as their own host process (CLI scripts, daemons, build tooling).
 * @type {String[]}
 */
export const HOST_SIDE_PREFIXES = ['ai/scripts/', 'ai/daemons/', 'buildScripts/'];

/**
 * Path prefixes loaded INSIDE a server process, so a container's volume serves them for free.
 * @type {String[]}
 */
export const IN_SERVER_PREFIXES = ['ai/services/', 'ai/mcp/'];

/**
 * Blanks out comment ranges so a doc-comment mention of a plane path is not counted as a code path.
 *
 * Ranges are blanked rather than removed so line and column numbers survive for any caller that wants to
 * report positions. A file acorn cannot parse is returned unchanged — over-counting one unparseable file
 * is a better failure than silently dropping it from a census whose whole purpose is completeness.
 *
 * @param {String} source Module source text.
 * @returns {String} Source with comment ranges replaced by spaces.
 */
export function stripComments(source) {
    const comments = [];

    try {
        acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', onComment: (block, text, start, end) => {
            comments.push([start, end]);
        }});
    } catch {
        return source
    }

    let stripped = source;

    // Reverse order keeps earlier offsets valid as later ranges are replaced.
    for (const [start, end] of comments.reverse()) {
        stripped = stripped.slice(0, start) + ' '.repeat(end - start) + stripped.slice(end);
    }

    return stripped
}

/**
 * Lists git-tracked `.mjs` files under the census trees, excluding tests.
 *
 * Uses `git ls-files` rather than a directory walk so untracked scratch files and build output can never
 * enter a cost row.
 *
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT] Repo root.
 * @returns {String[]} Repo-relative paths.
 */
export function listCensusFiles({projectRoot = PROJECT_ROOT} = {}) {
    const output = execFileSync('git', ['ls-files', ...OPENER_SEARCH_TREES], {cwd: projectRoot, encoding: 'utf8'});

    return output.split('\n').filter(file =>
        file.endsWith('.mjs') && !file.includes('/test') && !file.endsWith('.spec.mjs')
    );
}

/**
 * Counts modules whose executable code both resolves a plane path and performs a filesystem operation.
 *
 * Three buckets, not two. Anything neither clearly host-invoked nor clearly server-loaded lands in
 * `unclassified` rather than being folded into whichever side makes the total tidy — a cost row is only as
 * trustworthy as its least-defensible classification, and quietly absorbing `ai/examples` into "rides the
 * container volume" would be the same unstated-definition problem this census exists to replace.
 *
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT] Repo root.
 * @returns {{total: Number, hostSide: String[], inServer: String[], unclassified: String[], byTree: Object}}
 */
export function censusPlaneOpeners({projectRoot = PROJECT_ROOT} = {}) {
    const hostSide     = [],
          inServer     = [],
          unclassified = [],
          byTree       = {};

    for (const file of listCensusFiles({projectRoot})) {
        let source;

        try {
            source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
        } catch {
            continue
        }

        const code = stripComments(source);

        if (!PLANE_PATH_SOURCE.test(code) || !PLANE_FS_OPERATION.test(code)) {
            continue
        }

        const tree = file.split('/').slice(0, 2).join('/');

        byTree[tree] = (byTree[tree] || 0) + 1;

        if (HOST_SIDE_PREFIXES.some(prefix => file.startsWith(prefix))) {
            hostSide.push(file);
        } else if (IN_SERVER_PREFIXES.some(prefix => file.startsWith(prefix))) {
            inServer.push(file);
        } else {
            unclassified.push(file);
        }
    }

    return {total: hostSide.length + inServer.length + unclassified.length, hostSide, inServer, unclassified, byTree}
}

/**
 * Audits whether a seat's plane entries are containable by a bind-mount of that seat's plane root.
 *
 * `escapes` is the load-bearing number: an entry resolving outside its own plane root is not contained by
 * a bind-mount of that root, so inside a container it dangles unless the canonical root is also mounted at
 * the identical absolute host path. `dangling` is reported separately because an entry can escape and still
 * resolve perfectly **on the host** — which is exactly why the class stays invisible until containerisation.
 *
 * @param {Object} options
 * @param {String} options.seat Absolute path to a checkout.
 * @returns {{seat: String, present: Boolean, leaves: Number, symlinks: Number, escapes: Number, dangling: Number, escaped: Array<{name: String, target: String}>}}
 */
export function auditSeatContainment({seat}) {
    const planeRoot = path.join(seat, PLANE_DIR_NAME),
          result    = {seat, present: false, leaves: 0, symlinks: 0, escapes: 0, dangling: 0, escaped: []};

    if (!fs.existsSync(planeRoot) || !fs.statSync(planeRoot).isDirectory()) {
        return result
    }

    const realRoot = fs.realpathSync(planeRoot) + path.sep;

    result.present = true;

    for (const name of fs.readdirSync(planeRoot).sort()) {
        const entry = path.join(planeRoot, name);

        result.leaves++;

        if (!fs.lstatSync(entry).isSymbolicLink()) {
            continue
        }

        result.symlinks++;

        if (!fs.existsSync(entry)) {
            result.dangling++;
        }

        let target;

        try {
            target = fs.realpathSync(entry);
        } catch {
            continue
        }

        if (!(target + path.sep).startsWith(realRoot)) {
            result.escapes++;
            result.escaped.push({name, target});
        }
    }

    return result
}

/**
 * Runs both axes and returns the census report.
 *
 * @param {Object} [options]
 * @param {String[]} [options.seats] Seats to audit; defaults to the current checkout.
 * @param {String} [options.projectRoot=PROJECT_ROOT] Repo root.
 * @returns {{projectRoot: String, openers: Object, seats: Object[]}}
 */
export function runPlanePlacementCensus({seats, projectRoot = PROJECT_ROOT} = {}) {
    const targets = seats?.length ? seats : [projectRoot];

    return {
        projectRoot,
        openers: censusPlaneOpeners({projectRoot}),
        seats  : targets.map(seat => auditSeatContainment({seat}))
    };
}

/**
 * Renders the report as text.
 *
 * @param {Object} report Result of {@link runPlanePlacementCensus}.
 * @returns {String}
 */
export function formatCensus(report) {
    const {openers} = report,
          lines     = [`Repo: ${report.projectRoot}`, '', 'PLANE OPENERS (executable code only; comments stripped)'];

    lines.push(`  total                                     ${openers.total}`);
    lines.push(`  host-side runners (need a mount/contract) ${openers.hostSide.length}`);
    lines.push(`  in-server modules (ride the volume)       ${openers.inServer.length}`);
    lines.push(`  UNCLASSIFIED (needs a judgement call)     ${openers.unclassified.length}`);

    for (const file of openers.unclassified) {
        lines.push(`      ${file}`);
    }

    lines.push('', '  by tree:');

    for (const [tree, count] of Object.entries(openers.byTree).sort((a, b) => b[1] - a[1])) {
        lines.push(`    ${String(count).padStart(3)}  ${tree}`);
    }

    lines.push('', 'SEAT CONTAINMENT (can a bind-mount of the seat plane contain its own leaves?)');
    lines.push(`  ${'seat'.padEnd(52)} ${'leaves'.padStart(6)} ${'symlink'.padStart(7)} ${'escapes'.padStart(7)} ${'dangling'.padStart(8)}`);

    for (const seat of report.seats) {
        if (!seat.present) {
            lines.push(`  ${seat.seat.padEnd(52)} ${'(no plane dir)'.padStart(6)}`);
            continue
        }
        lines.push(`  ${seat.seat.padEnd(52)} ${String(seat.leaves).padStart(6)} ${String(seat.symlinks).padStart(7)} ${String(seat.escapes).padStart(7)} ${String(seat.dangling).padStart(8)}`);
    }

    const escaping = report.seats.filter(seat => seat.escapes > 0);

    if (escaping.length) {
        lines.push('', '  escaping entries (NOT contained by a bind-mount of the seat plane):');
        for (const seat of escaping) {
            lines.push(`    ${seat.seat}`);
            for (const {name, target} of seat.escaped) {
                lines.push(`      ${name.padEnd(22)} -> ${target}`);
            }
        }
    }

    return lines.join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const argv    = process.argv.slice(2),
          jsonOut = argv.includes('--json'),
          seats   = argv.reduce((acc, arg, index) => argv[index - 1] === '--seat' ? [...acc, path.resolve(arg)] : acc, []);

    const report = runPlanePlacementCensus({seats});

    console.log(jsonOut ? JSON.stringify(report, null, 4) : formatCensus(report));
}
