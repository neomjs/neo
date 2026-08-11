/**
 * @plane host
 */
import fs                                     from 'node:fs/promises';
import path                                   from 'node:path';
import process                                from 'node:process';
import {execFile}                             from 'node:child_process';
import {promisify}                            from 'node:util';
import {fileURLToPath}                        from 'node:url';
import {Command, InvalidArgumentError}        from 'commander';
import {classifyDiscussionRoutingDisposition} from '../../services/github-workflow/shared/discussionRoutingDisposition.mjs';

const execFileAsync = promisify(execFile);

/**
 * Pre-Flight (structural fast-path): `ai/scripts/diagnostics/audit-discussion-lifecycle.mjs`
 * matches sibling diagnostics guards such as `check-retired-primitives.mjs` and
 * `check-substrate-size.mjs`: a read-only CI/maintenance script enforcing agent-substrate
 * lifecycle invariants without introducing a new daemon or MCP surface.
 *
 * @summary Audits synced Ideation Sandbox Discussions for lifecycle-close compliance.
 *
 * @see .agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md §6.7
 * @see https://github.com/neomjs/neo/issues/11236
 */

const DEFAULT_DISCUSSIONS_DIR = path.resolve(process.cwd(), 'resources/content/discussions');
const DEFAULT_STALE_DAYS      = 90;

/**
 * How old the synced snapshot may be before its verdicts are labelled stale.
 *
 * The data-sync pipeline runs hourly, so six hours is roughly six consecutive missed runs — past
 * the noise of one transient failure and comfortably short of the multi-day outages that make this
 * guard actively misleading. It is a reporting threshold, never a refusal: the findings are still
 * printed, they are just no longer presented as current.
 * @type {Number}
 */
const DEFAULT_MAX_SNAPSHOT_AGE_HOURS = 6;

const CANDIDATE_ORDER = {
    'graduated-open'      : 0,
    'resolved-only-review': 1,
    'stale-open'          : 2
};

const FAIL_ON_CHOICES = ['none', 'all', 'graduated-open', 'resolved-only-review', 'stale-open'];

/**
 * @param {String} value
 * @returns {String}
 */
function stripYamlScalar(value) {
    const trimmed = String(value || '').trim();

    if (
        (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
        return trimmed.slice(1, -1)
    }

    return trimmed
}

/**
 * Parses the small frontmatter subset the synced Discussion corpus needs for lifecycle audits. The
 * CLI uses the shared commander dependency, but this keeps markdown parsing independent of a YAML
 * package.
 *
 * @param {String} raw Markdown file contents.
 * @returns {{data: Object, body: String}}
 */
function parseFrontmatter(raw) {
    if (!raw.startsWith('---\n')) {
        return {data: {}, body: raw}
    }

    const end = raw.indexOf('\n---', 4);

    if (end === -1) {
        return {data: {}, body: raw}
    }

    const
        block = raw.slice(4, end),
        body  = raw.slice(end + 4).replace(/^\r?\n/, ''),
        data  = {};

    const lines = block.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line  = lines[i];
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

        if (!match) {
            continue
        }

        const
            key   = match[1],
            value = stripYamlScalar(match[2]);

        if (/^[>|]/.test(value)) {
            const blockLines = [];

            while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
                blockLines.push(lines[++i].trim());
            }

            data[key] = blockLines.join(' ');
            continue
        }

        if (value === 'true') {
            data[key] = true;
        } else if (value === 'false') {
            data[key] = false;
        } else if (/^\d+$/.test(value)) {
            data[key] = Number(value);
        } else {
            data[key] = value;
        }
    }

    return {data, body}
}

/**
 * @param {unknown} value
 * @returns {Boolean}
 */
function isTruthyClosed(value) {
    return value === true || String(value).toLowerCase() === 'true'
}

/**
 * @param {unknown} value
 * @returns {String}
 */
function normalizeCategory(value) {
    return String(value || 'General').trim()
}

/**
 * @param {String|Date} updatedAt
 * @param {Date} now
 * @returns {Number|null}
 */
