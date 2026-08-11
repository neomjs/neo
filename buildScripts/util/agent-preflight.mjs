import {execFileSync}             from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {Command}                  from 'commander';
import path                       from 'node:path';
import process                    from 'node:process';
import {fileURLToPath}            from 'node:url';
import {collectStaleOverlayFindings}
                                   from '../../ai/scripts/setup/initServerConfigs.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename);

// Source-to-mirror: keep these PR-body anchors in sync with
// `.github/workflows/agent-pr-body-lint.yml`. Do not reintroduce a shared
// `prReviewAnchors.mjs`; sync-by-convention is deliberate.
export const VISIBLE_PR_BODY_ANCHORS = [
    'Evidence:',
    '## Test Evidence',
    '## Post-Merge Validation'
];

export const INVISIBLE_PR_BODY_ANCHORS = [
    'Authored by ',
    '## Deltas'
];

const
    POST_MERGE_VALIDATION_HEADING = '## Post-Merge Validation',
    // An unchecked task box, or an explicit residual marker. Checked boxes owe nothing.
    LIVE_OBLIGATION_PATTERN       = /^\s*[-*]\s*\[ \]|NOT_YET_MEASURED|^\s*Residual:/m,
    RESIDUAL_OWNER_PATTERN        = /\bResidual-Owner:?\s+#(\d+)/i,
    RESOLVES_PATTERN              = /\bResolves:?\s+#\d+/i,
    NON_CLOSING_REFERENCE_PATTERN = /\b(Refs|Related):?\s+#\d+/i,
    FORBIDDEN_CLOSE_PATTERN       = /\b(Closes|Fixes):?\s+#\d+/i,
    DECLARED_TICKET_PATTERN       = /\b(?:Resolves|Refs|Related):?\s+#(\d+)/gi,
    COMMIT_TICKET_PATTERN         = /\(#(\d+)\)\s*$/,
    CONVENTIONAL_TYPE_PATTERN     = /^([a-z][a-z0-9-]*)(?:\([^()\r\n]+\))?!?:\s+\S/;

export {COMMIT_TICKET_PATTERN, DECLARED_TICKET_PATTERN};

export const CHANGE_CLASS_TO_TYPES = Object.freeze({
    capability : Object.freeze(['feat']),
    restoration: Object.freeze(['fix']),
    // The repo's conventional zero-delta type labels. The gate maps the AUTHOR-DECLARED
    // class to this allowed set — a prefix never proves the class; the author's truthful
    // declaration remains the semantic authority. Evidence (14-day dev history): test 20,
    // docs 22, chore 65, build 4; `ci` rides the same convention for CI-config deltas.
    // Arrays are frozen and `validateChangeClass` returns an isolated copy: the policy is
    // never mutable through the map or a returned observation.
    'zero-delta': Object.freeze(['chore', 'test', 'docs', 'ci', 'build'])
});

/**
 * @summary Builds the Commander program for the agent preflight helper.
 * @returns {Command}
 */
export function createProgram() {
    return new Command()
        .name('agent-preflight')
        .description('Runs the agent commit/PR preflight gates in one pass; default mode may repair block alignment.')
        .usage('[options] [files...]')
        .option('--change-class <class>', 'Declare capability, restoration, or zero-delta for subject validation.')
        .option('--commit-subject <subject>', 'Validate the intended commit subject against --change-class.')
        .option('--pr-title <title>', 'Validate the intended PR title against --change-class.')
        .option('--pr-body <file>', 'Run local PR-body template lint against the given markdown file.')
        .option('--pr-base <ref>', 'Compare stacked PR commit tickets against this intended base.', 'origin/dev')
        .option('--pr-draft', 'Validate --pr-body as a draft PR: Refs/Related may temporarily stand in for Resolves.')
        .option('--no-fix', 'Check-only mode: skip the check-block-alignment --fix repair pass.')
        .argument('[files...]', 'Optional file paths. When omitted, staged ACMR files are read from git.')
}

/**
 * @summary Parses the agent-preflight command line with the shared Commander dependency.
 * @param {String[]} argv
 * @returns {Object}
 */
export function parseArgs(argv) {
    const program = createProgram();

    program.exitOverride();
    program.configureOutput({writeOut: () => {}, writeErr: () => {}});
    program.parse(argv, {from: 'user'});

    const options = program.opts();

    return {
        changeClass  : options.changeClass || null,
        commitSubject: options.commitSubject || null,
        files        : program.args,
        fix          : options.fix,
        help         : false,
        prBase       : options.prBase,
        prBody       : options.prBody || null,
        prDraft      : options.prDraft || false,
        prTitle      : options.prTitle || null
    }
}

function writeUsage(stream) {
    stream.write(createProgram().helpInformation())
}

/**
 * @summary Reads staged ACMR file paths from git when the caller does not provide an explicit file list.
 * @param {Object} deps
 * @param {String} deps.cwd
 * @param {Function} deps.execFileSyncImpl
 * @returns {String[]}
 */
export function getStagedFiles({cwd, execFileSyncImpl = execFileSync}) {
    const output = execFileSyncImpl(
        'git',
        ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
        {cwd, encoding: 'utf8'}
    );

    return String(output).trim().split('\n').map(file => file.trim()).filter(Boolean)
}

/**
 * @summary Keeps the source gates scoped to JavaScript module files.
 * @param {String[]} files
 * @returns {String[]}
 */
export function filterMjsFiles(files) {
    return files.filter(file => file.endsWith('.mjs'))
}

/**
 * @summary Validates the author's explicit semantic change class against intended Conventional Commit subjects.
 *
 * The author owns the semantic classification. This guard deliberately does not inspect issue labels, changed
 * files, or diff size; it only maps the declared class to its required type and checks the supplied surfaces.
 *
 * @param {Object} [options]
 * @param {String|null} [options.changeClass]
 * @param {String|null} [options.commitSubject]
 * @param {String|null} [options.prTitle]
 * @returns {{errors: String[], expectedTypes: String[]|null, skipped: Boolean, valid: Boolean}}
 */
export function validateChangeClass({
    changeClass = null,
    commitSubject = null,
    prTitle = null
} = {}) {
    const
        subjects = [
            {label: 'commit subject', value: commitSubject},
            {label: 'PR title',       value: prTitle}
        ].filter(({value}) => Boolean(value)),
        hasInput = Boolean(changeClass) || subjects.length > 0;

    if (!hasInput) {
        return {
            errors       : [],
            expectedTypes: null,
            skipped      : true,
            valid        : true
        }
    }

    const
        errors        = [],
        expectedTypes = Object.hasOwn(CHANGE_CLASS_TO_TYPES, changeClass)
            ? CHANGE_CLASS_TO_TYPES[changeClass]
            : null;

    if (!changeClass) {
        errors.push('`--change-class` is required when `--commit-subject` or `--pr-title` is provided.')
    } else if (!expectedTypes) {
        errors.push(
            `Unknown change class \`${changeClass}\`; expected capability, restoration, or zero-delta.`
        )
    }

    if (subjects.length === 0) {
        errors.push('`--change-class` requires at least one `--commit-subject` or `--pr-title` to validate.')
    }

    if (expectedTypes) {
        const requirement = expectedTypes.length === 1
            ? `requires \`${expectedTypes[0]}\``
            : `requires one of ${expectedTypes.map(type => `\`${type}\``).join(', ')}`;

        subjects.forEach(({label, value}) => {
            const match = value.match(CONVENTIONAL_TYPE_PATTERN);

            if (!match) {
                errors.push(
                    `${label} is missing a valid Conventional Commit prefix; change class ` +
                    `\`${changeClass}\` ${requirement}.`
                )
            } else if (!expectedTypes.includes(match[1])) {
                errors.push(
                    `${label} declares \`${match[1]}\`, but change class \`${changeClass}\` ` +
                    `${requirement}.`
                )
            }
        })
    }

    return {
        errors,
        // An observation, never a write capability: the copy isolates the caller from the
        // frozen policy arrays, so mutating a result cannot change later validations.
        expectedTypes: expectedTypes ? [...expectedTypes] : null,
        skipped      : false,
        valid        : errors.length === 0
    }
}

