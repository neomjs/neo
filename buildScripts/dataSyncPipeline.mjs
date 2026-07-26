#!/usr/bin/env node

import {spawn}                from 'node:child_process';
import path                   from 'node:path';
import process                from 'node:process';
import {fileURLToPath}        from 'node:url';
import {assertDataSyncAccess} from './dataSyncPreflight.mjs';

/**
 * @module buildScripts.dataSyncPipeline
 * @summary Runs the scheduled Data Sync emission from a verified `dev` head and
 * publishes one allowlisted generated-data commit without rebasing.
 *
 * A concurrent `dev` advance invalidates the entire emission attempt. The
 * ephemeral Actions checkout is reset to the new remote authority and the full
 * pipeline is rerun once; a second advance fails cleanly after another reset.
 */

export const GENERATED_DATA_PATHS = [
    ':(glob)apps/devindex/resources/data/*.json*',
    'apps/portal/resources/data',
    'apps/portal/sitemap.xml',
    'apps/portal/llms.txt'
];

const
    commitMessage    = 'chore(data): Hourly data sync pipeline update [skip ci]',
    remoteDevRef     = 'refs/remotes/origin/dev',
    emissionCommands = [
        {
            args      : ['ci'],
            command   : 'npm',
            label     : 'install dependencies',
            tokenScope: 'none'
        },
        {
            args      : ['run', 'devindex:optin'],
            command   : 'npm',
            label     : 'DevIndex Opt-In',
            tokenScope: 'intake'
        },
        {
            args      : ['run', 'devindex:optout'],
            command   : 'npm',
            label     : 'DevIndex Opt-Out',
            tokenScope: 'intake'
        },
        {
            args      : ['run', 'devindex:spider', '--', '--strategy', 'random'],
            command   : 'npm',
            label     : 'DevIndex Spider',
            tokenScope: 'intake'
        },
        {
            args      : ['run', 'devindex:update', '--', '--limit=200'],
            command   : 'npm',
            label     : 'DevIndex Updater',
            tokenScope: 'intake'
        },
        {
            args      : ['./buildScripts/docs/rebuildContentIndexesAndSeo.mjs', '--include-labels'],
            command   : process.execPath,
            label     : 'content indexes and SEO',
            tokenScope: 'none'
        }
    ];

/**
 * @summary Builds the child environment for one emission stage, carrying exactly the credential
 * that stage is entitled to and nothing else.
 *
 * The pipeline holds two identities with different authority: an INTAKE credential that may read
 * and comment on the DevIndex opt-in/opt-out repositories, and a PUBLISHER credential that may
 * write to this repository and bypass the code-scanning ruleset. Passing `process.env` wholesale
 * — as this runner did — handed every stage whichever token happened to be set, so the ruleset-
 * bypass identity was in scope during arbitrary data collection.
 *
 * Both token variables are STRIPPED first, then only the scoped one is re-injected as
 * `GITHUB_TOKEN` (and `GH_TOKEN`, which the DevIndex GitHub service prefers). Stripping is the
 * load-bearing half: without it a stage marked `none` would silently inherit whatever the parent
 * process carried, which is the exact leak the scope annotation claims to prevent.
 *
 * `tokenScope: 'none'` therefore yields a child with NO GitHub credential. A stage that turns out
 * to need one fails loudly on its own missing-auth path rather than quietly succeeding on a more
 * privileged identity than it was granted.
 *
 * @param {String} tokenScope One of `intake`, `publisher`, `none`.
 * @param {Object} [env=process.env] Parent environment.
 * @returns {Object} A copy carrying at most one GitHub credential.
 */
