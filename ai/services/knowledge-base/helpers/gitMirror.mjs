import {spawn} from 'child_process';
import fs      from 'fs-extra';
import os      from 'os';
import path    from 'path';

import {
    assertCleanCloneUrl,
    deriveTenantRepoMirrorPath,
    redactTenantRepoSecrets
} from './tenantRepoAccessContract.mjs';

/**
 * @summary Git-backed persistent mirror primitive for server-side tenant repo ingestion.
 *
 * `GitMirror` owns only the low-level mirror lifecycle for #11788: clone-if-missing,
 * fetch, ref resolution, ancestry checks, and revision diffs. It deliberately consumes
 * the #11787 clean repo-access helpers instead of deriving paths or persisting
 * credential material itself. Higher-level `tenant-repo-sync` cadence and
 * `ingestSourceFiles()` envelope construction remain owned by sibling subs #11790
 * and #11789.
 *
 * @see https://github.com/neomjs/neo/issues/11788
 * @see https://github.com/neomjs/neo/issues/11787
 */

const GIT_TERMINAL_PROMPT_DISABLED = '0';
const ASKPASS_SCRIPT = `#!/bin/sh
case "$1" in
    *Username*|*username*) printf '%s\\n' "\${NEO_GITMIRROR_USERNAME:-x-access-token}" ;;
    *) printf '%s\\n' "$NEO_GITMIRROR_PASSWORD" ;;
esac
`;

/**
 * @summary Creates a stable GitMirror error for callers and tests.
 * @param {String} code Stable `KB_GITMIRROR_*` error code.
 * @param {String} message Human-readable message.
 * @param {Object} details={}
 * @returns {Error}
 * @private
 */
function createGitMirrorError(code, message, details = {}) {
    const secretHints = details.secretHints || [];
    const error       = new Error(redactTenantRepoSecrets(message, {secretHints}));

    error.code = code;

    if (details.stdout) {
        error.stdout = redactTenantRepoSecrets(details.stdout, {secretHints});
    }

    if (details.stderr) {
        error.stderr = redactTenantRepoSecrets(details.stderr, {secretHints});
    }

    if (details.exitCode !== undefined) {
        error.exitCode = details.exitCode;
    }

    if (details.cause) {
        error.cause = details.cause;
    }

    return error;
}

/**
 * @summary Returns a narrow subprocess environment instead of inheriting credential-bearing shell state.
 * @param {Object} overrides Git-specific environment overrides.
 * @returns {Object}
 * @private
 */
function createGitEnv(overrides = {}) {
    const env = {
        GIT_TERMINAL_PROMPT: GIT_TERMINAL_PROMPT_DISABLED
    };

    for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SystemRoot', 'USERPROFILE']) {
        if (process.env[key]) {
            env[key] = process.env[key];
        }
    }

    return {
        ...env,
        ...overrides
    };
}

/**
 * @summary Normalizes supported credential reference shapes.
 * @param {String|Object|null} credentialRef Durable credential reference.
 * @returns {Object|null}
 * @private
 */
function normalizeCredentialRef(credentialRef) {
    if (!credentialRef) {
        return null;
    }

    if (typeof credentialRef === 'string') {
        if (credentialRef === 'none') {
            return {type: 'none'};
        }

        if (credentialRef.startsWith('env:')) {
            return {type: 'env', name: credentialRef.slice(4)};
        }

        if (credentialRef.startsWith('ssh:')) {
            return {type: 'ssh', keyPath: credentialRef.slice(4)};
        }

        if (credentialRef.startsWith('file:')) {
            return {type: 'file', filePath: credentialRef.slice(5)};
        }

        return {type: 'env', name: credentialRef};
    }

    if (typeof credentialRef === 'object' && !Array.isArray(credentialRef)) {
        return credentialRef;
    }

    throw createGitMirrorError(
        'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
        'GitMirror credentialRef must be a string, object, or omitted for local mirrors'
    );
}

/**
 * @summary Quotes one shell token for `GIT_SSH_COMMAND`.
 * @param {String} value Shell token.
 * @returns {String}
 * @private
 */