function getAgeDays(updatedAt, now) {
    if (!updatedAt) {
        return null
    }

    const updatedDate = new Date(updatedAt);

    if (Number.isNaN(updatedDate.getTime())) {
        return null
    }

    return Math.floor((now.getTime() - updatedDate.getTime()) / 86400000)
}

/**
 * @param {Object} discussion
 * @param {Object} options
 * @param {Date} options.now
 * @param {Number} options.staleDays
 * @returns {Object|null}
 */
function classifyDiscussion(discussion, {now, staleDays}) {
    const
        category = normalizeCategory(discussion.category),
        closed   = isTruthyClosed(discussion.closed) || String(discussion.state || '').toLowerCase() === 'closed',
        // Synced Markdown appends comments after the authoritative root body. Comments remain
        // diagnostic evidence only and cannot mutate the source-owned lifecycle projection.
        body     = String(discussion.body || '').split(/\n## Comments\s*\n/)[0],
        ageDays  = getAgeDays(discussion.updatedAt || discussion.createdAt, now),
        routing  = classifyDiscussionRoutingDisposition({
            author: discussion.author,
            body,
            closed
        });

    if (category !== 'Ideas' || closed) {
        return null
    }

    const base = {
        number   : discussion.number,
        title    : discussion.title || '(untitled)',
        updatedAt: discussion.updatedAt || discussion.createdAt || '',
        ageDays,
        filePath : discussion.filePath || ''
    };

    if (routing.disposition === 'terminal' && routing.reasonCode === 'graduated-to-ticket') {
        return {
            ...base,
            kind  : 'graduated-open',
            action: 'close RESOLVED',
            reason: 'Discussion contains [GRADUATED_TO_TICKET] but is still open.'
        }
    }

    if (routing.disposition === 'terminal' || routing.reasonCode === 'resolved-scope-without-terminal-signal') {
        const hasExplicitTerminalSignal = routing.disposition === 'terminal';

        return {
            ...base,
            kind  : 'resolved-only-review',
            action: hasExplicitTerminalSignal
                ? 'maintainer review, then close RESOLVED if no scope remains'
                : 'maintainer scope review; add an explicit terminal signal only if no scope remains',
            reason: hasExplicitTerminalSignal
                ? `Discussion routing disposition is terminal (${routing.reasonCode}).`
                : 'Discussion contains resolved-scope evidence without an explicit whole-Discussion terminal signal.'
        }
    }

    if (ageDays !== null && ageDays >= staleDays) {
        return {
            ...base,
            kind  : 'stale-open',
            action: 'maintainer stale-archive review',
            reason: routing.disposition === 'active'
                ? `Explicit active source state has no activity for ${ageDays} days (threshold: ${staleDays}); age is diagnostic only.`
                : `No activity for ${ageDays} days (threshold: ${staleDays}).`
        }
    }

    return null
}

/**
 * @param {Object[]} discussions
 * @param {Object} options
 * @param {Date} options.now
 * @param {Number} options.staleDays
 * @returns {{scanned: Number, candidates: Object[]}}
 */
function auditDiscussions(discussions, {now, staleDays}) {
    const candidates = [];
    let   scanned    = 0;

    for (const discussion of discussions) {
        if (normalizeCategory(discussion.category) === 'Ideas') {
            scanned++;
        }

        const candidate = classifyDiscussion(discussion, {now, staleDays});

        if (candidate) {
            candidates.push(candidate);
        }
    }

    candidates.sort((a, b) => {
        const byKind = CANDIDATE_ORDER[a.kind] - CANDIDATE_ORDER[b.kind];

        if (byKind !== 0) {
            return byKind
        }

        return Number(a.number || 0) - Number(b.number || 0)
    });

    return {scanned, candidates}
}

/**
 * @param {String} dir
 * @returns {Promise<String[]>}
 */
async function collectDiscussionFiles(dir) {
    let entries;

    try {
        entries = await fs.readdir(dir, {withFileTypes: true});
    } catch (err) {
        if (err.code === 'ENOENT') {
            return []
        }
        throw err
    }

    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...await collectDiscussionFiles(fullPath));
        } else if (/^discussion-\d+\.md$/.test(entry.name)) {
            files.push(fullPath);
        }
    }

    return files
}

