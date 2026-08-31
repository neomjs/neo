#!/usr/bin/env node

import {spawn}                from 'node:child_process';
import path                   from 'node:path';
import process                from 'node:process';
import {fileURLToPath}        from 'node:url';

import {
    DEFAULT_CORPUS_PATH,
    DEFAULT_MAX_CORPUS_AGE_HOURS,
    FACET_PATHS
}                             from './dataSyncWatchdog.mjs';

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
    'apps/portal/resources/data',
    'apps/portal/sitemap.xml',
    'apps/portal/llms.txt',
    'resources/content'
];

/**
 * The scope vocabulary AND the env var each scope draws from, in ONE place. Three hand-maintained
 * lists stood here — the validator's whitelist, the resolver's ternary chain, and the strip list in
 * the destructure — so adding a scope meant editing three, and a miss in the strip list is the
 * dangerous one: it leaves a credential readable in a child that was never granted it, which is
 * silent rather than loud.
 *
 * `reader` is the implicit Actions token, not an App: it reads this repository and writes nothing.
 * It exists because no App identity can read this repo's labels — the DevIndex intake App was installed only on the
 * DevIndex repos and `publisher` holds `contents`, while labels are `issues` scope. See the
 * `permissions:` block in `data-sync-pipeline.yml`.
 * @type {Object<String,String|null>}
 * @private
 */
const stageTokenSources = {
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
            // `--include-labels` reaches `LabelService.listLabels`, which pages this repository's
            // labels over GraphQL. That is a credentialled read, so `none` was a mis-declaration —
            // not a deliberate denial — and it failed exactly as `scopedStageEnv` promises a
            // mis-declared stage will.
            args               : ['./buildScripts/docs/rebuildContentIndexesAndSeo.mjs', '--include-labels'],
            command            : process.execPath,
            label              : 'content indexes and SEO',
            requiresFreshCorpus: true,
            tokenScope         : 'reader'
        }
    ];

/**
 * The emission stages this pipeline must run, declared INDEPENDENTLY of `emissionCommands`.
 *
 * The independence is the whole mechanism and it is easy to destroy by tidying: derive this list
 * from `emissionCommands` and deleting a stage deletes its own expectation, so the assertion below
 * passes on a pipeline that lost a generator. That is not a hypothetical — `c623b2f63c` removed the
 * `GitHub Workflow corpus` entry and the run went *shorter*, not red, and stayed green for five days
 * over a frozen corpus.
 *
 * This is a second hand-maintained list on purpose, which the credential vocabulary above rightly
 * refuses to be. The distinction: `stageTokenSources` centralizes so selection and scrubbing cannot
 * drift, because there drift is the defect. Here drift IS the signal — the list is the independent
 * witness, and a witness derived from the thing it witnesses attests to nothing. Adding a stage is
 * meant to cost an edit here; that edit is the review surface.
 *
 * It names only the stages the ENGINE owns. GitHub corpus PRODUCTION is deliberately absent: the
 * emitter lives in the Agent OS repository, which consumes this Engine as a published package and is
 * never imported by it, so the producer publishes the corpus INTO this repository and can never
 * appear in `emissionCommands` again. An absent producer is therefore not detectable on this axis at
 * all; {@link #assertCorpusFreshness} is the instrument that catches it, and the two axes together
 * are what make `no-generated-changes` unreachable by having no generator.
 * @type {String[]}
 */
export const REQUIRED_EMISSION_STAGES = ['install dependencies', 'content indexes and SEO'];

/**
 * @summary Refuses to run an emission whose stage set has lost a required stage.
 *
 * Fails BEFORE any stage runs. A pipeline missing a generator must not first publish whatever the
 * survivors derive and then report the gap — the derived commit is the artifact that made the
 * five-day outage look healthy.
 *
 * @param {Object}   [options]
 * @param {Object[]} [options.stages=emissionCommands] The stage table to check.
 * @param {String[]} [options.required=REQUIRED_EMISSION_STAGES] Labels that must be present.
 * @throws {Error} Naming every missing label, never just the first.
 * @returns {void}
 */
