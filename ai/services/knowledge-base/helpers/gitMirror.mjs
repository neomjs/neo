import {spawn}                    from 'child_process';
import {createHmac, randomBytes}  from 'node:crypto';
import {constants as fsConstants} from 'node:fs';
import fs                         from 'fs-extra';
import os                         from 'os';
import path                       from 'path';

import {
    assertCleanCloneUrl,
    classifyTenantRepoAccessFailure,
    deriveTenantRepoMirrorPath,
    normalizeTenantRepoCredentialRef,
    redactTenantRepoSecrets,
    TenantRepoAccessCode,
    TenantRepoAccessStatus
} from './tenantRepoAccessContract.mjs';

export {
    TenantRepoAccessCode,
    TenantRepoAccessStatus
} from './tenantRepoAccessContract.mjs';

/**
 * @summary Git-backed persistent mirror primitive for server-side tenant repo ingestion.
 *
 * `GitMirror` owns only the low-level mirror lifecycle: clone-if-missing,
 * fetch, ref resolution, ancestry checks, and revision diffs. It deliberately consumes
 * the clean repo-access helpers instead of deriving paths or persisting
 * credential material itself. Higher-level `tenant-repo-sync` cadence and
 * `ingestSourceFiles()` envelope construction remain owned by sibling services.
 *
 * @see https://github.com/neomjs/neo/issues/11788
 * @see https://github.com/neomjs/neo/issues/11787
 * @see https://github.com/neomjs/neo/issues/16045
 */

