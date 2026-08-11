/**
 * @plane host
 */
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import readline        from 'node:readline';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import * as acorn      from 'acorn';

/**
 * @module ai/scripts/diagnostics/planePlacementCensus
 * @summary Read-only census of the three cost axes the data-plane placement election is decided on:
 * **who opens the plane from the host**, **whether a seat's plane leaves are containable by a
 * bind-mount of that seat**, and **which seat actually wrote the shared WAL volume**.
 *
 * ## Why this is a committed script rather than a one-off measurement
 *
 * The election's acceptance criteria require cost rows filled from measurement with cited provenance
 * rather than estimates. A number produced by an ad-hoc shell pipeline satisfies the letter of that and
 * not the point: nobody can re-run it, so it becomes an assertion the moment the corpus moves. Every
 * figure this prints is reproducible by anyone with the repo, which is the only form in which a cost row
 * survives its author.
 *
 * ## The three axes
 *
 * **1. Plane-opener census.** A module counts as an opener when its *executable code* both resolves a
 * plane path and performs a filesystem operation on it. **Comments are stripped before matching**, via
 * acorn's `onComment` ranges — this is not a nicety: a naive line match counted doc-comment *mentions*
 * of plane paths as code paths and inflated the count by roughly 20% (61 → 52 at first measurement).
 *
 * "Resolves a plane path" is defined by the **config contract**, not by this file: the member set is read
 * from the declaring configs' `PLANE_MEMBER_PATHS` (`readDeclaredPlaneMembers`). The census holds no
 * opinion about what a plane member *is* — only about which modules reference one. Its predecessor did
 * hold one, a `*Path`/`*Dir` name shape, and it was wrong in both directions at once.
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
 * **3. Per-seat WAL attribution.** The `memory-wal` leaf is absent from the hydration blocklist, so every
 * hydrated seat's WAL directory resolves to the SAME canonical directory — deliberately, for cross-clone
 * sole-drainer enforcement — and segments are keyed by day, so all seats append to one file. Directory
 * size therefore answers *"what did the plane write"* and **cannot be disaggregated into seats at all**;
 * per-seat volume must come from the records.
 *
 * It is read from `metadata.agentIdentity`, which the memory service stamps from the **server-resolved
 * bound identity**, never from `metadata.agent`, which is **caller-supplied and optional**. That
 * distinction is not stylistic: measured on a live day-segment, `agent` was absent on 144 of 362 records
 * (29.8% of bytes) while `agentIdentity` was absent on **zero** — and the loss was not uniform, erasing
 * two seats outright and halving a third. A cost row built on the optional field would have priced the
 * plane as though two agents never wrote to it.
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
 * The config modules that DECLARE plane membership, each exporting a frozen `PLANE_MEMBER_PATHS`.
 *
 * All four, not just Tier 1: the three MCP server configs declare their own members (`memoryWal.*`,
 * `remRunStateDir`, `hookProjectionRoot`, …) and a census reading only the Tier-1 list is blind to every
 * module that reaches the plane through a server config — which is what left both WAL daemons uncounted.
 * @type {String[]}
 */
export const PLANE_MEMBER_CONFIGS = [
    'ai/configBase.mjs',
    'ai/mcp/server/memory-core/configBase.mjs',
    'ai/mcp/server/knowledge-base/configBase.mjs',
    'ai/mcp/server/neural-link/configBase.mjs'
];

/**
 * Reads the declared plane-member paths out of the config modules, by STATIC PARSE — never by import.
 *
 * The import is not merely heavy, it does not work: every config module ends in `Neo.setupClass(...)`, so
 * `import('ai/configBase.mjs')` outside a Neo entrypoint throws `Neo is not defined`. A named import does
 * not help — the module body still evaluates. `derivePlaneMemberPaths` (`ai/planeConfig.mjs`) is pure and
 * Neo-free, but its INPUT is `ConfigBase.config.data`, which only exists after that boot; a pure function
 * whose argument is unobtainable here is a covering clause, not a usable one.
 *
 * So this reads the declared list instead of re-deriving it, and the list is not trusted on faith:
 * `planeConfig.spec.mjs` asserts `derivePlaneMemberPaths(...)` EQUALS `PLANE_MEMBER_PATHS` for all four
 * configs, and `derivePlaneMemberPaths` itself throws on a plane-anchored leaf with no membership
 * decision. Declared, derived, and anchored therefore cannot drift apart without a red spec — which is
 * what lets a diagnostic that stays node-builtins + acorn still read the real contract.
 *
 * FAILS LOUD by design. A missing export or a non-literal array yields no members, and a census whose
 * member set silently empties would report a plausible, much smaller total — the failure mode a
 * measurement instrument must never have.
 *
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT] Repo root.
 * @param {String[]} [options.configs=PLANE_MEMBER_CONFIGS] Declaring config modules, repo-relative.
 * @returns {String[]} Sorted union of every declared member path (dotted, relative to each config's data).
 */
