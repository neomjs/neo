/**
 * @summary Read-only probe: which TCP listeners this host is running, and which directory each RESOLVES PATHS AGAINST.
 *
 * The fourth axis of a per-seat data-root reconcile. The other three (leaves, symlink targets,
 * resolved roots) are derived from the hydration contract by `symlinkDataDir({dryRun: true})`;
 * host port claims have no declaration to derive from, so they must be observed.
 *
 * **Why serving directory rather than occupancy.** "Port 8080 is busy" is not the useful fact.
 * A test runner that trusted *any* listener on a port once executed a different checkout's tree
 * and produced false greens as well as false reds — two victims in one day. The question a
 * multi-seat host has to answer is *whose* process is on the port, and the honest answer this
 * probe can actually evidence is the serving process's working directory.
 *
 * That is deliberately a weaker claim than "which checkout". The probe never validates a cwd as a
 * repository root, so it reports cwds and says so; asserting checkout identity would put a claim
 * on the output that nothing in the measurement supports.
 *
 * That also makes this probe a direct read of the same property the data-root election turns on.
 * Path leaves resolve relative to the invoking process's cwd, so a listener's cwd is the plane
 * it writes to. Two seats claiming adjacent ports from different checkouts is not a port conflict;
 * it is two planes wearing one host's port namespace.
 *
 * **Read-only by construction.** `lsof` only; the script never connects to a port, never sends a
 * request, never signals a process. A fingerprint that required an HTTP round-trip would make the
 * diagnostic itself a client of the thing it is diagnosing.
 *
 * Platforms: macOS + Linux. `lsof -F` is chosen over `netstat`/`ss` for the same reason the
 * sibling MCP-concurrency probe chose it — it ships by default on both targets and emits a
 * deterministic machine-parseable format.
 *
 * Usage:
 *   node ai/scripts/diagnostics/probePortClaims.mjs           # human-readable table
 *   node ai/scripts/diagnostics/probePortClaims.mjs --json    # machine-readable
 *
 * @see ai/scripts/diagnostics/diagnoseMcpConcurrency.mjs  sibling probe; `lsof -F` idiom
 * @see ai/scripts/migrations/bootstrapWorktree.mjs        symlinkDataDir dryRun — axes 1-3
 * @plane host
 */

import {execFileSync} from 'child_process';

const UNKNOWN = 'unknown';

/**
 * @summary Runs lsof, separating "looked and saw nothing" from "could not look".
 *
 * lsof exits non-zero on "no matching processes", which is a legitimate empty result rather than
 * a failure — a host with no listeners is a valid observation, not an error.
 *
 * **"Could not observe" is never reported as "observed nothing."** `lsof` absent, a permission
 * refusal and a genuinely quiet host are three different facts; collapsing them into `[]` would
 * make the probe unable to fail, and an instrument that cannot fail cannot be evidence.
 *
 * @param {String[]} args
 * @returns {{ok: Boolean, stdout: String, reason: String|null}} `ok:false` carries why.
 */