export function scopedStageEnv(tokenScope, env = process.env) {
    // Fail closed VISIBLY on an unrecognised scope. `undefined` previously fell through to the
    // `none` branch, so a stage added without a `tokenScope` silently ran credential-less — which
    // either fails somewhere confusing or, worse, looks deliberate. A spec comment claimed this
    // made omission visible; it did not, because nothing distinguished "declared none" from
    // "forgot to declare".
    if (!['intake', 'publisher', 'none'].includes(tokenScope)) {
        throw new Error(
            `dataSyncPipeline: emission stage declares tokenScope=${JSON.stringify(tokenScope)}. ` +
            'Every stage must declare one of `intake`, `publisher` or `none` — an undeclared scope ' +
            'is an unanswered question about which identity that stage is entitled to, not a default.'
        );
    }

    const
        // The SOURCE variables are stripped alongside the consumed ones. Removing only
        // GH_TOKEN/GITHUB_TOKEN leaves `DATA_SYNC_PUBLISHER_TOKEN` readable in an intake stage's
        // environment, so the bypass credential stays one `process.env` lookup away from every
        // data-collection child — the isolation would be nominal, not real.
        {GH_TOKEN, GITHUB_TOKEN, DATA_SYNC_INTAKE_TOKEN, DATA_SYNC_PUBLISHER_TOKEN, ...rest} = env,
        token = tokenScope === 'intake'    ? DATA_SYNC_INTAKE_TOKEN
              : tokenScope === 'publisher' ? DATA_SYNC_PUBLISHER_TOKEN
              : null;

    if (!token) {
        return rest
    }

    return {...rest, GH_TOKEN: token, GITHUB_TOKEN: token}
}

/**
 * @summary Runs one child process with argv-array isolation and optional output capture.
 * @param {String}   command Executable name or path.
 * @param {String[]} args Executable arguments.
 * @param {Object}   [options]
 * @param {Boolean}  [options.capture=false] Capture stdout/stderr instead of inheriting them.
 * @param {String}   [options.cwd=process.cwd()] Child working directory.
 * @param {Object}   [options.env=process.env] Child environment.
 * @returns {Promise<{stderr: String, stdout: String}>}
 */
export function executeCommand(command, args, {
    capture = false,
    cwd     = process.cwd(),
    env     = process.env
} = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env,
            stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
        });
        let stderr = '',
            stdout = '';

        if (capture) {
            child.stdout.on('data', chunk => {
                stdout += chunk
            });
            child.stderr.on('data', chunk => {
                stderr += chunk
            })
        }

        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) {
                resolve({stderr, stdout});
                return
            }

            const detail = stderr.trim();
            const error  = new Error(
                `${command} ${args.join(' ')} exited with code ${code}${detail ? `: ${detail}` : ''}`
            );

            error.code   = code;
            error.stderr = stderr;
            error.stdout = stdout;
            reject(error)
        })
    })
}

/**
 * @summary Identifies paths admitted to the generated Data Sync publication commit.
 * @param {String} filePath Repository-relative path.
 * @returns {Boolean}
 */
export function isGeneratedDataPath(filePath) {
    return /^apps\/devindex\/resources\/data\/[^/]+\.json.*$/u.test(filePath)
        || filePath === 'apps/portal/sitemap.xml'
        || filePath === 'apps/portal/llms.txt'
        || filePath.startsWith('apps/portal/resources/data/')
}

/**
 * @summary Executes one git argv sequence through the injected process boundary.
 * @param {Function} execute Child-process executor.
 * @param {String}   cwd Repository root.
 * @param {String[]} args Git arguments.
 * @param {Object}   [options]
 * @param {Boolean}  [options.capture=true] Capture command output.
 * @param {Object}   [options.env=process.env] Command environment.
 * @returns {Promise<{stderr: String, stdout: String}>}
 */
async function git(execute, cwd, args, {capture = true, env = process.env} = {}) {
    return execute('git', args, {capture, cwd, env})
}

/**
 * @summary Runs a git command that talks to `origin`, supplying the PUBLISHER credential for that
 * one invocation instead of relying on one persisted in `.git/config`.
 *
 * `actions/checkout` defaults to `persist-credentials: true`, which writes the token into git config
 * as an `http.extraheader` for the whole job. Under that default, stripping credentials from a
 * stage's ENVIRONMENT isolates nothing at the git layer — any collection stage could still push as
 * the Publisher, the one identity permitted to bypass the code-scanning ruleset. So the checkout now
 * persists nothing, and the two commands that genuinely need network auth carry it themselves.
 *
 * `-c http.extraheader=` is passed as an ARGUMENT rather than written to config: it applies to this
 * process only and leaves nothing behind for a later stage to inherit.
 * @param {Function} execute Child-process executor.
 * @param {String}   cwd Repository root.
 * @param {String[]} args Git arguments.
 * @param {Object}   [options]
 * @returns {Promise<{stderr: String, stdout: String}>}
 */