export function readDeclaredPlaneMembers({projectRoot = PROJECT_ROOT, configs = PLANE_MEMBER_CONFIGS} = {}) {
    const members = new Set();

    for (const file of configs) {
        const source = fs.readFileSync(path.join(projectRoot, file), 'utf8'),
              ast    = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});

        let found = false;

        for (const node of ast.body) {
            if (node.type !== 'ExportNamedDeclaration' || node.declaration?.type !== 'VariableDeclaration') {
                continue
            }

            for (const declarator of node.declaration.declarations) {
                if (declarator.id.name !== 'PLANE_MEMBER_PATHS') {
                    continue
                }

                // `Object.freeze([...])` — unwrap to the array literal it froze.
                const init = declarator.init?.type === 'CallExpression' ? declarator.init.arguments[0] : declarator.init;

                if (init?.type !== 'ArrayExpression') {
                    throw new Error(`planePlacementCensus: ${file} exports PLANE_MEMBER_PATHS as a non-literal — the census reads it statically and cannot evaluate it.`);
                }

                for (const element of init.elements) {
                    if (element?.type !== 'Literal' || typeof element.value !== 'string') {
                        throw new Error(`planePlacementCensus: ${file} has a non-string-literal PLANE_MEMBER_PATHS entry — a member the census cannot read is a member it would silently drop.`);
                    }

                    members.add(element.value);
                }

                found = true;
            }
        }

        if (!found) {
            throw new Error(`planePlacementCensus: ${file} exports no PLANE_MEMBER_PATHS — the census reconciles against the declared contract and must not fall back to guessing.`);
        }
    }

    return [...members].sort()
}

/**
 * Builds the plane-path matcher from a declared member set.
 *
 * Three shapes, because the plane is reached three ways:
 *   1. `storagePaths.<leaf>` — the memory-core DB-path subtree. Kept as a literal branch on purpose: its
 *      `graphProd` leaf declares `planeMember: false` whose own reason states the decision is OPEN rather
 *      than settled, so it is absent from the derived set while the graph SQLite is still, factually, the
 *      plane's core artifact under the plane root. Dropping it would un-count ~10 graph consumers on the
 *      strength of a placeholder. Retirement trigger: when that membership is decided, this branch either
 *      becomes redundant (member) or is deleted with the leaf (non-member) — read the leaf's
 *      `planeMemberReason` for the ticket that owns it.
 *      ticket-ref-ok: none cited — the reason string on the leaf is the live pointer, so this branch's
 *      sunset condition cannot rot when that ticket closes or is renamed.
 *   2. A DECLARED member path read through a config object — `AiConfig.fleet.instanceRoot`,
 *      `memoryCoreConfig.memoryWal.daemonDataDir`, `loggerConfig.logPath`. The leaf set comes from the
 *      contract; only the *carrier* is matched by shape, and it is any identifier ending `Config`/`config`
 *      rather than `AiConfig` alone — the WAL daemons and the shared logger read theirs under other names.
 *   3. A literal `.neo-ai-data` / `NEO_AI_DATA` / `aiDataRoot` reference — a module resolving the plane
 *      ROOT directly rather than through a leaf, which is a different signal and stays.
 *
 * **What replaced what, and why it moved the numbers in BOTH directions.** The previous branch 2 was
 * `\b[Aa]iConfig\.[A-Za-z]*(?:Path|Dir)\b` — a name-shape proxy. It was wrong twice over, and only the
 * first was anticipated:
 * - **False negatives.** `[A-Za-z]*` cannot cross a dot and the name had to end `Path`/`Dir`, so declared
 *   members like `fleet.instanceRoot`, `memoryWal.daemonDataDir`, `orchestrator.dataDir` and
 *   `hookProjectionRoot` were invisible. Six modules opened the plane uncounted — four of them daemons,
 *   including BOTH WAL daemons, in the host-side bucket the election is priced on.
 * - **False positives, the larger error.** The shape also matched leaves that merely END in `Path`/`Dir`
 *   and resolve into the REPO, not the plane: `neoRootDir` (the repo root), `hierarchyPath`
 *   (`docs/output/class-hierarchy.json`), `handoffFilePath` (`resources/content/…`). Fourteen modules —
 *   eleven of them knowledge-base sources reading `aiConfig.neoRootDir` — were counted as plane openers
 *   while touching nothing a volume decision affects.
 *
 * The over-count direction the module documents elsewhere (co-occurrence, not data flow) is unchanged and
 * still deliberate; this removes a class of match that was not over-counting but simply measuring the
 * wrong tree.
 *
 * @param {String[]} memberPaths Declared member paths, dotted.
 * @returns {RegExp}
 */
