import {execFileSync}             from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {Command}                  from 'commander';
import path                       from 'node:path';
import process                    from 'node:process';
import {fileURLToPath}            from 'node:url';

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
    RESOLVES_PATTERN        = /\bResolves:?\s+#\d+/i,
    FORBIDDEN_CLOSE_PATTERN = /\b(Closes|Fixes):?\s+#\d+/i;

/**
 * @summary Builds the Commander program for the agent preflight helper.
 * @returns {Command}
 */
export function createProgram() {
    return new Command()
        .name('agent-preflight')
        .description('Runs the agent commit/PR preflight gates in one pass; default mode may repair block alignment.')
        .usage('[options] [files...]')
        .option('--pr-body <file>', 'Run local PR-body template lint against the given markdown file.')
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
        files : program.args,
        fix   : options.fix,
        help  : false,
        prBody: options.prBody || null
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
 * @summary Mirrors the Agent PR Body Lint workflow's local body-shape checks.
 * @param {String} body
 * @returns {Object}
 */
export function validatePrBody(body) {
    const
        missingVisible   = VISIBLE_PR_BODY_ANCHORS.filter(anchor => !body.includes(anchor)),
        missingInvisible = INVISIBLE_PR_BODY_ANCHORS.filter(anchor => !body.includes(anchor)),
        forbiddenClose   = body.match(FORBIDDEN_CLOSE_PATTERN);

    if (forbiddenClose) {
        missingVisible.push(`\`${forbiddenClose[1]} #N\` is forbidden; use \`Resolves #N\``)
    }

    if (!RESOLVES_PATTERN.test(body)) {
        missingVisible.push('`Resolves #N` is required')
    }

    return {
        missingInvisible,
        missingVisible,
        valid: missingVisible.length === 0 && missingInvisible.length === 0
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

function runPrBodyGate({cwd, existsSyncImpl, prBody, readFileSyncImpl}) {
    const filePath = path.resolve(cwd, prBody);

    if (!existsSyncImpl(filePath)) {
        return {
            missingInvisible: [],
            missingVisible  : [`PR body file not found: ${prBody}`],
            valid           : false
        }
    }

    return validatePrBody(readFileSyncImpl(filePath, 'utf8'))
}

/**
 * @summary Runs the bundled agent preflight gates and returns a process-style status code.
 * @param {Object} deps
 * @returns {Number}
 */
export function runAgentPreflight({
    argv             = process.argv.slice(2),
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

    if (options.prBody) {
        const result = runPrBodyGate({
            cwd,
            existsSyncImpl,
            prBody: options.prBody,
            readFileSyncImpl
        });

        if (result.valid) {
            writeLine(stdout, 'agent-preflight: PR body contains the required template anchors.');
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