async function gitAuthenticated(execute, cwd, args, options = {}) {
    const token = process.env.DATA_SYNC_PUBLISHER_TOKEN;

    if (!token) {
        return git(execute, cwd, args, options)
    }

    const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;

    return git(execute, cwd, ['-c', `http.extraheader=${header}`, ...args], options)
}

/**
 * @summary Reads one git revision as a normalized SHA.
 * @param {Function} execute Child-process executor.
 * @param {String}   cwd Repository root.
 * @param {String}   ref Git revision.
 * @returns {Promise<String>}
 */
async function readSha(execute, cwd, ref) {
    const {stdout} = await git(execute, cwd, ['rev-parse', ref]);

    return stdout.trim()
}

/**
 * @summary Refreshes the local `origin/dev` tracking ref and returns its SHA.
 * @param {Function} execute Child-process executor.
 * @param {String}   cwd Repository root.
 * @returns {Promise<String>}
 */
async function fetchRemoteDev(execute, cwd) {
    await gitAuthenticated(execute, cwd, ['fetch', 'origin', `dev:${remoteDevRef}`]);

    return readSha(execute, cwd, 'origin/dev')
}

/**
 * @summary Restores the ephemeral runner to a clean current `origin/dev` checkout.
 * @param {Function} execute Child-process executor.
 * @param {String}   cwd Repository root.
 * @returns {Promise<String>} Restored remote SHA.
 */
async function restoreRemoteDev(execute, cwd) {
    const remoteSha = await fetchRemoteDev(execute, cwd);

    await git(execute, cwd, ['reset', '--hard', 'origin/dev']);
    await git(execute, cwd, ['clean', '-fd', '--', ...GENERATED_DATA_PATHS]);

    return remoteSha
}

/**
 * @summary Reads the repository-relative paths currently staged for publication.
 * @param {Function} execute Child-process executor.
 * @param {String}   cwd Repository root.
 * @returns {Promise<String[]>}
 */
async function readStagedPaths(execute, cwd) {
    const {stdout} = await git(execute, cwd, ['diff', '--cached', '--name-only']);

    return stdout.trim().split('\n').map(file => file.trim()).filter(Boolean)
}

/**
 * @summary Rejects any staged path outside the generated-data publication allowlist.
 * @param {String[]} paths Repository-relative staged paths.
 * @returns {void}
 */
function assertGeneratedOnly(paths) {
    const rejected = paths.filter(filePath => !isGeneratedDataPath(filePath));

    if (rejected.length > 0) {
        throw new Error(`Data Sync staging rejected non-generated paths: ${rejected.join(', ')}`)
    }
}

/**
 * @summary Emits compact attempt/base/current freshness telemetry.
 * @param {Object}   options
 * @param {Number}   options.attempt Current attempt number.
 * @param {String}   options.baseSha Emission base SHA.
 * @param {String}   options.currentSha Current remote SHA.
 * @param {Function} options.log Telemetry sink.
 * @param {Number}   options.maxAttempts Maximum attempt count.
 * @param {String}   options.phase Freshness checkpoint name.
 * @returns {Promise<void>}
 */
async function logFreshness({attempt, baseSha, currentSha, log, maxAttempts, phase}) {
    log(
        `[DataSync] freshness phase=${phase} attempt=${attempt}/${maxAttempts} ` +
        `base=${baseSha} current=${currentSha}`
    )
}

/**
 * @summary Discards one stale emission and either prepares the retry or fails cleanly on exhaustion.
 * @param {Object}   options
 * @param {Number}   options.attempt Current attempt number.
 * @param {String}   options.baseSha Emission base SHA.
 * @param {String}   options.currentSha Current remote SHA.
 * @param {Function} options.execute Child-process executor.
 * @param {String}   options.cwd Repository root.
 * @param {Function} options.log Telemetry sink.
 * @param {Number}   options.maxAttempts Maximum attempt count.
 * @param {String}   options.phase Freshness checkpoint name.
 * @returns {Promise<void>}
 */