export function assertEmissionStageSet({stages = emissionCommands, required = REQUIRED_EMISSION_STAGES} = {}) {
    const
        present = new Set(stages.map(stage => stage.label)),
        missing = required.filter(label => !present.has(label));

    if (missing.length > 0) {
        throw new Error(
            `dataSyncPipeline: emission stage set is missing ${missing.map(label => `"${label}"`).join(', ')}. ` +
            `Expected ${JSON.stringify(required)}, found ${JSON.stringify([...present])}. A stage that ` +
            'vanishes from `emissionCommands` must turn this run RED, not shorter — a run that emits ' +
            'less and still exits 0 is indistinguishable from a run with nothing to do.'
        )
    }
}

/**
 * @summary Builds the child environment for one emission stage, carrying exactly the credential
 * that stage is entitled to and nothing else.
 *
 * The pipeline holds three credentials with different authority: an INTAKE App that may read and
 * comment on the DevIndex opt-in/opt-out repositories, a PUBLISHER App that may write CONTENTS to
 * this repository, and a READER — the implicit Actions token — that may only read this repository.
 * Passing `process.env` wholesale — as this runner did — handed every stage whichever token happened
 * to be set, so the repository-write identity was in scope during arbitrary data collection.
 *
 * PUBLISHER is described by what it holds (`contents: write`) and never by a branch-ruleset bypass.
 * The invariant, which does not go stale: **a bypass exists only while the ruleset's own bypass list
 * names the App.** That list is REPOSITORY CONFIGURATION this workflow cannot grant itself and an admin
 * can change at any time, so any comment stating its value — in either direction — is wrong as soon as
 * it is edited. Publishing a fresh generated commit depends on that grant, because `code scanning merge
 * protection` requires a code-scanning result the commit cannot have until it is pushed.
 *
 * Read it, do not assume it, and use the right instrument: the REST rulesets endpoint OMITS
 * `bypass_actors` entirely for App-type entries — the key is absent, not empty — so a reader with a `[]`
 * default reports "nothing can bypass" whatever the truth is. GraphQL
 * `ruleset(databaseId:…).bypassActors.totalCount` is the surviving probe; its `nodes` are
 * permission-shielded to null while the count stays readable.
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
 * @param {String} tokenScope A key of `stageTokenSources` — `publisher`, `reader` or `none`.
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
        // GH_TOKEN/GITHUB_TOKEN leaves `DATA_SYNC_PUBLISHER_TOKEN` readable in another stage's
        // environment, so the repository-write credential stays one `process.env` lookup away from every
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
    return filePath === 'apps/portal/sitemap.xml'
        || filePath === 'apps/portal/llms.txt'
        || filePath.startsWith('apps/portal/resources/data/')
        || filePath.startsWith('resources/content/')
}

/**
 * @summary The failure classes a stage's child process can be recognized as, stable for reporting.
 */
export const STAGE_FAILURE_CLASS = Object.freeze({
    authentication: 'authentication',
    dependency    : 'dependency',
    entrypoint    : 'entrypoint',
    unrecognized  : 'unrecognized'
});

/**
 * @summary Auth-failure evidence inside a child process's combined output.
 *
 * The numeric codes carry an HTTP-ish context requirement. A bare `\b(401|403)\b` also matches the
 * LINE NUMBER of a stack frame — `at run (/repo/buildScripts/dataSyncPipeline.mjs:401:9)` — because
 * `:` is a non-word character on both sides. stderr folds into `error.message` at the spawn site, so
 * a stack trace is the ORDINARY content of this string rather than an edge case, and the misread would
 * land on the one class this classifier exists to stop over-claiming. Found in review by
 * @neo-opus-vega.
 *
 * The word forms carry the observed GitHub and git failures — `Bad credentials` from the API and
 * `permission denied` from a push. Anything outside both sets stays `unrecognized`, which remains the
 * honest verdict: a wrong lead costs more than an absent one.
 * @type {RegExp}
 */
const AUTH_FAILURE_PATTERN =
    /\bHTTP\/?\d(?:\.\d)?\s+(?:401|403)\b|\bstatus(?:\s+code)?\s*[:=]?\s*(?:401|403)\b|\b(?:401|403)\s+(?:Unauthorized|Forbidden)\b|authentication|credentials|unauthorized|permission denied|Bad credentials/iu;

