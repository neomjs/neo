import {execFileSync}             from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path                       from 'node:path';
import process                    from 'node:process';
import {fileURLToPath}            from 'node:url';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename);

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
    FORBIDDEN_CLOSE_PATTERN = /\b(Closes|Fixes):?\s+#\d+/i,
    USAGE                   = [
        'Usage: node buildScripts/util/agent-preflight.mjs [--pr-body <file>] [--no-fix] [files...]',
        '',
        'Runs the agent commit/PR preflight gates in one pass:',
        '  - check-ticket-archaeology on scoped .mjs files',
        '  - check-block-alignment --fix, then a staged-scope check',
        '  - optional local PR-body template lint when --pr-body is provided',
        '',
        'When files are omitted, staged ACMR files are read from git.'
    ].join('\n');

/**
 * @summary Parses the agent-preflight command line without pulling in another CLI dependency.
 * @param {String[]} argv
 * @returns {Object}
 */
export function parseArgs(argv) {
    const options = {
        files : [],
        fix   : true,
        help  : false,
        prBody: null
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '-h' || arg === '--help') {
            options.help = true;
            continue
        }

        if (arg === '--no-fix') {
            options.fix = false;
            continue
        }

        if (arg === '--pr-body') {
            const value = argv[++i];
            if (!value) {
                throw new Error('--pr-body requires a file path')
            }
            options.prBody = value;
            continue
        }

        if (arg.startsWith('-')) {
            throw new Error(`unknown option: ${arg}`)
        }

        options.files.push(arg)
    }

    return options
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
        writeLine(stderr, `agent-preflight: ${error.message}`);
        writeLine(stderr, USAGE);
        return 2
    }

    if (options.help) {
        writeLine(stdout, USAGE);
        return 0
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