/**
 * @param {String} discussionsDir
 * @returns {Promise<Object[]>}
 */
async function loadDiscussionsFromDir(discussionsDir) {
    const files       = await collectDiscussionFiles(discussionsDir);
    const discussions = [];

    for (const filePath of files) {
        const
            raw          = await fs.readFile(filePath, 'utf8'),
            {data, body} = parseFrontmatter(raw);

        discussions.push({
            ...data,
            body,
            filePath: path.relative(process.cwd(), filePath)
        });
    }

    return discussions
}

/**
 * @param {String} fixturePath
 * @returns {Promise<Object[]>}
 */
async function loadFixture(fixturePath) {
    return JSON.parse(await fs.readFile(fixturePath, 'utf8'))
}

/**
 * @param {Object[]} candidates
 * @returns {Object}
 */
function groupCandidates(candidates) {
    return candidates.reduce((acc, candidate) => {
        acc[candidate.kind] = (acc[candidate.kind] || 0) + 1;
        return acc
    }, {})
}

/**
 * @summary Determines when the local Discussion snapshot was last refreshed.
 *
 * **This guard reads a synced snapshot, not live GitHub, so every verdict it emits is only as
 * current as that snapshot.** Close six Discussions on GitHub and re-run, and it still reports all
 * six until the data-sync pipeline re-ingests — a stale verdict wearing the shape of a current
 * finding. A maintainer who acts on one, discovers the work is already done, and concludes the tool
 * is wrong has been taught to distrust it, which is worse than not having it.
 *
 * The commit that last touched the snapshot directory is the honest source. File mtimes are not:
 * git does not preserve them, so on any fresh checkout they read as "just now" and would report a
 * year-old snapshot as fresh — the exact failure this exists to prevent, arriving through the
 * instrument.
 *
 * @param {Object} options
 * @param {String} options.discussionsDir
 * @param {Function} options.execFileFn Promise-returning `execFile` seam.
 * @param {String} options.now ISO instant to measure age against.
 * @returns {Promise<{ingestedAt: String|null, ageHours: Number|null, source: String, reason: String|null}>}
 */
async function resolveSnapshotFreshness({discussionsDir, execFileFn, now}) {
    try {
        const {stdout} = await execFileFn('git', ['log', '-1', '--format=%cI', '--', discussionsDir], {
            encoding: 'utf8',
            timeout : 5000
        });

        const ingestedAt = String(stdout ?? '').trim();

        if (!ingestedAt) {
            return {
                ageHours  : null,
                ingestedAt: null,
                reason    : 'no commit touches the snapshot directory',
                source    : 'git'
            }
        }

        const ingestedMs = Date.parse(ingestedAt),
              nowMs      = Date.parse(now);

        if (!Number.isFinite(ingestedMs) || !Number.isFinite(nowMs)) {
            return {ageHours: null, ingestedAt, reason: 'unparsable commit timestamp', source: 'git'}
        }

        return {
            ageHours: Math.round((nowMs - ingestedMs) / 36e5 * 10) / 10,
            ingestedAt,
            reason  : null,
            source  : 'git'
        }
    } catch (error) {
        // Unknown is reported as unknown. Defaulting to "fresh" would let an unreadable history
        // silently certify every verdict below it.
        return {
            ageHours  : null,
            ingestedAt: null,
            reason    : `snapshot age could not be determined (${error.message})`,
            source    : 'unavailable'
        }
    }
}

/**
 * @param {{scanned: Number, candidates: Object[], snapshot: Object}} result
 * @param {Object} options
 * @param {Boolean} options.json
 * @param {Number} options.maxSnapshotAgeHours
 * @returns {String}
 */