/**
 * @summary Classifies a failed stage's error from what it actually reports — never from the
 * stage's declared scope, which says what the stage was ENTITLED to and nothing about why it died.
 *
 * Order matters: module resolution and a missing entrypoint are checked before the auth heuristic,
 * because an auth-shaped substring ("permission") can appear inside an unrelated stack trace, while
 * `ERR_MODULE_NOT_FOUND` is unambiguous.
 *
 * @param {Error} error The child process failure.
 * @returns {String} A class from {@link STAGE_FAILURE_CLASS}.
 */
export function classifyStageFailure(error) {
    const code = error?.code ?? '',
          text = String(error?.message ?? '');

    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND' || /Cannot find package|Cannot find module/u.test(text)) {
        return STAGE_FAILURE_CLASS.dependency;
    }
    if (code === 'ENOENT') {
        return STAGE_FAILURE_CLASS.entrypoint;
    }
    if (AUTH_FAILURE_PATTERN.test(text)) {
        return STAGE_FAILURE_CLASS.authentication;
    }

    return STAGE_FAILURE_CLASS.unrecognized
}

/**
 * @summary The one-line lead for a stage failure, stating the OBSERVED class rather than a cause
 * the annotation cannot know.
 *
 * The declared scope is still reported by the caller as context — it is genuinely useful — but it
 * no longer leads, because in an operator-visible log tail the lead is the only line read.
 *
 * @param {Error} error The child process failure.
 * @returns {String}
 */
