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

/**
 * The scope vocabulary AND the env var each scope draws from, in ONE place. Three hand-maintained
 * lists stood here — the validator's whitelist, the resolver's ternary chain, and the strip list in
 * the destructure — so adding a scope meant editing three, and a miss in the strip list is the
 * dangerous one: it leaves a credential readable in a child that was never granted it, which is
 * silent rather than loud.
 *
 * `reader` is the implicit Actions token, not an App: it reads this repository and writes nothing.
 * It exists because NO App identity can read this repo's labels — `intake` is installed only on the
 * DevIndex repos and `publisher` holds `contents`, while labels are `issues` scope. See the
 * `permissions:` block in `data-sync-pipeline.yml`.
 * @type {Object<String,String|null>}
 * @private
 */
const stageTokenSources = {
    intake   : 'DATA_SYNC_INTAKE_TOKEN',
    none     : null,
    publisher: 'DATA_SYNC_PUBLISHER_TOKEN',
    reader   : 'DATA_SYNC_READER_TOKEN'
};

/**
 * Every raw credential-source variable this pipeline can carry, DERIVED from the scope vocabulary
 * rather than restated. Both consumers read this one list: the per-stage scoping in
 * `scopedStageEnv` and the Git-child scrub in `gitAuthenticated`.
 *
 * It is one list because two hand-maintained deny-lists is exactly how a new source reaches a child
 * that was never granted it — the selection site gets the new source and the scrub site does not, and
 * that failure is OPEN and silent. A centralized vocabulary is only a boundary if *selection* and
 * *scrubbing* both derive from it; deriving only selection buys the appearance of one.
 * Exported so the boundary tests can DERIVE their fixtures from it rather than hand-listing the
 * variables they think exist. A hand-listed fixture goes stale the same way a hand-listed deny-list
 * does, and then the test reports green about a source it never supplied.
 * @type {String[]}
 */
export const rawCredentialNames = ['GH_TOKEN', 'GITHUB_TOKEN', ...Object.values(stageTokenSources).filter(Boolean)];

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
            // `--include-labels` reaches `LabelService.listLabels`, which pages this repository's
            // labels over GraphQL. That is a credentialled read, so `none` was a mis-declaration —
            // not a deliberate denial — and it failed exactly as `scopedStageEnv` promises a
            // mis-declared stage will.
            args      : ['./buildScripts/docs/rebuildContentIndexesAndSeo.mjs', '--include-labels'],
            command   : process.execPath,
            label     : 'content indexes and SEO',
            tokenScope: 'reader'
        }
    ];

/**
 * @summary Builds the child environment for one emission stage, carrying exactly the credential
 * that stage is entitled to and nothing else.
 *
 * The pipeline holds three credentials with different authority: an INTAKE App that may read and
 * comment on the DevIndex opt-in/opt-out repositories, a PUBLISHER App that may write to this
 * repository and bypass the code-scanning ruleset, and a READER — the implicit Actions token — that
 * may only read this repository. Passing `process.env` wholesale — as this runner did — handed every
 * stage whichever token happened to be set, so the ruleset-bypass identity was in scope during
 * arbitrary data collection.
 *
 * READER is the narrowest of the three and is not an App at all. It exists because neither App can
 * read this repository's labels: INTAKE has no installation here, and PUBLISHER holds `contents`
 * while labels are `issues` scope. Granting it does NOT add a credential to the job — the implicit
 * token is already present under `permissions:` — it widens an existing one from `contents: read`
 * to also carry `issues: read`, which is why it does not disturb the two-App split's rationale.
 *
 * Every token variable is STRIPPED first, then only the scoped one is re-injected as
 * `GITHUB_TOKEN` (and `GH_TOKEN`, which the DevIndex GitHub service prefers). Stripping is the
 * load-bearing half: without it a stage marked `none` would silently inherit whatever the parent
 * process carried, which is the exact leak the scope annotation claims to prevent.
 *
 * `tokenScope: 'none'` therefore yields a child with NO GitHub credential. A stage that turns out
 * to need one fails loudly on its own missing-auth path rather than quietly succeeding on a more
 * privileged identity than it was granted.
 *
 * @param {String} tokenScope A key of `stageTokenSources` — `intake`, `publisher`, `reader` or `none`.
 * @param {Object} [env=process.env] Parent environment.
 * @returns {Object} A copy carrying at most one GitHub credential.
 */