export function buildPlanePathSource(memberPaths) {
    if (!Array.isArray(memberPaths) || memberPaths.length === 0) {
        throw new Error('planePlacementCensus.buildPlanePathSource: refusing to build a matcher from an empty member set — it would silently report a plausible, much smaller census.');
    }

    // Escape EVERY regex metacharacter, not just the dot separator. `$` is legal in a JS identifier, so a
    // leaf named `$foo` is a real declaration — and left unescaped it becomes an end-anchor, producing a
    // matcher that silently stops matching the very member it was built from. A silent false negative is
    // precisely the class this census exists to remove, so it must not be reintroduced by its own builder.
    // A metacharacter that instead makes the pattern invalid throws in the RegExp constructor, which is the
    // acceptable half of this failure; the silent half is not.
    const declared = memberPaths.map(member => member.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

    return new RegExp(`storagePaths\\.|\\b[A-Za-z0-9_$]*[Cc]onfig\\.(?:${declared})\\b|\\.neo-ai-data|NEO_AI_DATA|aiDataRoot`)
}

/**
 * Matches an expression that resolves a plane path, reconciled against the declared config contract.
 *
 * Built at module scope so the census reads the contract as it stands in the checkout being measured: add a
 * plane member to any of the three configs and it is counted with no census edit, remove one and it stops
 * being counted. See `buildPlanePathSource` for the three branches and what the name-shape proxy got wrong.
 * @type {RegExp}
 */
export const PLANE_PATH_SOURCE = buildPlanePathSource(readDeclaredPlaneMembers());

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
 * This diagnostic's own repo-relative path, so the census can exclude itself from its own domain.
 *
 * A committed measurement instrument that counts itself changes the baseline it exists to reproduce: this
 * file matches its own opener rule (it reads `.neo-ai-data` paths and calls `fs`), so before this exclusion
 * the totals shifted by one the moment the script was committed. The observation domain has to be explicit,
 * not silently one-off.
 * @type {String}
 */
export const CENSUS_SELF_PATH = 'ai/scripts/diagnostics/planePlacementCensus.mjs';

/**
 * Lists git-tracked `.mjs` files under the census trees, excluding tests AND the census itself.
 *
 * Uses `git ls-files` rather than a directory walk so untracked scratch files and build output can never
 * enter a cost row. The census excludes itself by construction — the instrument is not part of the
 * deployment surface it measures, and counting it made the total move on commit.
 *
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT] Repo root.
 * @returns {String[]} Repo-relative paths.
 */
export function listCensusFiles({projectRoot = PROJECT_ROOT} = {}) {
    const output = execFileSync('git', ['ls-files', ...OPENER_SEARCH_TREES], {cwd: projectRoot, encoding: 'utf8'});

    return output.split('\n').filter(file =>
        file.endsWith('.mjs') && !file.includes('/test') && !file.endsWith('.spec.mjs') && file !== CENSUS_SELF_PATH
    );
}

/**
 * Counts modules whose executable code CO-OCCURS a plane-path expression with a filesystem operation.
 *
 * **Co-occurrence, not data flow — and the distinction is deliberate.** This proves "this module names a
 * plane path AND calls `fs` somewhere", not "this module calls `fs` ON that plane path". A line-regex
 * cannot establish the latter (it would need to trace the path value to the `fs` call), so the claim is
 * kept to what the evidence supports. The consequence is a small over-count — a module that reads an
 * unrelated file and separately mentions a plane path in dead-ish code counts — which is the honest
 * failure direction for a cost CEILING: it never under-reports the openers a branch must pay for.
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
 * `escapes` and `dangling` are INDEPENDENT flags, not a fallthrough. An entry resolving outside its own
 * plane root is not contained by a bind-mount of that root; an entry whose target does not exist is
 * dangling. A single symlink can be BOTH.
 *
 * Escape resolution is chosen PER CONDITION, because lexical and canonical target identity answer
 * different questions and neither substitutes for the other:
 * - a **resolvable** target uses CANONICAL resolution (`realpathSync`) — a link whose text reads inside
 *   the plane still escapes when an intermediate component is itself a symlink pointing out, and only
 *   canonical resolution follows that chain.
 * - a **dangling** target has no canonical form (`realpathSync` throws), so it falls back to LEXICAL
 *   resolution of the link text — which still answers whether the text points outside the root.
 *
 * An earlier repair used lexical resolution for both and therefore missed chained escapes on existing
 * links; the one before that used canonical for both and missed dangling escapes entirely.
 *
 * That escapes is the load-bearing number for containerisation is unchanged: a link resolving perfectly on
 * the host still escapes a bind-mount, which is why the class stays invisible until a container.
 *
 * @param {Object} options
 * @param {String} options.seat Absolute path to a checkout.
 * @returns {{seat: String, present: Boolean, leaves: Number, symlinks: Number, escapes: Number, dangling: Number, escaped: Array<{name: String, target: String, dangling: Boolean}>}}
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

        const isDangling = !fs.existsSync(entry);

        if (isDangling) {
            result.dangling++;
        }

        // Escape needs BOTH resolutions, chosen per condition — @neo-gpt-emmy's chained-escape falsifier.
        // A resolvable target must use CANONICAL resolution (`realpathSync`), because a link whose text
        // reads inside the plane (`sub/x`) escapes anyway when an intermediate component (`sub`) is itself
        // a symlink pointing out — a purely lexical `path.resolve` cannot see that and would call it
        // contained. A dangling target has no canonical form (`realpathSync` throws), so it falls back to
        // LEXICAL resolution of the link text, which still answers "does the text point outside".
        let resolvedTarget;

        if (isDangling) {
            resolvedTarget = path.resolve(planeRoot, fs.readlinkSync(entry));
        } else {
            resolvedTarget = fs.realpathSync(entry);
        }

        if (!(resolvedTarget + path.sep).startsWith(realRoot)) {
            result.escapes++;
            result.escaped.push({name, target: resolvedTarget, dangling: isDangling});
        }
    }

    return result
}

/**
 * Directory name of the shared memory WAL inside the plane.
 * @type {String}
 */
export const WAL_DIR_NAME = 'memory-wal';

/**
 * Metadata field carrying authoritative write attribution.
 *
 * The service stamps this from the server-resolved bound identity. Its sibling `metadata.agent` is
 * caller-supplied and optional, so a seat whose writes omitted it disappears from the table entirely
 * rather than merely losing precision.
 * @type {String}
 */
export const WAL_IDENTITY_FIELD = 'agentIdentity';

/**
 * Normalises a seat identity so one seat cannot split into two rows.
 *
 * Both `@neo-x` and `neo-x` occur in the wild; a table that treats them as distinct makes one seat look
 * small twice instead of correct once.
 * @param {String} identity Raw identity string.
 * @returns {String} Identity with a single leading `@`.
 */
export function normalizeSeatIdentity(identity) {
    return `@${String(identity).replace(/^@+/, '')}`
}

/**
 * Attributes WAL bytes to seats by streaming a day-segment and reading the authoritative identity field.
 *
 * Streams rather than reading the file whole: a day segment is already megabytes and grows, and a
 * whole-file read is the failure mode that only appears once the corpus is large enough to matter.
 *
 * `unattributed` is always reported as its own row, even at zero. Attributing those bytes to nobody
 * understates every seat and spreading them evenly fabricates a distribution — and a table that silently
 * omits the bucket is quoting shares of a total it did not measure.
 * @param {Object} options
 * @param {String} options.walPath Absolute path to a `.jsonl` day segment.
 * @returns {Promise<{records: Number, bytes: Number, unattributed: {records: Number, bytes: Number}, seats: Array<{seat: String, records: Number, bytes: Number, share: Number}>}>}
 */
export async function attributeWalSegment({walPath}) {
    const seats  = new Map(),
          reader = readline.createInterface({input: fs.createReadStream(walPath), crlfDelay: Infinity}),
          absent = {records: 0, bytes: 0};

    let records = 0,
        bytes   = 0;

    for await (const line of reader) {
        if (!line.trim()) {
            continue
        }

        let record;

        try {
            record = JSON.parse(line);
        } catch {
            continue
        }

        const size = Buffer.byteLength(line) + 1;

        records++;
        bytes += size;

        const identity = record?.metadata?.[WAL_IDENTITY_FIELD];

        if (!identity) {
            absent.records++;
            absent.bytes += size;
            continue
        }

        const seat    = normalizeSeatIdentity(identity),
              current = seats.get(seat) || {records: 0, bytes: 0};

        current.records++;
        current.bytes += size;
        seats.set(seat, current);
    }

    return {
        records,
        bytes,
        unattributed: absent,
        seats       : [...seats.entries()]
            .map(([seat, value]) => ({seat, ...value, share: bytes ? value.bytes / bytes : 0}))
            .sort((a, b) => b.bytes - a.bytes)
    }
}

/**
 * Resolves the newest `.jsonl` day segment in a plane's WAL directory.
 *
 * Sibling `*.graph.jsonl` / `*.embedded.jsonl` projections are excluded — they are derived streams, and
 * counting them would double-count the same write under a different shape.
 * @param {Object} options
 * @param {String} options.planeRoot Absolute path to a `.neo-ai-data` directory.
 * @returns {String|null} Absolute path, or null when no segment exists.
 */
export function resolveLatestWalSegment({planeRoot}) {
    const walDir = path.join(planeRoot, WAL_DIR_NAME);

    if (!fs.existsSync(walDir)) {
        return null
    }

    const segments = fs.readdirSync(walDir)
        .filter(name => name.endsWith('.jsonl') && !name.includes('.graph.') && !name.includes('.embedded.'))
        .sort();

    return segments.length ? path.join(walDir, segments.at(-1)) : null
}

/**
 * Runs all three axes and returns the census report.
 *
 * WAL attribution is optional because it reads host state that may not exist (a fresh checkout has no
 * segments); its absence is reported rather than thrown, so the two repo-derived axes still produce rows.
 * @param {Object} [options]
 * @param {String[]} [options.seats] Seats to audit; defaults to the current checkout.
 * @param {String} [options.projectRoot=PROJECT_ROOT] Repo root.
 * @param {String} [options.walPath] Explicit WAL segment; defaults to the newest in the canonical plane.
 * @returns {Promise<{projectRoot: String, openers: Object, seats: Object[], wal: Object|null}>}
 */
export async function runPlanePlacementCensus({seats, projectRoot = PROJECT_ROOT, walPath} = {}) {
    const targets  = seats?.length ? seats : [projectRoot],
          audits   = targets.map(seat => auditSeatContainment({seat})),
          resolved = walPath ?? resolveLatestWalSegment({planeRoot: path.join(targets[0], PLANE_DIR_NAME)});

    return {
        projectRoot,
        openers: censusPlaneOpeners({projectRoot}),
        seats  : audits,
        wal    : resolved ? {segment: resolved, ...await attributeWalSegment({walPath: resolved})} : null
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

    if (report.wal) {
        const {records, bytes, unattributed, seats, segment} = report.wal,
              kib                                            = value => (value / 1024).toFixed(1);

        lines.push('', `PER-SEAT WAL ATTRIBUTION (${path.basename(segment)} — from metadata.agentIdentity)`);
        lines.push(`  ${records} records, ${kib(bytes)} KiB`);

        for (const seat of seats) {
            lines.push(`  ${seat.seat.padEnd(24)} ${String(seat.records).padStart(4)} rec  ${kib(seat.bytes).padStart(9)} KiB  ${(100 * seat.share).toFixed(1)}%`);
        }

        // Always shown, even at zero — omitting it quotes shares of an unmeasured total.
        lines.push(`  ${'(unattributed)'.padEnd(24)} ${String(unattributed.records).padStart(4)} rec  ${kib(unattributed.bytes).padStart(9)} KiB  ${(100 * (bytes ? unattributed.bytes / bytes : 0)).toFixed(1)}%`);
    }

    return lines.join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const argv    = process.argv.slice(2),
          jsonOut = argv.includes('--json'),
          seats   = argv.reduce((acc, arg, index) => argv[index - 1] === '--seat' ? [...acc, path.resolve(arg)] : acc, []);

    runPlanePlacementCensus({seats}).then(report => {
        console.log(jsonOut ? JSON.stringify(report, null, 4) : formatCensus(report));
    });
}