export function describeStageFailure(error) {
    switch (classifyStageFailure(error)) {
        case STAGE_FAILURE_CLASS.dependency:
            return 'failed to LOAD: a package it imports is not installed in this environment. ' +
                'This is a packaging/import-graph failure, NOT an authentication one — no credential change fixes it.';
        case STAGE_FAILURE_CLASS.entrypoint:
            return 'could not start: its entrypoint or working directory is missing.';
        case STAGE_FAILURE_CLASS.authentication:
            return 'failed with an AUTHENTICATION-shaped error. A stage must be granted a scope ' +
                'that permits the call — never an ambient credential.';
        default:
            return 'failed with an UNRECOGNIZED error class; the cause is not established below.';
    }
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
 * @summary Folds every deferred stage failure into the single error the publish path rethrows.
 *
 * The publish path rethrows ONE error, so a lone `deferredError` slot kept only whichever stage
 * failed last: one denial that failed all four DevIndex stages reported one of them and dropped
 * three, and the outage read as narrower than it was. The aggregate spells every cause into
 * `message` — a CI log tail shows the message and nothing else — while `AggregateError#errors`
 * keeps the originals reachable for anything inspecting them programmatically.
 *
 * A single failure returns unwrapped: wrapping it would bury the one message that matters behind a
 * count of one, and every existing consumer already reads that error directly.
 * @param {Error[]} errors Deferred failures, in the order their stages ran.
 * @returns {Error} `errors[0]` when it is the only one, otherwise an `AggregateError` over all.
 */
export function aggregateDeferredFailures(errors) {
    if (errors.length === 1) {
        return errors[0]
    }

    return new AggregateError(
        errors,
        `[DataSync] ${errors.length} stages deferred a failure; all of them are reported below.\n\n` +
        errors.map((error, index) => `(${index + 1}/${errors.length}) ${error.message}`).join('\n\n')
    )
}

/**
 * @summary Reads each corpus facet's newest COMMIT date, the only honest freshness instrument here.
 *
 * Not `mtime`: this runs in an ephemeral Actions checkout where every file's mtime is checkout time,
 * so an mtime probe certifies a five-day-old corpus as seconds fresh. Not the working tree either —
 * the question is what the branch carries, which is what every downstream consumer clones.
 *
 * A facet with NO commit visible resolves to `null` rather than to a large age, and the assertion
 * below treats that as stale. `null` here means "the instrument saw nothing", which for a corpus
 * that is supposed to be published on a cadence is the loudest state, not the most permissive one.
 *
 * @param {Object}   options
 * @param {String}   options.cwd Repository root.
 * @param {Function} options.execute Child-process executor.
 * @param {String}   [options.corpusPath=DEFAULT_CORPUS_PATH] Corpus root the facet subpaths hang off.
 * @param {Object}   [options.facetPaths=FACET_PATHS] Facet name → subpaths, shared with the watchdog.
 * @param {String}   [options.ref=remoteDevRef] The ref whose committed corpus is measured.
 * @returns {Promise<Object<String, String|null>>} Facet name → newest ISO commit date, or `null`.
 */
export async function readCorpusFacetCommitDates({
    cwd,
    execute,
    corpusPath = DEFAULT_CORPUS_PATH,
    facetPaths = FACET_PATHS,
    ref        = remoteDevRef
}) {
    const dates = {};

    for (const [facet, subpaths] of Object.entries(facetPaths)) {
        const observed = [];

        for (const subpath of subpaths) {
            // Newest-wins across a multi-path facet, matching `dataSyncWatchdog.latestCommitDate`:
            // `issues` spans active + archive and consumers dual-source them, so an archive-only
            // repair is maintenance rather than freshness. Measuring min-wins here would breach on
            // a healthy corpus and train everyone to ignore the guard.
            const {stdout} = await git(execute, cwd, [
                'log', '-1', '--format=%cI', ref, '--', path.posix.join(corpusPath, subpath)
            ]);

            stdout.trim() && observed.push(stdout.trim())
        }

        dates[facet] = observed.length > 0 ?
            observed.reduce((newest, date) => Date.parse(date) > Date.parse(newest) ? date : newest) :
            null
    }

    return dates
}

/**
 * @summary Refuses to DERIVE the portal from a corpus the pipeline is no longer producing.
 *
 * This is the axis that catches an absent producer. The stage-set assertion cannot: the emitter runs
 * in the Agent OS repository, so its absence never shows up in `emissionCommands`. What shows up is a
 * corpus that stops advancing while the derivation stage keeps rebuilding the portal from it and
 * committing the result — a green run, fresh derived commits, and a frozen source.
 *
 * Threshold is `DEFAULT_MAX_CORPUS_AGE_HOURS`, imported from the watchdog rather than restated, so the
 * two mechanisms cannot disagree about what "stale" means. It is deliberately NOT the pipeline's hourly
 * cadence: a facet only commits when GitHub content actually changed, so a cadence-tight threshold would
 * breach on every quiet hour and be muted within a day. 48h catches this defect on day two instead of
 * day five, which is the improvement actually on offer; a tighter bound needs a producer that emits a
 * heartbeat even when nothing changed, and that is not in this ticket.
 *
 * @param {Object} options
 * @param {Object<String, String|null>} options.facetCommitDates Facet name → newest ISO commit date.
 * @param {Number} [options.maxAgeHours=DEFAULT_MAX_CORPUS_AGE_HOURS] Staleness bound.
 * @param {Date}   [options.now=new Date()] Clock, injected so the spec can witness a boundary.
 * @throws {Error} Naming every stale facet with its measured age, never just the first.
 * @returns {void}
 */
export function assertCorpusFreshness({facetCommitDates, maxAgeHours = DEFAULT_MAX_CORPUS_AGE_HOURS, now = new Date()}) {
    const stale = Object.entries(facetCommitDates).map(([facet, lastCommitAt]) => ({
        ageHours: lastCommitAt ? (now.getTime() - Date.parse(lastCommitAt)) / 3_600_000 : null,
        facet,
        lastCommitAt
    })).filter(({ageHours}) => ageHours === null || ageHours > maxAgeHours);

    if (stale.length > 0) {
        throw new Error(
            'dataSyncPipeline: refusing to derive the portal from a stale corpus — ' +
            stale.map(({ageHours, facet, lastCommitAt}) => lastCommitAt ?
                `\`${facet}\` is ${ageHours.toFixed(1)}h old (threshold ${maxAgeHours}h)` :
                `no commit visible for \`${facet}\``
            ).join(', ') +
            '. The derivation stage reads this corpus and commits what it produces, so deriving from a ' +
            'frozen source publishes fresh-looking artifacts over stale facts. If the producer is down, ' +
            'that is the finding; a shorter green run is not.'
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
 * identity that the stage table just decoupled it from.
 * @returns {Promise<void|{deferredError: Error}>} Deferred failure — every
 * stage that deferred one — whose safe generated progress must be published before it is reported.
 */
export async function emitGeneratedData({
    attempt,
    cwd,
    execute = executeCommand,
    log     = console.log
}) {

    // BEFORE any stage runs, and before any artifact is produced. A pipeline that has lost a stage
    // must not first publish what the survivors derive and then mention the gap — that derived
    // commit is precisely what made five days of a frozen corpus read as healthy.
    assertEmissionStageSet();

    // EVERY deferred failure, not the last one. A single slot silently dropped three of the four
    // DevIndex stages when one denial failed them all, so the run reported one cause and hid the
    // rest — and the operator sized the outage from whichever happened to run last.
    const deferredErrors = [];

    // NOTHING is skipped on a stage denial, and the earlier per-scope skip was
    // wrong for a reason worth keeping: a credential-scope declaration says which identity to INJECT,
    // never which capability a stage CONSUMES. One denied `devindex-opt-in.stargazers` probe was
    // enough to skip Opt-Out, Spider and Updater purely because all four name the same token — yet
    // Spider queries search/community endpoints and Updater reads `users/:name/orgs`, so neither
    // touches a DevIndex repository at all. That skip stopped healthy work to save a few seconds of
    // predicted failure, re-coupling at the credential layer exactly what the stage table above had
    // just decoupled.
    //
    // Letting every stage run and fail on its own merits is both simpler and strictly more accurate
    // than any static capability map, which could only drift from what the services actually call.
    // The cost is a few seconds of stages we expect to fail; the aggregate below numbers each cause,
    // so a shared root reads as related failures rather than one arbitrary survivor.
    for (const {
        args,
        command,
        label,
        publishGeneratedProgressOnFailure = false,
        requiresFreshCorpus = false,
        tokenScope
    } of emissionCommands) {
        log(`[DataSync] emit attempt=${attempt} stage=${label} credential=${tokenScope}`);

        // A per-stage flag, like `publishGeneratedProgressOnFailure` beside it, and unlike the
        // `requiresCredential` flag this file rightly refused: that one would have restated
        // `tokenScope`, free to drift from it. This declares something nothing else declares —
        // which stages CONSUME the corpus — and only the consumer can be refused an input.
        if (requiresFreshCorpus) {
            const facetCommitDates = await readCorpusFacetCommitDates({cwd, execute});

            log(
                `[DataSync] emit attempt=${attempt} stage=${label} corpus=` +
                Object.entries(facetCommitDates).map(([facet, date]) => `${facet}@${date ?? 'none'}`).join(' ')
            );

            assertCorpusFreshness({facetCommitDates})
        }

        try {
            await execute(command, args, {cwd, env: scopedStageEnv(tokenScope)})
        } catch (error) {
            // The scope annotation is the only thing that knows which identity this stage was
            // entitled to; the failing child does not. So a bare child failure reads as "the tool
            // is broken" when the finding is "this stage was granted `none` and needs a credential".
            // That misreading has already cost several scheduled runs, because a child's own
            // missing-auth message can advise an interactive login that CI cannot perform.
            //
            // But the annotation knows the SCOPE, not the CAUSE — and prepending it unconditionally
            // produced the mirror-image defect. Twenty consecutive runs failed on
            // `ERR_MODULE_NOT_FOUND: Cannot find package 'chromadb'` while the operator-visible last
            // line said "failed under declared credential scope `reader`", sending diagnosis toward
            // auth. The `If this is an authentication failure` hedge is only readable by someone who
            // already has the answer: in a log tail the annotation is last and the real error has
            // scrolled away. So classify FIRST and let the observed class lead.
            //
            // Deliberately NOT a per-stage `requiresCredential` flag: that would be a second
            // hand-maintained declaration beside `tokenScope`, free to drift from it, with nothing
            // deriving either from what the stage actually does. The classification below is derived
            // from the observed error and keeps that same property.
            error.message = `[DataSync] stage "${label}" ${describeStageFailure(error)} ` +
                `Declared credential scope: \`${tokenScope}\`.\n${error.message}`;

            if (publishGeneratedProgressOnFailure) {
                deferredErrors.push(error);
                log(
                    `[DataSync] emit attempt=${attempt} stage=${label} result=deferred-failure ` +
                    'action=publish-generated-progress-then-fail'
                );
                continue
            }

            throw error
        }
    }

    if (deferredErrors.length > 0) {
        return {deferredError: aggregateDeferredFailures(deferredErrors)}
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
        const {deferredError = null} = await emit({attempt, baseSha, cwd, execute, log}) || {};

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

            if (deferredError) {
                throw deferredError
            }

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

        if (deferredError) {
            log(
                `[DataSync] publish attempt=${attempt}/${maxAttempts} ` +
                'result=pushed-generated-progress-before-stage-failure'
            );
            throw deferredError
        }

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