async function recoverStaleAttempt({
    attempt,
    baseSha,
    currentSha,
    execute,
    cwd,
    log,
    maxAttempts,
    phase
}) {
    await logFreshness({attempt, baseSha, currentSha, log, maxAttempts, phase});
    log(`[DataSync] stale-head action=discard-and-reset attempt=${attempt}/${maxAttempts}`);
    await restoreRemoteDev(execute, cwd);

    if (attempt >= maxAttempts) {
        throw new Error(
            `Data Sync stopped cleanly because dev advanced during all ${maxAttempts} emission attempts ` +
            `(last phase=${phase}, base=${baseSha}, current=${currentSha})`
        )
    }
}

/**
 * @summary Runs the complete generated-output emission sequence for one fresh-head attempt.
 * @param {Object}   options
 * @param {Number}   options.attempt Current attempt number.
 * @param {String}   options.cwd Repository root.
 * @param {Function} options.execute Child-process executor.
 * @param {Function} options.log Telemetry sink.
 * @returns {Promise<void>}
 */
export async function emitGeneratedData({
    attempt,
    cwd,
    execute   = executeCommand,
    log       = console.log,
    preflight = assertDataSyncAccess
}) {
    // Before any expensive stage: prove the intake identity can actually reach the repositories the
    // collection stages depend on. A denial here carries no retry budget and precedes all work, so
    // it is the installation answering rather than a transient read — the distinction the shared
    // message string cannot make, and the one whose absence cost sixty silent scheduled runs.
    await preflight({log, token: scopedStageEnv('intake').GITHUB_TOKEN});

    // Credential-topology check with no side effects. The collection stages mutate — OptOut comments
    // on and closes real issues — so a configuration check that must run them is one nobody repeats
    // while iterating on an installation. Stopping here keeps it cheap enough to re-run freely.
    if (process.env.DATA_SYNC_PREFLIGHT_ONLY === 'true') {
        log('[DataSync] preflight-only: repository access verified; skipping collection and publish.');
        return
    }

    for (const {args, command, label, tokenScope} of emissionCommands) {
        log(`[DataSync] emit attempt=${attempt} stage=${label} credential=${tokenScope}`);
        await execute(command, args, {cwd, env: scopedStageEnv(tokenScope)})
    }
}

/**
 * @summary Emits and publishes generated Data Sync output from a verified current `dev` head.
 *
 * Each attempt is disposable. If `origin/dev` advances after emission, after staging, or
 * immediately before a non-force push, the runner resets to the new authority and re-emits
 * once. Exhaustion always leaves the ephemeral checkout at the current remote head.
 *
 * @param {Object}   [options]
 * @param {String}   [options.cwd=process.cwd()] Repository root.
 * @param {Function} [options.emit=emitGeneratedData] Complete per-attempt emission callback.
 * @param {Function} [options.execute=executeCommand] Child-process executor.
 * @param {Function} [options.log=console.log] Compact telemetry sink.
 * @param {Number}   [options.maxAttempts=2] Maximum fresh-head emission attempts.
 * @returns {Promise<{attempts: Number, baseSha: String, changed: Boolean, pushed: Boolean}>}
 */