function formatReport(result, {json = false, maxSnapshotAgeHours = DEFAULT_MAX_SNAPSHOT_AGE_HOURS} = {}) {
    if (json) {
        return JSON.stringify(result, null, 2)
    }

    const grouped  = groupCandidates(result.candidates),
          snapshot = result.snapshot ?? {ageHours: null, ingestedAt: null, reason: 'not measured'},
          lines    = [];

    // Stated FIRST, before any finding. A reader who sees the candidate list before the freshness
    // caveat has already begun acting on it.
    //
    // The discriminator is `ageHours`, NOT `ingestedAt`. Both unknown paths agree on a null age; only
    // one of them nulls the timestamp. An unparsable commit date returns the raw string WITH
    // `ageHours: null`, so keying on `ingestedAt` let that case fall through to the reassuring branch
    // and render as `snapshot refreshed <garbage> (nullh ago)` — the producer and this formatter
    // disagreeing about which field means "unknown". Found in review by @neo-opus-vega.
    if (snapshot.ageHours === null) {
        lines.push(
            `[discussion-lifecycle-audit] SNAPSHOT AGE UNKNOWN — ${snapshot.reason}.` +
            // Printed when present: whoever debugs the git output needs the string that failed to parse.
            (snapshot.ingestedAt === null ? '' : ` Raw commit timestamp: ${snapshot.ingestedAt}.`) +
            ' Findings below may be arbitrarily stale and must be confirmed against GitHub.'
        )
    } else if (snapshot.ageHours > maxSnapshotAgeHours) {
        lines.push(
            `[discussion-lifecycle-audit] STALE SNAPSHOT — last refreshed ${snapshot.ingestedAt}` +
            ` (${snapshot.ageHours}h ago, bound ${maxSnapshotAgeHours}h).` +
            ' Findings below describe that snapshot, NOT current GitHub state; a Discussion closed' +
            ' since then still reports as open. Confirm before acting.'
        )
    } else {
        lines.push(
            `[discussion-lifecycle-audit] snapshot refreshed ${snapshot.ingestedAt}` +
            ` (${snapshot.ageHours}h ago).`
        )
    }

    lines.push(
        `[discussion-lifecycle-audit] scanned ${result.scanned} Ideas discussions.`,
        `[discussion-lifecycle-audit] candidates: ${result.candidates.length}` +
            ` (graduated-open=${grouped['graduated-open'] || 0},` +
            ` resolved-only-review=${grouped['resolved-only-review'] || 0},` +
            ` stale-open=${grouped['stale-open'] || 0})`
    );

    for (const candidate of result.candidates) {
        const age = candidate.ageDays === null ? 'age=unknown' : `age=${candidate.ageDays}d`;

        lines.push(
            `- #${candidate.number} [${candidate.kind}] ${candidate.action}; ${age}; ${candidate.filePath}` +
            ` — ${candidate.title}`
        );
    }

    return `${lines.join('\n')}\n`
}

/**
 * @param {Object[]} candidates
 * @param {String} failOn
 * @returns {Boolean}
 */
function shouldFail(candidates, failOn) {
    if (failOn === 'none') {
        return false
    }

    if (failOn === 'all') {
        return candidates.length > 0
    }

    return candidates.some(candidate => candidate.kind === failOn)
}

/**
 * @param {String} value
 * @returns {Number}
 */
function parsePositiveNumber(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 1) {
        throw new InvalidArgumentError('must be a positive number')
    }

    return parsed
}

/**
 * @param {String} value
 * @returns {String}
 */
function parseFailOn(value) {
    if (!FAIL_ON_CHOICES.includes(value)) {
        throw new InvalidArgumentError(`must be one of: ${FAIL_ON_CHOICES.join(', ')}`)
    }

    return value
}

/**
 * @param {String} value
 * @returns {Date}
 */
function parseDateOption(value) {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        throw new InvalidArgumentError('must be a valid date')
    }

    return parsed
}

/**
 * @param {Object} [options]
 * @param {Boolean} [options.silent=false]
 * @returns {Command}
 */