const GIT_TERMINAL_PROMPT_DISABLED = '0';
const ACCESS_PROBE_TIMEOUT_MS      = 15_000;
const GIT_MAX_OUTPUT_BYTES         = 50 * 1024 * 1024;
const CREDENTIAL_FINGERPRINT_KEY   = randomBytes(32);
const ASKPASS_SCRIPT               = `#!/bin/sh
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
        const causeMessage = details.cause instanceof Error
            ? details.cause.message
            : String(details.cause);
        const cause = new Error(redactTenantRepoSecrets(causeMessage, {secretHints}));

        if (typeof details.cause.code === 'string' && /^[A-Z0-9_]+$/u.test(details.cause.code)) {
            cause.code = details.cause.code;
        }

        error.cause = cause;
    }

    return error;
}

/**
 * @summary Returns a narrow subprocess environment rooted in a disposable home directory.
 * @param {Object} options
 * @param {String} options.homePath Disposable process home.
 * @param {String} options.sshCommand Deterministic SSH command for this invocation.
 * @param {Object} [options.overrides={}] Explicit credential-mode overrides.
 * @returns {Object}
 * @private
 */
function createGitEnv({homePath, sshCommand, overrides = {}} = {}) {
    const env = {
        GIT_CONFIG_GLOBAL  : path.join(homePath, '.gitconfig'),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_SSH_COMMAND    : sshCommand,
        GIT_TERMINAL_PROMPT: GIT_TERMINAL_PROMPT_DISABLED,
        HOME               : homePath,
        USERPROFILE        : homePath,
        XDG_CONFIG_HOME    : path.join(homePath, '.config')
    };

    for (const key of ['PATH', 'TMPDIR', 'TEMP', 'SystemRoot']) {
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
 * @summary Maps the shared tenant-repo credential grammar onto GitMirror's stable error contract.
 * @param {String|Object|null} credentialRef Durable credential reference.
 * @returns {Object|null}
 * @private
 */
function normalizeGitCredentialRef(credentialRef) {
    try {
        return normalizeTenantRepoCredentialRef(credentialRef, {allowOmitted: true});
    } catch (error) {
        throw createGitMirrorError(
            'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
            'GitMirror credentialRef is invalid or unsupported',
            {cause: error}
        );
    }
}

/**
 * @summary Produces a process-local, non-persistable fingerprint for credential-change detection.
 * @param {String} type Credential type discriminator.
 * @param {String|Buffer} value Resolved credential material.
 * @returns {String}
 * @private
 */
function fingerprintCredential(type, value = '') {
    return createHmac('sha256', CREDENTIAL_FINGERPRINT_KEY)
        .update(type)
        .update('\0')
        .update(value)
        .digest('hex');
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
 * @summary Builds an SSH command that cannot consult ambient config, agents, or default identities.
 * @param {Object} options
 * @param {String} options.homePath Disposable process home.
 * @param {String} options.knownHostsPath GitMirror-owned persistent host-key ledger.
 * @param {String} [options.identityPath] Explicit `ssh:` credential key.
 * @returns {String}
 * @private
 */
function createIsolatedSshCommand({homePath, knownHostsPath, identityPath} = {}) {
    const sshDir = path.join(homePath, '.ssh');
    const tokens = [
        'ssh',
        '-F',
        shellQuote(path.join(sshDir, 'config')),
        '-o',
        'BatchMode=yes',
        '-o',
        'IdentitiesOnly=yes',
        '-o',
        'IdentityAgent=none',
        '-o',
        'IdentityFile=none',
        '-o',
        'StrictHostKeyChecking=accept-new',
        '-o',
        shellQuote(`UserKnownHostsFile=${knownHostsPath}`),
        '-o',
        'GlobalKnownHostsFile=none'
    ];

    if (identityPath) {
        tokens.push('-i', shellQuote(identityPath));
    }

    return tokens.join(' ');
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
    let askPassDir;

    try {
        askPassDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-gitmirror-askpass-'));

        const
            askPassPath = path.join(askPassDir, 'askpass.sh'),
            gitUsername = username || 'x-access-token';

        await fs.writeFile(askPassPath, ASKPASS_SCRIPT, {mode: 0o700});

        return {
            env: {
                GIT_ASKPASS           : askPassPath,
                NEO_GITMIRROR_PASSWORD: secret,
                NEO_GITMIRROR_USERNAME: gitUsername
            },
            secretHints: [secret, askPassDir],
            cleanup    : () => fs.remove(askPassDir)
        };
    } catch {
        if (askPassDir) {
            try {
                await fs.remove(askPassDir);
            } catch {}
        }

        throw createGitMirrorError(
            'KB_GITMIRROR_ENVIRONMENT_FAILED',
            'GitMirror failed to prepare its isolated credential environment',
            {secretHints: [secret, askPassDir]}
        )
    }
}

/**
 * @summary Resolves and validates credential material without exposing it to callers.
 *
 * The returned fingerprint is keyed with process-local entropy. It can compare two
 * resolutions within this process, but cannot be persisted or reused to test a secret
 * outside the running orchestrator.
 *
 * @param {Object} options
 * @param {String|Object|null} options.credentialRef Durable credential reference.
 * @returns {Promise<{ref: Object|null, secret: String|undefined, cacheFingerprint: String}>}
 * @private
 */
async function resolveCredentialMaterial({credentialRef} = {}) {
    const ref = normalizeGitCredentialRef(credentialRef);

    if (!ref || ref.type === 'none') {
        return {
            ref,
            cacheFingerprint: fingerprintCredential('none')
        };
    }

    if (ref.type === 'env') {
        const name   = ref.name;
        const secret = process.env[name];

        if (typeof secret !== 'string' || secret.trim() === '') {
            throw createGitMirrorError(
                'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
                'GitMirror env credentialRef could not be resolved'
            );
        }

        return {
            ref,
            secret,
            cacheFingerprint: fingerprintCredential('env', secret)
        };
    }

    if (ref.type === 'file') {
        let secret;

        try {
            await fs.access(ref.filePath, fsConstants.R_OK);
            secret = (await fs.readFile(ref.filePath, 'utf-8')).trim();
        } catch (error) {
            throw createGitMirrorError(
                'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
                'GitMirror file credentialRef could not be resolved',
                {cause: error, secretHints: [ref.filePath]}
            );
        }

        if (!secret) {
            throw createGitMirrorError(
                'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
                'GitMirror file credentialRef resolved to empty secret'
            );
        }

        return {
            ref,
            secret,
            cacheFingerprint: fingerprintCredential('file', secret)
        };
    }

    if (ref.type === 'ssh') {
        let key;

        try {
            await fs.access(ref.keyPath, fsConstants.R_OK);
            key = await fs.readFile(ref.keyPath);
        } catch (error) {
            throw createGitMirrorError(
                'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
                'GitMirror ssh credentialRef could not be resolved',
                {cause: error, secretHints: [ref.keyPath]}
            );
        }

        if (key.toString('utf-8').trim() === '') {
            throw createGitMirrorError(
                'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
                'GitMirror ssh credentialRef resolved to an empty key'
            );
        }

        return {
            ref,
            cacheFingerprint: fingerprintCredential('ssh', key)
        };
    }

    throw createGitMirrorError(
        'KB_GITMIRROR_CREDENTIAL_REF_INVALID',
        `GitMirror unsupported credentialRef type: ${ref.type}`
    );
}

/**
 * @summary Builds transient Git environment overrides from already-validated credential material.
 * @param {Object} material Resolved credential material.
 * @param {Object} options
 * @param {String} options.homePath Disposable process home.
 * @param {String} options.knownHostsPath GitMirror-owned persistent host-key ledger.
 * @returns {Promise<{env: Object, secretHints: String[], cleanup: Function}>}
 * @private
 */
async function createCredentialEnvironment(material, {homePath, knownHostsPath} = {}) {
    const {ref, secret} = material;

    if (!ref || ref.type === 'none') {
        return {env: {}, secretHints: [], cleanup: async () => {}};
    }

    if (ref.type === 'env' || ref.type === 'file') {
        return createAskPassCredentialEnvironment({secret, username: ref.username});
    }

    return {
        env: {
            GIT_SSH_COMMAND: createIsolatedSshCommand({
                homePath,
                knownHostsPath,
                identityPath: ref.keyPath
            })
        },
        secretHints: [ref.keyPath],
        cleanup    : async () => {}
    };
}

/**
 * @summary Creates and later removes one fully isolated Git subprocess environment.
 * @param {Object} material Resolved credential material.
 * @param {Object} options={}
 * @param {String} [options.knownHostsPath] Durable GitMirror-owned host-key ledger.
 * @returns {Promise<{env: Object, secretHints: String[], cleanup: Function}>}
 * @private
 */
async function createGitExecutionEnvironment(material, {knownHostsPath} = {}) {
    let homePath;
    let credential;

    try {
        homePath = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-gitmirror-home-'));

        const
            sshDir                  = path.join(homePath, '.ssh'),
            effectiveKnownHostsPath = knownHostsPath || path.join(sshDir, 'known_hosts');

        await fs.ensureDir(sshDir);
        await fs.ensureDir(path.dirname(effectiveKnownHostsPath));
        await Promise.all([
            fs.writeFile(path.join(homePath, '.gitconfig'), ''),
            fs.writeFile(path.join(sshDir, 'config'), ''),
            fs.ensureFile(effectiveKnownHostsPath)
        ]);
        await fs.chmod(effectiveKnownHostsPath, 0o600);

        credential = await createCredentialEnvironment(material, {
            homePath,
            knownHostsPath: effectiveKnownHostsPath
        });

        return {
            env: createGitEnv({
                homePath,
                sshCommand: createIsolatedSshCommand({
                    homePath,
                    knownHostsPath: effectiveKnownHostsPath
                }),
                overrides : credential.env
            }),
            secretHints: [
                ...credential.secretHints,
                homePath,
                ...(knownHostsPath ? [knownHostsPath] : [])
            ],
            cleanup    : async () => {
                const results = await Promise.allSettled([
                    Promise.resolve().then(() => credential.cleanup()),
                    Promise.resolve().then(() => fs.remove(homePath))
                ]);

                if (results.some(result => result.status === 'rejected')) {
                    throw createGitMirrorError(
                        'KB_GITMIRROR_CLEANUP_FAILED',
                        'GitMirror failed to remove its isolated subprocess environment'
                    )
                }
            }
        };
    } catch (error) {
        try {
            await credential?.cleanup?.();
        } catch {}

        if (homePath) {
            try {
                await fs.remove(homePath);
            } catch {}
        }

        if (error.code?.startsWith?.('KB_GITMIRROR_')) {
            throw error
        }

        throw createGitMirrorError(
            'KB_GITMIRROR_ENVIRONMENT_FAILED',
            'GitMirror failed to prepare its isolated subprocess environment',
            {
                secretHints: [
                    homePath,
                    knownHostsPath,
                    material?.ref?.filePath,
                    material?.ref?.keyPath
                ]
            }
        )
    }
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
    credentialMaterial,
    failureCode = 'KB_GITMIRROR_GIT_FAILED',
    failureMessage = 'GitMirror git command failed',
    knownHostsPath,
    maxOutputBytes = GIT_MAX_OUTPUT_BYTES,
    outputLimitCode = 'KB_GITMIRROR_OUTPUT_LIMIT',
    outputLimitMessage = 'GitMirror git command exceeded its output limit',
    timeoutCode = 'KB_GITMIRROR_GIT_TIMEOUT',
    timeoutMessage = 'GitMirror git command timed out',
    timeoutMs = 0
} = {}) {
    let execution;
    let primaryError;

    try {
        const material = credentialMaterial || await resolveCredentialMaterial({credentialRef});

        execution = await createGitExecutionEnvironment(material, {knownHostsPath});

        const result = await new Promise((resolve, reject) => {
            const child = spawn('git', ['-c', 'credential.helper=', ...args], {
                cwd,
                env  : execution.env,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            let stdout = '';
            let stderr = '';
            let outputBytes = 0;
            let settled = false;
            let timeoutId;

            const settle = callback => value => {
                if (settled) {
                    return;
                }

                settled = true;

                if (timeoutId) {
                    clearTimeout(timeoutId);
                }

                callback(value);
            };
            const resolveOnce = settle(resolve);
            const rejectOnce  = settle(reject);
            const appendOutput = (current, data) => {
                const nextBytes = Buffer.byteLength(data);

                if (
                    Number.isFinite(maxOutputBytes)
                    && maxOutputBytes > 0
                    && outputBytes + nextBytes > maxOutputBytes
                ) {
                    try {
                        child.kill('SIGKILL');
                    } catch {}

                    rejectOnce(createGitMirrorError(outputLimitCode, outputLimitMessage, {
                        secretHints: execution.secretHints
                    }));

                    return current;
                }

                outputBytes += nextBytes;

                return current + data;
            };

            child.stdout.on('data', data => {
                if (!settled) {
                    stdout = appendOutput(stdout, data);
                }
            });

            child.stderr.on('data', data => {
                if (!settled) {
                    stderr = appendOutput(stderr, data);
                }
            });

            child.on('error', rejectOnce);
            child.on('close', exitCode => resolveOnce({exitCode, stdout, stderr}));

            if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
                timeoutId = setTimeout(() => {
                    try {
                        child.kill('SIGKILL');
                    } catch {}

                    rejectOnce(createGitMirrorError(timeoutCode, timeoutMessage, {
                        secretHints: execution.secretHints
                    }));
                }, timeoutMs);
            }
        });

        if (!acceptedExitCodes.includes(result.exitCode)) {
            throw createGitMirrorError(failureCode, failureMessage, {
                ...result,
                secretHints: execution.secretHints
            });
        }

        return {
            exitCode: result.exitCode,
            stdout  : redactTenantRepoSecrets(result.stdout, {secretHints: execution.secretHints}),
            stderr  : redactTenantRepoSecrets(result.stderr, {secretHints: execution.secretHints})
        };
    } catch (error) {
        primaryError = error.code?.startsWith?.('KB_GITMIRROR_')
            ? error
            : createGitMirrorError(failureCode, failureMessage, {
                cause      : error,
                secretHints: execution?.secretHints || []
            });

        throw primaryError
    } finally {
        if (execution) {
            try {
                await execution.cleanup();
            } catch (cleanupError) {
                if (!primaryError) {
                    throw cleanupError.code?.startsWith?.('KB_GITMIRROR_')
                        ? cleanupError
                        : createGitMirrorError(
                            'KB_GITMIRROR_CLEANUP_FAILED',
                            'GitMirror failed to remove its isolated subprocess environment'
                        )
                }
            }
        }
    }
}


/**
 * @summary Validates local credential resolution and returns only a process-local cache fingerprint.
 *
 * No credential reference, path, environment-variable name, username, or secret is
 * returned. Callers may compare `cacheFingerprint` only inside the current process;
 * the HMAC key is random per process and deliberately unavailable.
 *
 * @param {Object} options
 * @param {String|Object|null} options.credentialRef Durable credential reference.
 * @returns {Promise<{status: String, code: String, cacheFingerprint: String|null}>}
 */
export async function inspectCredentialReadiness({credentialRef} = {}) {
    try {
        const material = await resolveCredentialMaterial({credentialRef});

        return {
            status          : TenantRepoAccessStatus.READY,
            code            : TenantRepoAccessCode.CREDENTIAL_RESOLVED,
            cacheFingerprint: material.cacheFingerprint
        };
    } catch {
        return {
            status          : TenantRepoAccessStatus.DEGRADED,
            code            : TenantRepoAccessCode.CREDENTIAL_INVALID,
            cacheFingerprint: null
        };
    }
}

/**
 * @summary Performs a bounded, read-only capability probe for one repository and ref.
 *
 * The probe uses `git ls-remote --exit-code` through the same credential, askpass,
 * SSH, redaction, and subprocess boundary as clone/fetch. Its output is categorical:
 * raw Git stdout/stderr and credential metadata never cross this function.
 *
 * @param {Object} options
 * @param {String} options.cloneUrl Clean repository URL.
 * @param {String|Object|null} options.credentialRef Durable credential reference.
 * @param {String} [options.ref='HEAD'] Configured branch, tag, or ref.
 * @param {String} [options.mirrorRoot] Durable mirror root for SSH host-key continuity.
 * @param {Number} [options.timeoutMs=15000] Positive subprocess deadline.
 * @returns {Promise<{status: String, code: String, checkedAt: String, cacheFingerprint: String|null}>}
 */
export async function probeRemoteAccess({
    cloneUrl,
    credentialRef,
    ref = 'HEAD',
    mirrorRoot,
    timeoutMs = ACCESS_PROBE_TIMEOUT_MS
} = {}) {
    const checkedAt = new Date().toISOString();
    let   cleanCloneUrl,
          material;

    try {
        cleanCloneUrl = assertCleanCloneUrl(cloneUrl);
    } catch {
        return {
            status          : TenantRepoAccessStatus.DEGRADED,
            code            : TenantRepoAccessCode.PROBE_FAILED,
            checkedAt,
            cacheFingerprint: null
        };
    }

    try {
        material = await resolveCredentialMaterial({credentialRef});
    } catch {
        return {
            status          : TenantRepoAccessStatus.DEGRADED,
            code            : TenantRepoAccessCode.CREDENTIAL_INVALID,
            checkedAt,
            cacheFingerprint: null
        };
    }

    const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : ACCESS_PROBE_TIMEOUT_MS;

    try {
        const
            rawRevision = typeof ref === 'string' && /^[a-f0-9]{7,64}$/iu.test(ref),
            args        = ['ls-remote', '--exit-code', cleanCloneUrl];

        if (!rawRevision) {
            args.push(ref);
        }

        const result = await runGit(args, {
            acceptedExitCodes: [0, 2],
            credentialMaterial: material,
            failureCode      : 'KB_GITMIRROR_ACCESS_PROBE_FAILED',
            failureMessage   : 'GitMirror repository access probe failed',
            ...(mirrorRoot ? {knownHostsPath: getKnownHostsPath(mirrorRoot)} : {}),
            timeoutCode      : 'KB_GITMIRROR_ACCESS_PROBE_TIMEOUT',
            timeoutMessage   : 'GitMirror repository access probe timed out',
            timeoutMs        : effectiveTimeoutMs
        });

        const advertisedRefs = rawRevision && result.exitCode === 0
            ? result.stdout
                .split('\n')
                .map(line => line.trim().split(/\s+/u))
                .filter(([revision, refName]) => revision && refName)
            : [];
        const advertisedRevision = advertisedRefs
            .some(([revision]) => revision.toLowerCase().startsWith(ref.toLowerCase()));
        const advertisedNamedRef = advertisedRefs
            .some(([, refName]) => [
                ref,
                `refs/heads/${ref}`,
                `refs/tags/${ref}`
            ].includes(refName));

        if (rawRevision && !advertisedRevision && !advertisedNamedRef) {
            return {
                status          : TenantRepoAccessStatus.UNKNOWN,
                code            : TenantRepoAccessCode.REF_UNVERIFIED,
                checkedAt,
                cacheFingerprint: material.cacheFingerprint
            };
        }

        return {
            status: result.exitCode === 0
                ? TenantRepoAccessStatus.READY
                : TenantRepoAccessStatus.DEGRADED,
            code: result.exitCode === 0
                ? TenantRepoAccessCode.READY
                : TenantRepoAccessCode.REF_NOT_FOUND,
            checkedAt,
            cacheFingerprint: material.cacheFingerprint
        };
    } catch (error) {
        return {
            status          : TenantRepoAccessStatus.DEGRADED,
            code            : classifyTenantRepoAccessFailure(error),
            checkedAt,
            cacheFingerprint: material.cacheFingerprint
        };
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
 * @summary Returns the durable GitMirror-owned SSH host-key ledger beside mirror data.
 * @param {String} mirrorRoot Root directory for tenant repo mirrors.
 * @returns {String}
 * @private
 */
function getKnownHostsPath(mirrorRoot) {
    return path.join(path.resolve(mirrorRoot), '.gitmirror-ssh', 'known_hosts');
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
        failureMessage: 'GitMirror clone failed',
        knownHostsPath: getKnownHostsPath(mirrorRoot)
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
        failureMessage: 'GitMirror fetch failed',
        knownHostsPath: getKnownHostsPath(mirrorRoot)
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

/**
 * @summary Lists all repo-relative paths present at one mirror revision.
 * @param {Object} options
 * @param {String} options.mirrorRoot Root directory for tenant repo mirrors.
 * @param {String} options.tenantId Tenant id.
 * @param {String} options.repoSlug Repository slug.
 * @param {String} options.revision Resolved revision.
 * @returns {Promise<Array<String>>}
 */
export async function listRevisionPaths({mirrorRoot, tenantId, repoSlug, revision} = {}) {
    const mirrorPath = getMirrorPath({mirrorRoot, tenantId, repoSlug});

    const result = await runGit(['ls-tree', '-r', '-z', '--name-only', revision], {
        cwd           : mirrorPath,
        failureCode   : 'KB_GITMIRROR_LIST_FAILED',
        failureMessage: 'GitMirror failed to list revision paths'
    });

    return result.stdout.split('\0').filter(Boolean).sort();
}

/**
 * @summary Reads one text file from a mirror revision.
 * @param {Object} options
 * @param {String} options.mirrorRoot Root directory for tenant repo mirrors.
 * @param {String} options.tenantId Tenant id.
 * @param {String} options.repoSlug Repository slug.
 * @param {String} options.revision Resolved revision.
 * @param {String} options.sourcePath Repo-relative source path.
 * @returns {Promise<String>}
 */
export async function readRevisionFile({mirrorRoot, tenantId, repoSlug, revision, sourcePath} = {}) {
    if (!sourcePath || sourcePath.includes('\0')) {
        throw createGitMirrorError(
            'KB_GITMIRROR_PATH_INVALID',
            'GitMirror received an invalid sourcePath'
        );
    }

    const mirrorPath = getMirrorPath({mirrorRoot, tenantId, repoSlug});

    const result = await runGit(['show', `${revision}:${sourcePath}`], {
        cwd           : mirrorPath,
        failureCode   : 'KB_GITMIRROR_FILE_READ_FAILED',
        failureMessage: 'GitMirror failed to read a revision file'
    });

    return result.stdout;
}

const GitMirror = {
    cloneIfMissing,
    diffRevisions,
    fetch,
    inspectCredentialReadiness,
    isAncestor,
    listRevisionPaths,
    probeRemoteAccess,
    readRevisionFile,
    resolveHead
};

export default GitMirror;