export async function runDataSyncPipeline({
    cwd         = process.cwd(),
    emit        = emitGeneratedData,
    execute     = executeCommand,
    log         = console.log,
    maxAttempts = 2
} = {}) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
        throw new TypeError('maxAttempts must be a positive integer')
    }

    await git(execute, cwd, ['config', 'user.name', 'github-actions[bot]']);
    await git(execute, cwd, [
        'config',
        'user.email',
        '41898282+github-actions[bot]@users.noreply.github.com'
    ]);
    await restoreRemoteDev(execute, cwd);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const baseSha = await readSha(execute, cwd, 'HEAD');

        log(`[DataSync] attempt=${attempt}/${maxAttempts} base=${baseSha}`);
        await emit({attempt, baseSha, cwd, execute, log});

        // TERMINAL, not merely quiet. Returning early from `emit` ended the emission loop and then
        // fell straight through to the publish path below, which only stayed harmless because an
        // empty emission produces no staged changes. That is a safety property borrowed from a
        // coincidence: any future change making the publish path act on an unchanged tree would
        // turn a configuration check into a publication. The check exits the pipeline here.
        if (process.env.DATA_SYNC_PREFLIGHT_ONLY === 'true') {
            return {attempts: attempt, baseSha, changed: false, preflightOnly: true, pushed: false}
        }

        let currentSha = await fetchRemoteDev(execute, cwd);

        await logFreshness({
            attempt,
            baseSha,
            currentSha,
            log,
            maxAttempts,
            phase: 'post-emission'
        });

        if (currentSha !== baseSha) {
            await recoverStaleAttempt({
                attempt,
                baseSha,
                currentSha,
                execute,
                cwd,
                log,
                maxAttempts,
                phase: 'post-emission'
            });
            continue
        }

        const {stdout: status} = await git(execute, cwd, [
            'status',
            '--porcelain',
            '--untracked-files=all',
            '--',
            ...GENERATED_DATA_PATHS
        ]);

        if (!status.trim()) {
            log(`[DataSync] publish attempt=${attempt}/${maxAttempts} result=no-generated-changes`);

            return {attempts: attempt, baseSha, changed: false, pushed: false}
        }

        await git(execute, cwd, ['add', '-A', '--', ...GENERATED_DATA_PATHS]);

        const stagedPaths = await readStagedPaths(execute, cwd);

        assertGeneratedOnly(stagedPaths);
        log(`[DataSync] staged attempt=${attempt}/${maxAttempts} files=${stagedPaths.length}`);

        currentSha = await fetchRemoteDev(execute, cwd);
        await logFreshness({
            attempt,
            baseSha,
            currentSha,
            log,
            maxAttempts,
            phase: 'post-stage'
        });

        if (currentSha !== baseSha) {
            await recoverStaleAttempt({
                attempt,
                baseSha,
                currentSha,
                execute,
                cwd,
                log,
                maxAttempts,
                phase: 'post-stage'
            });
            continue
        }

        await git(execute, cwd, ['commit', '--no-verify', '-m', commitMessage], {
            env: {...process.env, NEO_SKIP_TICKET_ARCHAEOLOGY: '1'}
        });

        currentSha = await fetchRemoteDev(execute, cwd);
        await logFreshness({
            attempt,
            baseSha,
            currentSha,
            log,
            maxAttempts,
            phase: 'pre-push'
        });

        if (currentSha !== baseSha) {
            await recoverStaleAttempt({
                attempt,
                baseSha,
                currentSha,
                execute,
                cwd,
                log,
                maxAttempts,
                phase: 'pre-push'
            });
            continue
        }

        try {
            await gitAuthenticated(execute, cwd, ['push', 'origin', 'HEAD:dev'], {capture: false})
        } catch (error) {
            currentSha = await fetchRemoteDev(execute, cwd);
            await restoreRemoteDev(execute, cwd);

            if (currentSha !== baseSha) {
                await logFreshness({
                    attempt,
                    baseSha,
                    currentSha,
                    log,
                    maxAttempts,
                    phase: 'push-rejected'
                });

                if (attempt < maxAttempts) {
                    log(`[DataSync] stale-head action=discard-and-reset attempt=${attempt}/${maxAttempts}`);
                    continue
                }

                throw new Error(
                    `Data Sync stopped cleanly because dev advanced during all ${maxAttempts} emission attempts ` +
                    `(last phase=push-rejected, base=${baseSha}, current=${currentSha})`,
                    {cause: error}
                )
            }

            throw new Error(
                `Data Sync publication failed while dev remained at ${baseSha}: ${error.message}`,
                {cause: error}
            )
        }

        log(`[DataSync] publish attempt=${attempt}/${maxAttempts} result=pushed base=${baseSha}`);

        return {attempts: attempt, baseSha, changed: true, pushed: true}
    }

    throw new Error(`Data Sync exhausted ${maxAttempts} attempts without a terminal result`)
}

const modulePath   = fileURLToPath(import.meta.url);
const cliEntryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (cliEntryPath === modulePath) {
    runDataSyncPipeline().catch(error => {
        console.error(`[DataSync] ${error.message}`);
        process.exitCode = 1
    })
}