function createArgParser({silent = false} = {}) {
    const program = new Command()
        .name('ai:audit-discussion-lifecycle')
        .description('Audit synced Ideation Sandbox Discussions for lifecycle-close compliance.')
        .exitOverride()
        .allowExcessArguments(false)
        .option('--discussions-dir <path>', 'Synced Discussions corpus directory.', DEFAULT_DISCUSSIONS_DIR)
        .option('--fixture <path>', 'JSON fixture file to audit instead of the synced corpus.')
        .option('--stale-days <days>', 'Open-discussion age threshold.', parsePositiveNumber, DEFAULT_STALE_DAYS)
        .option('--max-snapshot-age-hours <hours>', 'Snapshot age past which findings are labelled stale.', parsePositiveNumber, DEFAULT_MAX_SNAPSHOT_AGE_HOURS)
        .option('--fail-on <kind>', `Candidate kind that fails the run: ${FAIL_ON_CHOICES.join(', ')}.`, parseFailOn, 'graduated-open')
        .option('--today <date>', 'Reference date for age calculations.', parseDateOption, new Date())
        .option('--json', 'Emit the audit report as JSON.', false)
        .option('--report-only', 'Report candidates without failing the run.', false)
        .option('--self-test', 'Run deterministic fixture coverage.', false)

    if (silent) {
        program.configureOutput({
            writeErr: () => {},
            writeOut: () => {}
        });
    }

    return program
}

/**
 * @param {String[]} argv
 * @param {Object} [options]
 * @param {Boolean} [options.silent=false]
 * @returns {Object}
 */
function parseArgs(argv, {silent = false} = {}) {
    const program = createArgParser({silent});

    program.parse(argv, {from: 'user'});

    const options = program.opts();

    return {
        discussionsDir     : path.resolve(options.discussionsDir),
        failOn             : options.reportOnly ? 'none' : options.failOn,
        fixture            : options.fixture ? path.resolve(options.fixture) : null,
        json               : options.json,
        maxSnapshotAgeHours: options.maxSnapshotAgeHours,
        now                : options.today,
        reportOnly         : options.reportOnly,
        selfTest           : options.selfTest,
        staleDays          : options.staleDays
    }
}

/**
 * @returns {void}
 */