/**
 * @summary Mirrors the Agent PR Body Lint workflow's local body-shape checks.
 * @param {String} body
 * @param {Object} [options]
 * @param {Boolean} [options.draft=false]
 * @returns {Object}
 */
/**
 * @summary Returns the body of the `## Post-Merge Validation` section, or `''` when absent.
 *
 * The anchor check above proves the heading string appears SOMEWHERE; it says nothing about what
 * follows it. This reads the section itself — heading to the next `##` heading, or to end-of-body when
 * it is last.
 * @param {String} body
 * @returns {String}
 * @private
 */
function postMergeValidationSection(body = '') {
    const start = body.indexOf(POST_MERGE_VALIDATION_HEADING);

    if (start === -1) return '';

    const
        after = body.slice(start + POST_MERGE_VALIDATION_HEADING.length),
        next  = after.search(/^##\s/m);

    return next === -1 ? after : after.slice(0, next)
}

/**
 * @summary Reports whether a Post-Merge Validation section still owes work.
 *
 * A live obligation is an unchecked task box, or an explicit residual marker. A section of checked
 * boxes, or one that says the work is done, owes nothing — which is why presence of the section is
 * never itself the trigger.
 * @param {String} section
 * @returns {String|null} The first live obligation, for the failure message, or `null`.
 * @private
 */
function firstLiveObligation(section = '') {
    const line = section.split('\n').find(entry => LIVE_OBLIGATION_PATTERN.test(entry));

    return line ? line.trim() : null
}

export function validatePrBody(body, {draft = false} = {}) {
    const
        missingVisible         = VISIBLE_PR_BODY_ANCHORS.filter(anchor => !body.includes(anchor)),
        missingInvisible       = INVISIBLE_PR_BODY_ANCHORS.filter(anchor => !body.includes(anchor)),
        forbiddenClose         = body.match(FORBIDDEN_CLOSE_PATTERN),
        hasResolves            = RESOLVES_PATTERN.test(body),
        hasNonClosingReference = NON_CLOSING_REFERENCE_PATTERN.test(body);

    if (forbiddenClose) {
        missingVisible.push(`\`${forbiddenClose[1]} #N\` is forbidden; use \`Resolves #N\``)
    }

    if (!hasResolves && !(draft && hasNonClosingReference)) {
        missingVisible.push(draft
            ? 'Draft PR bodies without `Resolves #N` require `Refs #N` or `Related: #N`'
            : '`Resolves #N` is required')
    }

    // Deferred work must name a home that SURVIVES the merge. Parking it on the close target is the
    // one destination guaranteed to be unreachable the moment it becomes actionable — measured across
    // four merged PRs whose close targets shut within a second of the merge, three of them keeping no
    // record at all. `Residual-Owner` names ownership that ALREADY exists; it is never a licence to
    // mint a ticket, which is why the message below prescribes finishing or dropping first.
    const obligation = firstLiveObligation(postMergeValidationSection(body));

    if (obligation) {
        const
            resolvesMatch = body.match(RESOLVES_PATTERN),
            ownerMatch    = body.match(RESIDUAL_OWNER_PATTERN),
            closeTarget   = resolvesMatch ? resolvesMatch[0].match(/\d+/)[0] : null,
            owner         = ownerMatch ? ownerMatch[1] : null;

        if (!owner) {
            missingVisible.push(`\`## Post-Merge Validation\` still owes work — "${obligation}" — with no \`Residual-Owner: #N\`. Finish it before merge, or name an EXISTING open ticket that owns it, or drop the obligation. Do not open a ticket to satisfy this.`)
        } else if (owner === closeTarget) {
            missingVisible.push(`\`Residual-Owner: #${owner}\` is this PR's own close target, so the owner disappears when the merge closes it. Name an EXISTING open ticket, or finish the work, or drop it.`)
        }
    }

    return {
        missingInvisible,
        missingVisible,
        valid: missingVisible.length === 0 && missingInvisible.length === 0
    }
}

/**
 * @summary Parses NUL-delimited `git log` output into PR commit receipts.
 * @param {String} output
 * @returns {Array<{sha: String, subject: String}>}
 */
export function parsePrCommitLog(output = '') {
    const
        tokens  = String(output).split('\0'),
        commits = [];

    for (let index = 0; index + 1 < tokens.length; index += 2) {
        const sha = tokens[index];

        if (sha) {
            commits.push({sha, subject: tokens[index + 1] || ''})
        }
    }

    return commits
}

/**
 * @summary Reads the commits one PR branch carries relative to its intended base.
 * @param {Object} options
 * @param {String} options.base
 * @param {String} options.cwd
 * @param {Function} [options.execFileSyncImpl]
 * @returns {Array<{sha: String, subject: String}>}
 */
export function getPrBranchCommits({base, cwd, execFileSyncImpl = execFileSync}) {
    const output = execFileSyncImpl('git', [
        'log',
        '-z',
        '--format=%H%x00%s',
        '--reverse',
        `${base}..HEAD`
    ], {
        cwd,
        encoding: 'utf8',
        stdio   : 'pipe'
    });

    return parsePrCommitLog(output)
}

/**
 * @summary Mirrors hosted stacked-PR ticket declarations against local branch commits.
 * @param {String} body
 * @param {Array<{sha: String, subject: String}>} commits
 * @returns {{declaredTickets: String[], foreignCommits: Object[], valid: Boolean}}
 */
export function validateStackedPrTickets(body, commits = []) {
    const
        declaredTickets = new Set(
            [...body.matchAll(DECLARED_TICKET_PATTERN)].map(match => match[1])
        ),
        foreignCommits = [];

    if (declaredTickets.size > 0) {
        commits.forEach(({sha, subject}) => {
            const ticket = subject.match(COMMIT_TICKET_PATTERN);

            if (ticket && !declaredTickets.has(ticket[1])) {
                foreignCommits.push({
                    sha    : sha.slice(0, 10),
                    subject: subject.slice(0, 72),
                    ticket : ticket[1]
                })
            }
        })
    }

    return {
        declaredTickets: [...declaredTickets],
        foreignCommits,
        valid          : foreignCommits.length === 0
    }
}

const LEDGER_SIGNATURE_PATTERN = /([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/;

/**
 * @summary Extracts ledger-declared `symbol(params)` signatures from a Contract Ledger table in a PR body.
 *
 * Opt-in + high-precision: only markdown rows belonging to a table whose header carries BOTH a `Surface`
 * and a `Signature` column are considered, and within each row only the `Signature` *cell* is scanned for a
 * `name(args)` token (an incidental `name(args)` in a Surface/Notes column is ignored). A body with NO
 * Contract Ledger therefore yields `[]` and the drift check is inert — this is the author's *declared*
 * contract surface, the only thing the drift check verifies against the diff.
 *
 * @param {String} body The PR / ticket markdown body.
 * @returns {Array<{symbol: String, params: String}>} The ledger-declared signatures.
 */
export function extractLedgerSignatures(body = '') {
    const signatures    = [];
    let   inLedgerTable = false,
          signatureColumn = -1;

    for (const line of body.split('\n')) {
        if (!line.trim().startsWith('|')) { inLedgerTable = false; continue; }

        // A ledger table is identified by a header row carrying both `Surface` and `Signature`; the flag
        // then persists across the table's body rows until a non-table line resets it. We also record the
        // `Signature` column index so extraction scans ONLY that cell — an incidental `name(args)` in a
        // Surface/Notes column must never be mistaken for the declared signature.
        if (/\bsurface\b/i.test(line) && /\bsignature\b/i.test(line)) {
            inLedgerTable   = true;
            signatureColumn = line.split('|').findIndex(cell => /\bsignature\b/i.test(cell));
            continue;
        }
        if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // the |---|---| separator row

        if (!inLedgerTable || signatureColumn < 0) continue;

        const cell  = line.split('|')[signatureColumn],
              match = cell?.match(LEDGER_SIGNATURE_PATTERN);
        if (match) signatures.push({symbol: match[1], params: match[2]});
    }

    return signatures;
}

/**
 * @summary Finds a symbol's shipped parameter list from its DEFINITION in the ADDED (`+`) lines of a diff.
 *
 * Conservative + definition-only + SINGLE-LINE: matches `symbol(params)` only when the whole `name(params) {`
 * (or `name(params) =>`) sits on ONE added line. A bare CALL-site `symbol(args)` (followed by `;`, `,`, `)`,
 * `.`) is NOT matched, so a call appearing before the def can never be mistaken for the shipped signature.
 * A MULTI-LINE definition — params spanning several lines, as large destructured params often are — is a
 * silent MISS (returns `null`), never a false signal. This is the safe direction for a warn-only check: a
 * miss costs nothing, a false-warn costs a review cycle. Multi-line coverage via a brace-balanced
 * accumulator is a tracked follow-up; authors must not read a non-warn as proof of no drift.
 *
 * @param {String} diffText A unified diff (`git diff` output).
 * @param {String} symbol The symbol name to locate.
 * @returns {String|null} The shipped params string, or `null` if no definition is found on an added line.
 */
export function findShippedSignature(diffText = '', symbol = '') {
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          // Require a definition shape — `)` followed by `{` (function/method body) or `=>` (arrow) — so a
          // bare call-site `symbol(args)` is never mistaken for the def (the call-before-def false-warn).
          definePattern = new RegExp(`^\\+(?!\\+).*\\b${escaped}\\s*\\(([^)]*)\\)\\s*(?:\\{|=>)`);

    for (const line of diffText.split('\n')) {
        const match = line.match(definePattern);
        if (match) return match[1];
    }

    return null;
}

/**
 * @summary Normalizes a parameter string to a comparable shape — positional arity vs destructured key-set —
 * so cosmetic differences (whitespace, destructured key ORDER, defaults) never read as drift.
 *
 * @param {String} params The raw parameter string (between the parens).
 * @returns {{shape: String, arity: Number, keys: String[]}}
 */
export function normalizeSignatureShape(params = '') {
    const trimmed = params.trim();
    if (trimmed === '') return {shape: 'positional', arity: 0, keys: []};

    if (trimmed.startsWith('{')) {
        const keys = trimmed.replace(/[{}]/g, '')
            .split(',')
            .map(key => key.split(/[:=]/)[0].trim())
            .filter(Boolean)
            .sort();
        return {shape: 'destructured', arity: keys.length, keys};
    }

    const arity = trimmed.split(',').map(part => part.trim()).filter(Boolean).length;
    return {shape: 'positional', arity, keys: []};
}

/**
 * @summary Detects Contract-Ledger-vs-shipped-diff signature drift — the author-side dual of the pr-review
 * Contract Completeness Audit. Catches the "ledger described the pre-evolution contract" class (a
 * destructured-vs-positional signature; an added field the ledger omits) BEFORE the PR opens, rather than
 * burning a scarce cross-family review cycle on a mechanical gap.
 *
 * **Opt-in** (no ledger → no check), **high-precision** (only ledger-declared symbols actually found in the
 * diff), and **warn-only** (the caller never gates on it): a miss is silent; only a clear shape / arity /
 * destructured-key mismatch warns. By construction it cannot false-positive on un-laddered code.
 *
 * @param {Object} options
 * @param {String} options.body The PR / ticket body carrying the Contract Ledger.
 * @param {String} [options.diffText] The staged unified diff to verify against. Falsy ⇒ no check.
 * @returns {String[]} Human-readable drift warnings (empty when no drift / no ledger / no diff).
 */
export function detectContractLedgerDrift({body = '', diffText = ''} = {}) {
    if (!diffText) return [];

    const warnings = [];

    for (const {symbol, params: ledgerParams} of extractLedgerSignatures(body)) {
        const shippedParams = findShippedSignature(diffText, symbol);
        if (shippedParams === null) continue;

        const ledgerShape  = normalizeSignatureShape(ledgerParams),
              shippedShape = normalizeSignatureShape(shippedParams),
              drifted      = ledgerShape.shape !== shippedShape.shape
                          || ledgerShape.arity !== shippedShape.arity
                          || ledgerShape.keys.join(',') !== shippedShape.keys.join(',');

        if (drifted) {
            warnings.push(
                `Contract Ledger drift: \`${symbol}\` — ledger declares (${ledgerParams.trim()}) but the diff ` +
                `ships (${shippedParams.trim()}). Update the ledger or the signature before opening the PR.`
            )
        }
    }

    return warnings;
}

function writeLine(stream, line = '') {
    stream.write(line + '\n')
}

function writeOutput(stream, output) {
    if (!output) {
        return
    }

    stream.write(output.endsWith('\n') ? output : output + '\n')
}

function runNodeGate({args, cwd, execFileSyncImpl, name}) {
    try {
        const output = execFileSyncImpl(process.execPath, args, {cwd, encoding: 'utf8', stdio: 'pipe'});
        return {name, ok: true, output: String(output || '')}
    } catch (error) {
        return {
            name,
            ok    : false,
            output: [error.stdout, error.stderr, error.message].filter(Boolean).join('\n'),
            status: error.status || 1
        }
    }
}

function runPrBodyGate({cwd, existsSyncImpl, prBody, prDraft, readFileSyncImpl}) {
    const filePath = path.resolve(cwd, prBody);

    if (!existsSyncImpl(filePath)) {
        return {
            missingInvisible: [],
            missingVisible  : [`PR body file not found: ${prBody}`],
            valid           : false
        }
    }

    return validatePrBody(readFileSyncImpl(filePath, 'utf8'), {draft: prDraft})
}

/**
 * @summary Runs the bundled agent preflight gates and returns a process-style status code.
 * @param {Object} deps
 * @returns {Number}
 */
export function runAgentPreflight({
    argv             = process.argv.slice(2),
    collectStaleOverlayFindingsImpl = collectStaleOverlayFindings,
    cwd              = process.cwd(),
    execFileSyncImpl = execFileSync,
    existsSyncImpl   = existsSync,
    readFileSyncImpl = readFileSync,
    scriptDir        = __dirname,
    stderr           = process.stderr,
    stdout           = process.stdout
} = {}) {
    let options;

    try {
        options = parseArgs(argv)
    } catch (error) {
        if (error.code === 'commander.helpDisplayed') {
            writeUsage(stdout);
            return 0
        }

        writeLine(stderr, `agent-preflight: ${error.message}`);
        writeUsage(stderr);
        return 2
    }

    const failures = [];

    let files = options.files;
    if (files.length === 0) {
        try {
            files = getStagedFiles({cwd, execFileSyncImpl})
        } catch (error) {
            writeLine(stderr, `agent-preflight: could not read staged files: ${error.message}`);
            return 1
        }
    }

    const mjsFiles = filterMjsFiles(files);

    if (mjsFiles.length === 0) {
        writeLine(stdout, 'agent-preflight: 0 .mjs files in scope; skipped source gates.');
    } else {
        if (options.fix) {
            writeLine(stdout, 'agent-preflight: repair mode enabled; running check-block-alignment --fix before staged checks. Use --no-fix for check-only validation.');
        } else {
            writeLine(stdout, 'agent-preflight: check-only mode; skipped check-block-alignment --fix.');
        }

        const gateRuns = [
            runNodeGate({
                args: [path.join(scriptDir, 'check-ticket-archaeology.mjs'), ...mjsFiles],
                cwd,
                execFileSyncImpl,
                name: 'check-ticket-archaeology'
            })
        ];

        if (options.fix) {
            gateRuns.push(runNodeGate({
                args: [path.join(scriptDir, 'check-block-alignment.mjs'), '--fix', ...mjsFiles],
                cwd,
                execFileSyncImpl,
                name: 'check-block-alignment --fix'
            }))
        }

        gateRuns.push(runNodeGate({
            args: [path.join(scriptDir, 'check-block-alignment.mjs'), '--staged', ...mjsFiles],
            cwd,
            execFileSyncImpl,
            name: 'check-block-alignment --staged'
        }));

        for (const result of gateRuns) {
            writeOutput(result.ok ? stdout : stderr, result.output);
            if (!result.ok) {
                failures.push(result.name)
            }
        }
    }

    const changeClassResult = validateChangeClass(options);

    if (changeClassResult.skipped) {
        writeLine(stdout, 'agent-preflight: no semantic inputs provided; skipped change-class validation.');
    } else if (changeClassResult.valid) {
        const surfaceCount = [options.commitSubject, options.prTitle].filter(Boolean).length;

        writeLine(
            stdout,
            `agent-preflight: declared ${options.changeClass} maps to ${changeClassResult.expectedTypes.join(', ')}; ` +
            `${surfaceCount} intended subject${surfaceCount === 1 ? '' : 's'} matched.`
        )
    } else {
        failures.push('change-class');
        writeLine(stderr, 'agent-preflight: change-class validation failed.');
        changeClassResult.errors.forEach(error => writeLine(stderr, `  - ${error}`))
    }

    // Advisory-only local overlay drift check. Gitignored config.mjs overlays can go stale even when the
    // staged source gates are green; surfacing the exact STALE_OVERLAY rows here prevents false-green PR
    // churn without mutating operator-local files or failing unrelated preflight runs.
    try {
        const staleOverlayFindings = collectStaleOverlayFindingsImpl();

        if (staleOverlayFindings.length > 0) {
            writeLine(stdout, 'agent-preflight: STALE_OVERLAY warning(s) (non-blocking):');
            staleOverlayFindings.forEach(finding => {
                writeLine(stdout, `  - ${finding.label}`);
                finding.items.forEach(item => writeLine(stdout, `    + ${item}`))
            })
        }
    } catch (error) {
        writeLine(stdout, `agent-preflight: STALE_OVERLAY check skipped (${error.message}).`)
    }

    if (options.prBody) {
        const result = runPrBodyGate({
            cwd,
            existsSyncImpl,
            prBody : options.prBody,
            prDraft: options.prDraft,
            readFileSyncImpl
        });

        if (result.valid) {
            writeLine(stdout, 'agent-preflight: PR body contains the required template anchors.');

            try {
                const
                    body    = readFileSyncImpl(path.resolve(cwd, options.prBody), 'utf8'),
                    commits = getPrBranchCommits({
                        base: options.prBase,
                        cwd,
                        execFileSyncImpl
                    }),
                    stackResult = validateStackedPrTickets(body, commits);

                if (stackResult.valid) {
                    writeLine(
                        stdout,
                        `agent-preflight: stacked PR tickets match ${stackResult.declaredTickets.length} ` +
                        `declared ticket(s) across ${commits.length} commit(s).`
                    )
                } else {
                    failures.push('pr-body-stack');
                    writeLine(
                        stderr,
                        `agent-preflight: stacked PR ticket declaration lint failed against ${options.prBase}.`
                    );
                    stackResult.foreignCommits.forEach(commit => writeLine(
                        stderr,
                        `  - \`${commit.sha}\` claims #${commit.ticket} — \`${commit.subject}\``
                    ))
                }
            } catch (error) {
                failures.push('pr-body-stack');
                writeLine(
                    stderr,
                    `agent-preflight: could not inspect PR commits relative to ${options.prBase}: ${error.message}`
                )
            }
        } else {
            failures.push('pr-body');
            writeLine(stderr, 'agent-preflight: PR body template lint failed.');
            if (result.missingVisible.length > 0) {
                writeLine(stderr, 'Visible/body-closing misses:');
                result.missingVisible.forEach(anchor => writeLine(stderr, `  - ${anchor}`));
            }
            if (result.missingInvisible.length > 0) {
                writeLine(stderr, 'Structural template anchors are missing; reread .agents/skills/pull-request/SKILL.md before editing the body.');
            }
        }

        // Author-side Contract-Ledger-vs-diff drift: opt-in (only fires when the body carries a Contract
        // Ledger), WARN-only (never added to `failures`), and best-effort (a check error never fails the
        // preflight). Verifies a declared signature against the staged diff before the PR opens.
        try {
            const bodyPath = path.resolve(cwd, options.prBody);

            if (existsSyncImpl(bodyPath)) {
                let diffText = '';
                try {
                    diffText = String(execFileSyncImpl('git', ['diff', '--cached'], {cwd, encoding: 'utf8', stdio: 'pipe'}) || '')
                } catch {
                    diffText = '' // no staged diff (or not a git tree) → the drift check is inert
                }

                const driftWarnings = detectContractLedgerDrift({
                    body: readFileSyncImpl(bodyPath, 'utf8'),
                    diffText
                });

                if (driftWarnings.length > 0) {
                    writeLine(stdout, 'agent-preflight: Contract Ledger drift warning(s) (non-blocking):');
                    driftWarnings.forEach(warning => writeLine(stdout, `  ⚠ ${warning}`))
                }
            }
        } catch (error) {
            writeLine(stdout, `agent-preflight: contract-drift check skipped (${error.message}).`)
        }
    } else {
        writeLine(stdout, 'agent-preflight: no --pr-body provided; skipped PR-body lint.');
    }

    if (failures.length > 0) {
        writeLine(stderr, `agent-preflight: ${failures.length} gate(s) failed: ${failures.join(', ')}`);
        return 1
    }

    writeLine(stdout, 'agent-preflight: all requested gates passed.');
    return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    process.exitCode = runAgentPreflight()
}
