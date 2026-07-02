import {execFileSync, spawnSync} from 'node:child_process';
import process                   from 'node:process';
import {fileURLToPath}           from 'node:url';
import path                      from 'node:path';

const
    __filename           = fileURLToPath(import.meta.url),
    AGENT_BRANCH_PATTERN = /^agent\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u,
    FORBIDDEN_FLAGS      = new Set([
        '-f',
        '--all',
        '--delete',
        '--force',
        '--force-if-includes',
        '--force-with-lease',
        '--mirror',
        '--tags'
    ]);

/**
 * @summary Parses the narrow agent-push argv surface without trusting git's full push grammar.
 * @param {String[]} argv Raw wrapper arguments, excluding `node` and script path.
 * @returns {{remote: String, refspec: String|null, setUpstream: Boolean}}
 */
export function parseArgs(argv = []) {
    const positional  = [];
    let   setUpstream = false;

    for (const arg of argv) {
        if (arg === '-u') {
            if (setUpstream) {
                throw new Error('duplicate -u option')
            }

            setUpstream = true;
            continue
        }

        if (arg.startsWith('-')) {
            if (FORBIDDEN_FLAGS.has(arg)) {
                throw new Error(`refusing unsafe git push option: ${arg}`)
            }

            throw new Error(`unsupported git push option: ${arg}`)
        }

        positional.push(arg)
    }

    if (positional.length > 2) {
        throw new Error('refusing multiple refspecs; pass at most one branch refspec')
    }

    const
        remote  = positional[0] || 'origin',
        refspec = positional.length === 2 ? positional[1] : null;

    if (remote !== 'origin') {
        throw new Error(`remote must be origin, received: ${remote}`)
    }

    assertSafeRefspec(refspec);

    return {remote, refspec, setUpstream}
}

/**
 * @summary Rejects refspec forms whose source/destination grammar cannot be prefix-proved safely.
 * @param {String|null} refspec
 * @returns {void}
 */
export function assertSafeRefspec(refspec) {
    if (!refspec) {
        return
    }

    if (refspec.startsWith('+')) {
        throw new Error('refusing force refspec prefix')
    }

    if (refspec.includes(':')) {
        throw new Error('refusing colon refspec; destination must be implicit and agent-scoped')
    }

    if (refspec.includes('*')) {
        throw new Error('refusing wildcard refspec')
    }
}

/**
 * @summary Reads the current git branch for implicit or HEAD refspec destinations.
 * @param {Object} options
 * @param {String} options.cwd
 * @param {Function} options.execFileSyncImpl
 * @returns {String}
 */
export function getCurrentBranch({cwd = process.cwd(), execFileSyncImpl = execFileSync} = {}) {
    const branch = String(execFileSyncImpl('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd,
        encoding: 'utf8',
        stdio   : 'pipe'
    })).trim();

    if (!branch || branch === 'HEAD') {
        throw new Error('cannot infer destination from detached HEAD')
    }

    return branch
}

/**
 * @summary Normalizes a branch-like ref to the remote branch destination the wrapper will permit.
 * @param {String} ref
 * @returns {String}
 */
export function normalizeDestination(ref) {
    return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref
}

/**
 * @summary Proves the effective push destination is an allowed agent branch.
 * @param {Object} options
 * @param {String|null} options.refspec
 * @param {String} options.currentBranch
 * @returns {String}
 */
export function resolveDestination({currentBranch, refspec = null} = {}) {
    const destination = normalizeDestination(!refspec || refspec === 'HEAD' ? currentBranch : refspec);

    if (!AGENT_BRANCH_PATTERN.test(destination)) {
        throw new Error(`destination must be an agent/* branch, resolved: ${destination}`)
    }

    return destination
}

/**
 * @summary Builds the validated `git push` argv that the wrapper will execute.
 * @param {Object} options
 * @param {String|null} options.refspec
 * @param {String} options.remote
 * @param {Boolean} options.setUpstream
 * @param {String} options.destination
 * @returns {String[]}
 */
export function buildGitPushArgs({destination, refspec = null, remote = 'origin', setUpstream = false} = {}) {
    return [
        'push',
        ...(setUpstream ? ['-u'] : []),
        remote,
        refspec || destination
    ]
}

function writeLine(stream, line = '') {
    stream.write(line + '\n')
}

/**
 * @summary Runs the refspec-validated agent push wrapper and returns a process-style status code.
 * @param {Object} options
 * @returns {Number}
 */
export function runAgentPush({
    argv             = process.argv.slice(2),
    cwd              = process.cwd(),
    execFileSyncImpl = execFileSync,
    spawnSyncImpl    = spawnSync,
    stderr           = process.stderr
} = {}) {
    let parsed, currentBranch, destination;

    try {
        parsed = parseArgs(argv);
        currentBranch = getCurrentBranch({cwd, execFileSyncImpl});
        destination = resolveDestination({currentBranch, refspec: parsed.refspec})
    } catch (error) {
        writeLine(stderr, `agent-push: ${error.message}`);
        return 1
    }

    const result = spawnSyncImpl('git', buildGitPushArgs({
        destination,
        refspec    : parsed.refspec,
        remote     : parsed.remote,
        setUpstream: parsed.setUpstream
    }), {
        cwd,
        stdio: 'inherit'
    });

    if (typeof result.status === 'number') {
        return result.status
    }

    return result.error ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    process.exitCode = runAgentPush()
}