function runSelfTest() {
    const result = auditDiscussions([
        {
            number   : 1,
            title    : 'graduated',
            author   : 'neo-gpt',
            category : 'Ideas',
            closed   : false,
            updatedAt: '2026-06-01T00:00:00Z',
            body     : '[GRADUATED_TO_TICKET: #2]'
        },
        {
            number   : 5,
            title    : 'future criterion',
            author   : 'neo-gpt',
            category : 'Ideas',
            closed   : false,
            updatedAt: '2026-06-01T00:00:00Z',
            body     : 'This Discussion graduates when it can emit `[GRADUATED_TO_TICKET]`.'
        },
        {
            number   : 2,
            title    : 'partial',
            author   : 'neo-gpt',
            category : 'Ideas',
            closed   : false,
            updatedAt: '2026-06-01T00:00:00Z',
            body     : '[RESOLVED_TO_AC] OQ1\n[OQ_RESOLUTION_PENDING] OQ2'
        },
        {
            number   : 6,
            title    : 'instructional resolved marker',
            author   : 'neo-gpt',
            category : 'Ideas',
            closed   : false,
            updatedAt: '2026-06-01T00:00:00Z',
            body     : 'A STEP_BACK sweep is required before any `[RESOLVED_TO_AC]` / graduation.\n\nSeeding only.'
        },
        {
            number   : 7,
            title    : 'resolved only',
            author   : 'neo-gpt',
            category : 'Ideas',
            closed   : false,
            updatedAt: '2026-06-01T00:00:00Z',
            body     : 'OQ1 [RESOLVED_TO_AC] resolved.\nAll scope complete.'
        },
        {
            number   : 3,
            title    : 'stale',
            author   : 'neo-gpt',
            category : 'Ideas',
            closed   : false,
            updatedAt: '2026-01-01T00:00:00Z',
            body     : 'No markers.'
        },
        {
            number   : 8,
            title    : 'stale but explicitly active',
            author   : 'neo-gpt',
            category : 'Ideas',
            closed   : false,
            updatedAt: '2026-01-01T00:00:00Z',
            body     : 'OQ2 [OQ_RESOLUTION_PENDING] still open.'
        },
        {
            number   : 4,
            title    : 'closed graduated',
            author   : 'neo-gpt',
            category : 'Ideas',
            closed   : true,
            updatedAt: '2026-01-01T00:00:00Z',
            body     : '[GRADUATED_TO_TICKET: #5]'
        }
    ], {
        now      : new Date('2026-06-13T00:00:00Z'),
        staleDays: 90
    });

    const kinds = result.candidates.map(candidate => `${candidate.number}:${candidate.kind}`);

    if (result.scanned !== 8 || kinds.join(',') !== '1:graduated-open,7:resolved-only-review,3:stale-open,8:stale-open') {
        throw new Error(`Self-test failed: ${JSON.stringify({scanned: result.scanned, kinds})}`);
    }

    const parsed = parseArgs([
        '--json',
        '--report-only',
        '--stale-days',
        '12',
        '--fail-on',
        'all',
        '--today',
        '2026-06-13T00:00:00Z'
    ]);

    if (
        parsed.failOn !== 'none' ||
        parsed.json !== true ||
        parsed.staleDays !== 12 ||
        parsed.now.toISOString() !== '2026-06-13T00:00:00.000Z'
    ) {
        throw new Error(`Argument self-test failed: ${JSON.stringify(parsed)}`);
    }

    for (const badArgs of [
        ['--stale-days'],
        ['--stale-days', '0'],
        ['--fail-on', 'unexpected'],
        ['--today', 'not-a-date'],
        ['--unknown']
    ]) {
        let failed = false;

        try {
            parseArgs(badArgs, {silent: true});
        } catch {
            failed = true;
        }

        if (!failed) {
            throw new Error(`Argument self-test failed to reject: ${badArgs.join(' ')}`);
        }
    }

    console.log('[discussion-lifecycle-audit] self-test PASS');
}

/**
 * @returns {Promise<void>}
 */
async function main() {
    let options;

    try {
        options = parseArgs(process.argv.slice(2));
    } catch (err) {
        if (err.code === 'commander.helpDisplayed') {
            return
        }

        throw err
    }

    if (options.selfTest) {
        runSelfTest();
        return
    }

    const discussions = options.fixture
        ? await loadFixture(options.fixture)
        : await loadDiscussionsFromDir(options.discussionsDir);

    const result = auditDiscussions(discussions, {
        now      : options.now,
        staleDays: options.staleDays
    });

    // A fixture run has no snapshot to be stale — its input IS the subject under test, so measuring
    // repository history against it would report an age for something that was never ingested.
    result.snapshot = options.fixture
        ? {ageHours: null, ingestedAt: null, reason: 'fixture input — not a synced snapshot', source: 'fixture'}
        : await resolveSnapshotFreshness({
            discussionsDir: options.discussionsDir,
            execFileFn    : execFileAsync,
            now           : options.now
        });

    const report = formatReport(result, {
        json               : options.json,
        maxSnapshotAgeHours: options.maxSnapshotAgeHours
    });

    if (shouldFail(result.candidates, options.failOn)) {
        console.error(report);
        console.error(`[discussion-lifecycle-audit] FAIL: ${options.failOn} candidate(s) require lifecycle action.`);
        process.exit(1);
    }

    console.log(report);
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
    main().catch(err => {
        if (err.code?.startsWith('commander.')) {
            process.exit(1);
        }

        console.error(`[discussion-lifecycle-audit] ERROR: ${err.message}`);
        process.exit(1);
    });
}

export {
    auditDiscussions,
    classifyDiscussion,
    formatReport,
    parseFrontmatter,
    shouldFail
};