export function scopedStageEnv(tokenScope, env = process.env) {
    // Fail closed VISIBLY on an unrecognised scope. `undefined` previously fell through to the
    // `none` branch, so a stage added without a `tokenScope` silently ran credential-less — which
    // either fails somewhere confusing or, worse, looks deliberate. A spec comment claimed this
    // made omission visible; it did not, because nothing distinguished "declared none" from
    // "forgot to declare".
    //
    // `Object.hasOwn` rather than `in`, because the vocabulary is an object now: `'toString' in
    // stageTokenSources` is true, which would accept a scope nobody declared and resolve its source
    // to a function. `hasOwn` also admits `none`, whose source is deliberately `null`.
    if (!Object.hasOwn(stageTokenSources, tokenScope)) {
        throw new Error(
            `dataSyncPipeline: emission stage declares tokenScope=${JSON.stringify(tokenScope)}. ` +
            `Every stage must declare one of ${Object.keys(stageTokenSources).join(', ')} — an ` +
            'undeclared scope is an unanswered question about which identity that stage is ' +
            'entitled to, not a default.'
        );
    }

    const
        // EVERY source variable is stripped, not merely the consumed one. Removing only
        // GH_TOKEN/GITHUB_TOKEN leaves `DATA_SYNC_PUBLISHER_TOKEN` readable in an intake stage's
        // environment, so the bypass credential stays one `process.env` lookup away from every
        // data-collection child — the isolation would be nominal, not real. DERIVED from the
        // vocabulary, so a scope cannot be added without its source joining the strip set.
        stripped = new Set(rawCredentialNames),
        source   = stageTokenSources[tokenScope],
        // Read from `env`, never the stripped copy — the value must not depend on statement order.
        token    = source ? env[source] : null,
        scoped   = Object.fromEntries(Object.entries(env).filter(([name]) => !stripped.has(name)));

    if (!token) {
        return scoped
    }

    return {...scoped, GH_TOKEN: token, GITHUB_TOKEN: token}
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
/**
 * @summary Renders an argv array for a failure message with credential-shaped values removed.
 *
 * Defence in depth, added after an argv-borne credential was found reaching this exact message.
 * The primary fix keeps secrets out of argv entirely; this ensures the next one that slips in is
 * not printed. Redaction is by SHAPE, not by matching a known secret value — a transformed secret
 * (base64, for instance) does not match its own literal, which is also why GitHub's masking cannot
 * be relied on as the last line.
 * @param {String[]} args
 * @returns {String}
 * @private
 */
function redactArgs(args) {
    return args
        .map(arg => /authorization|extraheader|token|password|x-access-token/i.test(arg) ? '<redacted>' : arg)
        .join(' ')
}

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
                `${command} ${redactArgs(args)} exited with code ${code}${detail ? `: ${detail}` : ''}`
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
 * the Publisher, the identity this pipeline intends to be the only one able to publish here. So the
 * checkout now persists nothing, and the two commands that genuinely need network auth carry it
 * themselves.
 *
 * The credential is delivered through git's ENV config channel (`GIT_CONFIG_*`), never argv and never
 * `.git/config` — see the implementation note below for why each of those two was rejected.
 *
 * The child env is SCOPED, not merely augmented. Spreading the caller's env and adding the header
 * leaves every raw credential in the child: both source tokens plus any ambient `GH_TOKEN` /
 * `GITHUB_TOKEN`. That is the same additive-boundary defect {@link #scopedStageEnv} exists to prevent
 * for emission stages; a git invocation is not exempt from it just because its credential arrives by
 * a different route.
 * @param {Function} execute Child-process executor.
 * @param {String}   cwd Repository root.
 * @param {String[]} args Git arguments.
 * @param {Object}   [options]
 * @returns {Promise<{stderr: String, stdout: String}>}
 */
export async function gitAuthenticated(execute, cwd, args, options = {}) {
    const token = process.env.DATA_SYNC_PUBLISHER_TOKEN;

    if (!token) {
        return git(execute, cwd, args, options)
    }

    // Delivered through the ENVIRONMENT, never argv. The first version passed
    // `-c http.extraheader=AUTHORIZATION: basic <base64>` as an argument, which put a working
    // credential in two places it must never be:
    //   - `ps` output, readable by any process on the runner;
    //   - `executeCommand`'s failure message, which interpolates `args.join(' ')` — so a failed
    //     push would PRINT the credential into the CI log.
    // And base64 is not redaction: Actions' secret masking matches the literal secret string, so
    // transforming it defeats the mask. The leak would have been plain, decodable, and public.
    //
    // `GIT_CONFIG_COUNT`/`_KEY_`/`_VALUE_` is git's own env-based config channel — same effect as
    // `-c`, no argv exposure, and scoped to this child process rather than written to `.git/config`
    // where a later stage would inherit it.
    const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;

    // Every raw credential is stripped BEFORE the derived header goes in. Spreading the caller's env
    // and appending made the boundary additive: the git child still received both source tokens and
    // any ambient GH_TOKEN/GITHUB_TOKEN, so moving the header out of argv narrowed one exposure while
    // leaving four untouched. `git` needs none of them — it reads the header and nothing else.
    //
    // DERIVED from `rawCredentialNames`, never restated. This was a hand-written destructuring list and
    // it fell behind the vocabulary the moment a scope was added: the new source was stripped from every
    // STAGE child and still reached every GIT child, because the two strip sets had no relationship. A
    // deny-list that must be remembered is a deny-list that will be forgotten.
    const
        stripped = new Set(rawCredentialNames),
        scoped   = Object.fromEntries(
            Object.entries(options.env ?? process.env).filter(([name]) => !stripped.has(name))
        );

    return git(execute, cwd, args, {
        ...options,
        env: {
            ...scoped,
            GIT_CONFIG_COUNT  : '1',
            GIT_CONFIG_KEY_0  : 'http.extraheader',
            GIT_CONFIG_VALUE_0: header
        }
    })
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
    // collection stages depend on. A denial here survives its full retry budget AND precedes all work, so
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

        try {
            await execute(command, args, {cwd, env: scopedStageEnv(tokenScope)})
        } catch (error) {
            // The scope annotation is the only thing that knows which identity this stage was
            // entitled to; the failing child does not. So a bare child failure reads as "the tool
            // is broken" when the finding is "this stage was granted `none` and needs a credential".
            // That misreading has already cost several scheduled runs, because a child's own
            // missing-auth message can advise an interactive login that CI cannot perform.
            //
            // Deliberately NOT a per-stage `requiresCredential` flag: that would be a second
            // hand-maintained declaration beside `tokenScope`, free to drift from it, with nothing
            // deriving either from what the stage actually does. Annotating the failure is derived
            // from observed behaviour and cannot disagree with itself.
            error.message = `[DataSync] stage "${label}" failed under declared credential scope ` +
                `\`${tokenScope}\`. If this is an authentication failure, the stage requires a scope ` +
                `that grants it — never an ambient credential.\n${error.message}`;

            throw error
        }
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