function lsof(args) {
    try {
        return {ok: true, stdout: execFileSync('lsof', args, {encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore']}), reason: null};
    } catch (e) {
        // lsof exits non-zero on "no matching processes" while still emitting the matches it found,
        // so stdout presence — not exit code — is what distinguishes a real result from a failure.
        if (e?.stdout) return {ok: true, stdout: e.stdout, reason: null};

        if (e?.code === 'ENOENT') return {ok: false, stdout: '', reason: 'lsof-unavailable'};
        if (e?.status === 1)      return {ok: true,  stdout: '', reason: null};

        return {ok: false, stdout: '', reason: `lsof-failed: ${e?.code ?? e?.status ?? 'unknown'}`};
    }
}

/**
 * @summary Resolves a pid's current working directory — the checkout it would resolve paths against.
 * @param {String} pid
 * @returns {String} Absolute cwd, or `'unknown'` when the process is not inspectable (foreign uid).
 */
export function resolveProcessCwd(pid) {
    const {ok, stdout} = lsof(['-a', '-p', pid, '-d', 'cwd', '-F', 'n']);

    if (!ok) return UNKNOWN;

    for (const line of stdout.split('\n')) {
        if (line.startsWith('n')) return line.slice(1);
    }

    return UNKNOWN;
}

/**
 * @summary Enumerates TCP listeners with the working directory each one serves from.
 *
 * Parses `lsof -F pcn`, whose records are line-oriented: `p<pid>` opens a process block, `c<cmd>`
 * names it, and each following `n<name>` is one of that process's sockets. State is carried across
 * lines by design of the format, which is why this is a fold rather than a per-line map.
 *
 * @returns {{observed: Boolean, reason: String|null, rows: Array<{port: Number, pid: String, command: String, cwd: String}>}}
 *          `observed:false` means the probe could not look — never that it looked and found nothing.
 *          `rows` is sorted by port; `cwd` is `'unknown'` when the owning process is not inspectable.
 */
export function probePortClaims() {
    const {ok, stdout, reason} = lsof(['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn']);

    if (!ok) return {observed: false, reason, rows: []};

    return {observed: true, reason: null, rows: parseListenerRecords(stdout, resolveProcessCwd)};
}

/**
 * @summary Pure parser for `lsof -F pcn` output — the decision core, with the shell seam injected.
 *
 * Split out from {@link probePortClaims} so the parsing contract is testable without a host that
 * happens to have the right listeners running. The probe is only useful if its record-folding is
 * right, and a test that needs real sockets to prove that would be untestable in CI by construction.
 *
 * @param {String}   raw         Raw `lsof -F pcn` stdout.
 * @param {Function} cwdResolver `pid => cwd`, called at most once per pid.
 * @returns {Array<{port: Number, pid: String, command: String, cwd: String}>} Sorted by port.
 */
export function parseListenerRecords(raw, cwdResolver) {
    const
        rows = [],
        cwds = new Map();

    let pid = null, command = null;

    for (const line of raw.split('\n')) {
        if (line.startsWith('p')) {
            pid     = line.slice(1);
            command = null;
            continue;
        }

        if (line.startsWith('c')) {
            command = line.slice(1);
            continue;
        }

        if (!line.startsWith('n') || !pid) continue;

        const match = line.slice(1).match(/:(\d+)$/);
        if (!match) continue;

        if (!cwds.has(pid)) cwds.set(pid, cwdResolver(pid));

        rows.push({port: Number(match[1]), pid, command: command || UNKNOWN, cwd: cwds.get(pid)});
    }

    return rows.sort((a, b) => a.port - b.port);
}

/**
 * @summary Groups listeners by the cwd they serve from, so one host's plane split is readable.
 *
 * **These keys are working directories, not verified checkouts.** The probe never confirms that a
 * cwd is a repository root — it reports what `lsof` says the process resolves paths against, which
 * is the property the data-plane election actually turns on. Naming the key `cwd` keeps the claim
 * the size of the evidence; calling it a checkout would assert an identity nothing here checked.
 *
 * `/` and `unknown` group like any other key but are never *serving* cwds — a daemon rooted at `/`
 * says nothing about a plane. Callers counting distinct planes must use {@link servedCwds}, which
 * excludes them; counting raw keys over-reports, since a stock macOS host always carries `/`.
 *
 * @param {Array<Object>} rows Listener rows from {@link probePortClaims}`.rows`.
 * @returns {Object<String, Number[]>} cwd → ascending ports served from it.
 */
export function groupByCwd(rows) {
    const grouped = {};

    for (const {cwd, port} of rows) {
        (grouped[cwd] ||= []).push(port);
    }

    for (const ports of Object.values(grouped)) ports.sort((a, b) => a - b);

    return grouped;
}

/**
 * @summary The keys of {@link groupByCwd} that denote a real serving directory.
 * @param {Object<String, Number[]>} grouped
 * @returns {String[]} Paths excluding `/` and `unknown` — still cwds, still unvalidated as roots.
 */
export function servedCwds(grouped) {
    return Object.keys(grouped).filter(key => key !== UNKNOWN && key !== '/');
}

function main() {
    const {observed, reason, rows} = probePortClaims();

    if (process.argv.includes('--json')) {
        console.log(JSON.stringify({observed, reason, rows, byCwd: groupByCwd(rows)}, null, 4));
        return;
    }

    if (!observed) {
        console.log(`Could not observe port claims (${reason}). This is NOT "no listeners".`);
        return;
    }

    if (!rows.length) {
        console.log('Observed successfully: this host has no TCP listeners.');
        return;
    }

    console.log(`${rows.length} listening socket(s):\n`);
    for (const {port, pid, command, cwd} of rows) {
        console.log(`  ${String(port).padStart(5)}  ${command.padEnd(16)} pid ${pid.padEnd(8)} ${cwd}`);
    }

    const byCwd = groupByCwd(rows),
          cwds  = servedCwds(byCwd);

    if (cwds.length > 1) {
        console.log(`\n${cwds.length} distinct working directories are serving ports on this host:`);
        for (const cwd of cwds) console.log(`  ${cwd} → ${byCwd[cwd].join(', ')}`);
        console.log('\nPorts alone do not identify a seat here — the same port number resolves paths against a different directory per listener.');
    }
}

if (process.argv[1]?.endsWith('probePortClaims.mjs')) main();