function shellQuote(value) {
    return `'${String(value).replace(/'/gu, `'\\''`)}'`;
}

/**
 * @summary Builds the transient askpass environment for HTTPS git credentials.
 * @param {Object} options
 * @param {String} options.secret Resolved credential material.
 * @param {String} [options.username='x-access-token'] Git username returned by askpass.
 * @returns {Promise<{env: Object, secretHints: String[], cleanup: Function}>}
 * @private
 */
async function createAskPassCredentialEnvironment({secret, username = 'x-access-token'} = {}) {
    const askPassDir  = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-gitmirror-askpass-'));
    const askPassPath = path.join(askPassDir, 'askpass.sh');
    const gitUsername = username || 'x-access-token';

    await fs.writeFile(askPassPath, ASKPASS_SCRIPT, {mode: 0o700});

    return {
        env: {
            GIT_ASKPASS           : askPassPath,
            NEO_GITMIRROR_PASSWORD: secret,
            NEO_GITMIRROR_USERNAME: gitUsername
        },
        secretHints: [secret],
        cleanup    : () => fs.remove(askPassDir)
    };
}

/**
 * @summary Resolves transient git credential environment overrides.
 * @param {Object} options
 * @param {String|Object|null} options.credentialRef Durable credential reference.
 * @returns {Promise<{env: Object, secretHints: String[], cleanup: Function}>}
 * @private
 */
async function resolveCredentialEnvironment({credentialRef} = {}) {
    const ref = normalizeCredentialRef(credentialRef);

    if (!ref || ref.type === 'none') {
        return {env: {}, secretHints: [], cleanup: async () => {}};
    }

    if (ref.type === 'env') {
        const name   = ref.name;
        const secret = process.env[name];

        if (!name || !secret) {
            throw createGitMirrorError(
                'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
                'GitMirror env credentialRef could not be resolved'
            );
        }

        return createAskPassCredentialEnvironment({secret, username: ref.username});
    }

    if (ref.type === 'file') {
        if (!ref.filePath) {
            throw createGitMirrorError(
                'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
                'GitMirror file credentialRef requires filePath'
            );
        }

        let secret;

        try {
            secret = (await fs.readFile(ref.filePath, 'utf-8')).trim();
        } catch (error) {
            throw createGitMirrorError(
                'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
                'GitMirror file credentialRef could not be resolved',
                {cause: error}
            );
        }

        if (!secret) {
            throw createGitMirrorError(
                'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
                'GitMirror file credentialRef resolved to empty secret'
            );
        }

        return createAskPassCredentialEnvironment({secret, username: ref.username});
    }

    if (ref.type === 'ssh') {
        if (!ref.keyPath) {
            throw createGitMirrorError(
                'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
                'GitMirror ssh credentialRef requires keyPath'
            );
        }

        return {
            env: {
                GIT_SSH_COMMAND: [
                    'ssh',
                    '-i',
                    shellQuote(ref.keyPath),
                    '-o',
                    'IdentitiesOnly=yes',
                    '-o',
                    'StrictHostKeyChecking=accept-new'
                ].join(' ')
            },
            secretHints: [],
            cleanup    : async () => {}
        };
    }

    throw createGitMirrorError(
        'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
        `GitMirror unsupported credentialRef type: ${ref.type}`
    );
}

/**
 * @summary Runs git with redacted error reporting.
 * @param {String[]} args Git arguments.
 * @param {Object} options={}
 * @returns {Promise<{exitCode: Number, stdout: String, stderr: String}>}
 * @private
 */
async function runGit(args, {
    acceptedExitCodes = [0],
    cwd,
    credentialRef,
    failureCode = 'KB_GITMIRROR_GIT_FAILED',
    failureMessage = 'GitMirror git command failed'
} = {}) {
    const credential = await resolveCredentialEnvironment({credentialRef});

    try {
        const result = await new Promise((resolve, reject) => {
            const child = spawn('git', args, {
                cwd,
                env  : createGitEnv(credential.env),
                stdio: ['ignore', 'pipe', 'pipe']
            });
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', data => {
                stdout += data;
            });

            child.stderr.on('data', data => {
                stderr += data;
            });

            child.on('error', reject);
            child.on('close', exitCode => resolve({exitCode, stdout, stderr}));
        });

        if (!acceptedExitCodes.includes(result.exitCode)) {
            throw createGitMirrorError(failureCode, failureMessage, {
                ...result,
                secretHints: credential.secretHints
            });
        }

        return {
            exitCode: result.exitCode,
            stdout  : redactTenantRepoSecrets(result.stdout, {secretHints: credential.secretHints}),
            stderr  : redactTenantRepoSecrets(result.stderr, {secretHints: credential.secretHints})
        };
    } catch (error) {
        if (error.code?.startsWith?.('KB_GITMIRROR_')) {
            throw error;
        }

        throw createGitMirrorError(failureCode, failureMessage, {
            cause      : error,
            secretHints: credential.secretHints
        });
    } finally {
        await credential.cleanup();
    }
}

/**
 * @summary Derives and validates the mirror path contract.
 * @param {Object} options
 * @returns {String}
 * @private
 */
function getMirrorPath({mirrorRoot, tenantId, repoSlug} = {}) {
    try {
        return deriveTenantRepoMirrorPath({mirrorRoot, tenantId, repoSlug});
    } catch (error) {
        throw createGitMirrorError(
            'KB_GITMIRROR_MIRROR_PATH_INVALID',
            error.message,
            {cause: error}
        );
    }
}

/**
 * @summary Returns true when a directory is a usable git mirror.
 * @param {String} mirrorPath Local mirror path.
 * @returns {Promise<Boolean>}
 * @private
 */
async function isUsableMirror(mirrorPath) {
    if (!await fs.pathExists(mirrorPath)) {
        return false;
    }

    const stat = await fs.stat(mirrorPath);

    if (!stat.isDirectory()) {
        throw createGitMirrorError(
            'KB_GITMIRROR_MIRROR_PATH_INVALID',
            'GitMirror path exists but is not a directory'
        );
    }

    const result = await runGit(['rev-parse', '--git-dir'], {
        acceptedExitCodes: [0, 128],
        cwd              : mirrorPath,
        failureCode      : 'KB_GITMIRROR_MIRROR_PATH_INVALID',
        failureMessage   : 'GitMirror path validation failed'
    });

    if (result.exitCode === 0) {
        return true;
    }

    throw createGitMirrorError(
        'KB_GITMIRROR_MIRROR_PATH_INVALID',
        'GitMirror path exists but is not a git repository',
        result
    );
}

/**
 * @summary Lists git refs for fetch-change detection.
 * @param {String} mirrorPath Local mirror path.
 * @returns {Promise<Map<String, String>>}
 * @private
 */
async function listRefs(mirrorPath) {
    const result = await runGit(['for-each-ref', '--format=%(refname) %(objectname)'], {
        cwd           : mirrorPath,
        failureCode   : 'KB_GITMIRROR_FETCH_FAILED',
        failureMessage: 'GitMirror failed to inspect refs'
    });
    const refs = new Map();

    for (const line of result.stdout.split('\n')) {
        if (!line.trim()) continue;

        const [ref, objectId] = line.trim().split(/\s+/u);
        refs.set(ref, objectId);
    }

    return refs;
}

/**
 * @summary Computes changed refs between two ref maps.
 * @param {Map<String, String>} before Refs before fetch.
 * @param {Map<String, String>} after Refs after fetch.
 * @returns {Object[]}
 * @private
 */
function getChangedRefs(before, after) {
    const changed = [];

    for (const [ref, objectId] of after) {
        if (before.get(ref) !== objectId) {
            changed.push({
                ref,
                before: before.get(ref) || null,
                after : objectId
            });
        }
    }

    return changed;
}

/**
 * @summary Clones a tenant repository as a persistent bare mirror if absent.
 * @param {Object} options
 * @returns {Promise<{mirrorPath: String, cloned: Boolean}>}
 */
export async function cloneIfMissing({mirrorRoot, tenantId, repoSlug, cloneUrl, credentialRef} = {}) {
    const mirrorPath = getMirrorPath({mirrorRoot, tenantId, repoSlug});

    if (await isUsableMirror(mirrorPath)) {
        return {mirrorPath, cloned: false};
    }

    let cleanCloneUrl;

    try {
        cleanCloneUrl = assertCleanCloneUrl(cloneUrl);
    } catch (error) {
        throw createGitMirrorError(
            'KB_GITMIRROR_CLONE_FAILED',
            error.message,
            {cause: error}
        );
    }

    await fs.ensureDir(path.dirname(mirrorPath));
    await runGit(['clone', '--mirror', cleanCloneUrl, mirrorPath], {
        credentialRef,
        failureCode   : 'KB_GITMIRROR_CLONE_FAILED',
        failureMessage: 'GitMirror clone failed'
    });

    return {mirrorPath, cloned: true};
}

/**
 * @summary Fetches all refs in an existing tenant repo mirror.
 * @param {Object} options
 * @returns {Promise<{fetchedAt: String, mirrorPath: String, newRevisions: Object[]}>}
 */
export async function fetch({mirrorRoot, tenantId, repoSlug, credentialRef} = {}) {
    const mirrorPath = getMirrorPath({mirrorRoot, tenantId, repoSlug});

    await isUsableMirror(mirrorPath);

    const before = await listRefs(mirrorPath);

    await runGit(['fetch', '--all', '--prune'], {
        cwd           : mirrorPath,
        credentialRef,
        failureCode   : 'KB_GITMIRROR_FETCH_FAILED',
        failureMessage: 'GitMirror fetch failed'
    });

    const after = await listRefs(mirrorPath);

    return {
        fetchedAt   : new Date().toISOString(),
        mirrorPath,
        newRevisions: getChangedRefs(before, after)
    };
}

/**
 * @summary Resolves a ref to a full commit SHA inside the mirror.
 * @param {Object} options
 * @returns {Promise<String>}
 */
export async function resolveHead({mirrorRoot, tenantId, repoSlug, ref = 'HEAD'} = {}) {
    const mirrorPath = getMirrorPath({mirrorRoot, tenantId, repoSlug});

    await isUsableMirror(mirrorPath);

    try {
        const result = await runGit(['rev-parse', '--verify', `${ref}^{commit}`], {
            cwd           : mirrorPath,
            failureCode   : 'KB_GITMIRROR_REF_NOT_FOUND',
            failureMessage: 'GitMirror ref not found'
        });

        return result.stdout.trim();
    } catch (error) {
        if (error.code === 'KB_GITMIRROR_REF_NOT_FOUND') {
            throw error;
        }

        throw createGitMirrorError(
            'KB_GITMIRROR_REF_NOT_FOUND',
            'GitMirror ref not found',
            {cause: error}
        );
    }
}

/**
 * @summary Returns whether `ancestor` is reachable from `descendant`.
 * @param {Object} options
 * @returns {Promise<Boolean>}
 */
export async function isAncestor({mirrorRoot, tenantId, repoSlug, ancestor, descendant} = {}) {
    const mirrorPath = getMirrorPath({mirrorRoot, tenantId, repoSlug});

    await isUsableMirror(mirrorPath);

    const result = await runGit(['merge-base', '--is-ancestor', ancestor, descendant], {
        acceptedExitCodes: [0, 1],
        cwd              : mirrorPath,
        failureCode      : 'KB_GITMIRROR_REF_NOT_FOUND',
        failureMessage   : 'GitMirror ancestry check failed'
    });

    return result.exitCode === 0;
}

/**
 * @summary Returns changed and deleted repo-relative paths between revisions.
 * @param {Object} options
 * @returns {Promise<{addedOrChanged: String[], deleted: String[]}>}
 */
export async function diffRevisions({mirrorRoot, tenantId, repoSlug, baseRevision, headRevision} = {}) {
    const mirrorPath = getMirrorPath({mirrorRoot, tenantId, repoSlug});

    await isUsableMirror(mirrorPath);

    const result = await runGit(['diff', '--name-status', '-z', '-M', baseRevision, headRevision], {
        cwd           : mirrorPath,
        failureCode   : 'KB_GITMIRROR_DIFF_FAILED',
        failureMessage: 'GitMirror revision diff failed'
    });
    const parts          = result.stdout.split('\0').filter(Boolean);
    const addedOrChanged = new Set();
    const deleted        = new Set();

    for (let i = 0; i < parts.length;) {
        const status = parts[i++];

        if (status.startsWith('R')) {
            const oldFile = parts[i++],
                  newFile = parts[i++];

            if (oldFile) deleted.add(oldFile);
            if (newFile) addedOrChanged.add(newFile);
            continue;
        }

        if (status.startsWith('C')) {
            i++;

            const newFile = parts[i++];

            if (newFile) addedOrChanged.add(newFile);
            continue;
        }

        const file = parts[i++];

        if (!file) continue;

        if (status.startsWith('D')) {
            deleted.add(file);
        } else {
            addedOrChanged.add(file);
        }
    }

    return {
        addedOrChanged: Array.from(addedOrChanged),
        deleted       : Array.from(deleted)
    };
}

const GitMirror = {
    cloneIfMissing,
    diffRevisions,
    fetch,
    isAncestor,
    resolveHead
};

export default GitMirror;
