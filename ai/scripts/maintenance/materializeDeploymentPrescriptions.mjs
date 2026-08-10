#!/usr/bin/env node
import {execFile}               from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import * as fs                  from 'node:fs/promises';
import os                       from 'node:os';
import path                     from 'node:path';
import {promisify}              from 'node:util';
import {fileURLToPath}          from 'node:url';

import {
    admitLedgerPrescriptions,
    LEDGER_REFUSALS
} from '../../services/memory-core/helpers/deploymentPrescriptionLedger.mjs';
import {renderPrescribedEnvironment} from '../../services/memory-core/helpers/deploymentPrescriptionEnvironment.mjs';
import {
    appendDeploymentPrescription,
    readDeploymentPrescriptions,
    validateDeploymentPrescriptionLedger
} from '../../services/memory-core/helpers/deploymentPrescriptionStore.mjs';
import {knobEnvBindings, RECOVERY_KNOBS} from '../../services/memory-core/helpers/recoveryKnobRegistry.mjs';

/**
 * @module ai/scripts/maintenance/materializeDeploymentPrescriptions
 * @summary Trusted host-side delivery entrypoint for deployment prescriptions: `append` stamps an
 * operator-authored intent into the guarded JSONL store; `materialize` re-admits the ledger against
 * the current recovery-knob registry and atomically merges only registry-owned environment keys into
 * the persistent Compose carrier; `receipt` records what the health-gated deploy actually consumed.
 *
 * This module deliberately has no Neo or AiConfig bootstrap. It runs on the deployment host before
 * the containers are recreated, while the configuration inside those containers may be the thing
 * under repair. The registry remains the authority for knob shape, bounds, target, and environment
 * bindings; the ledger is transport, never executable authority.
 *
 * The materialization manifest is load-bearing. A ledger may receive a newer record while Compose is
 * building. Re-folding the ledger after `up --wait` would then stamp the newer prescription as
 * delivered even though the running container consumed the earlier env file. `materialize` therefore
 * snapshots exact prescription identities plus the env digest before Docker, and `receipt` consumes
 * that snapshot only after verifying that the carrier still has the same digest.
 */

const
    execFileAsync  = promisify(execFile),
    SCHEMA_VERSION = 1,
    RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    DEFAULT_ROOT   = process.env.NEO_HOST_DEPLOYMENT_PRESCRIPTION_ROOT
        || path.join(os.homedir(), '.neo-ai', 'deployment-prescriptions');

/**
 * @summary Returns the closed environment-key set the recovery-knob registry owns.
 * @returns {Set<String>} Registry-derived keys; never record-derived.
 */
export function prescribedEnvironmentKeys() {
    // Some recovery knobs are actuator-local overlays and intentionally declare no deployment
    // service. Owning their env keys here would erase operator config even though no ledger record
    // can target them. The same service declaration admission requires defines this narrower set.
    return new Set(Object.entries(RECOVERY_KNOBS)
        .filter(([, descriptor]) => typeof descriptor.serviceKey === 'string' && descriptor.serviceKey)
        .flatMap(([knob]) => knobEnvBindings(knob).map(binding => binding.env)))
}

/**
 * @summary Refuses ambient process values that would outrank the persistent Compose carrier.
 *
 * Docker Compose gives an exported process variable precedence over `.env` and `--env-file`. A
 * materializer that ignored that layer could write and receipt one admitted value while Compose
 * deployed another. Refusal keeps the operator-owned environment intact and aborts before Docker;
 * callers must move deployment-owned values into the governed carrier instead of silently losing
 * either authority.
 * @param {Object} [ambientEnvironment]
 * @param {Set<String>} [ownedKeys]
 * @returns {void}
 */
export function assertNoAmbientPrescribedEnvironment(
    ambientEnvironment = process.env,
    ownedKeys = prescribedEnvironmentKeys()
) {
    const conflicts = [...ownedKeys]
        .filter(key => Object.prototype.hasOwnProperty.call(ambientEnvironment, key)
            && ambientEnvironment[key] !== undefined)
        .sort();

    if (conflicts.length) {
        throw new Error(
            `deployment-owned environment must be unset before materialization: ${conflicts.join(', ')}`
        )
    }
}

/**
 * @summary Splits env-file content without changing any retained byte, including CRLF and blank lines.
 * @param {String} content
 * @returns {String[]} Segments including their original line terminators.
 * @private
 */
function splitLinesPreservingTerminators(content) {
    return String(content ?? '').match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) ?? []
}

/**
 * @summary Extracts an env assignment key without interpreting or reserializing its value.
 * @param {String} line
 * @returns {String|null}
 * @private
 */
function envAssignmentKey(line) {
    const match = line.replace(/(?:\r\n|\n|\r)$/, '').match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);

    return match?.[1] ?? null
}

/**
 * @summary Replaces only registry-owned env assignments while preserving every unrelated byte.
 *
 * All previous occurrences of an owned key are removed before the sorted renderer output is appended;
 * this prevents a stale duplicate later in the operator file from overriding the admitted value. An
 * empty active set removes stale owned lines, while comments, blank lines, quoting, secrets, and all
 * unowned assignments retain their exact bytes and order.
 * @param {String} existingContent Existing operator/persistent env content.
 * @param {String} renderedContent Registry-admitted renderer output.
 * @param {Set<String>} [ownedKeys]
 * @returns {String} Merged env content.
 */
export function mergePrescribedEnvironment(
    existingContent,
    renderedContent,
    ownedKeys = prescribedEnvironmentKeys()
) {
    const retained = splitLinesPreservingTerminators(existingContent)
        .filter(line => !ownedKeys.has(envAssignmentKey(line)))
        .join('');

    if (!renderedContent) return retained;

    return retained && !/[\r\n]$/.test(retained)
        ? `${retained}\n${renderedContent}`
        : `${retained}${renderedContent}`
}

/**
 * @summary Writes a UTF-8 file through a unique sibling and atomic rename.
 * @param {String} filePath
 * @param {String} content
 * @param {Object} [fsModule]
 * @returns {Promise<{createdLink: Boolean, capturedPath: String|null}>} Reversible link preparation.
 */
export async function writeAtomicFile(filePath, content, fsModule = fs) {
    const absolute = path.resolve(filePath),
          scratch  = `${absolute}.${process.pid}.${randomUUID()}.tmp`;

    await fsModule.mkdir(path.dirname(absolute), {recursive: true});

    try {
        await fsModule.writeFile(scratch, content, {encoding: 'utf8', flag: 'wx', mode: 0o600});
        await fsModule.rename(scratch, absolute)
    } finally {
        await fsModule.rm(scratch, {force: true}).catch(() => {})
    }
}

/**
 * @summary Reads an optional UTF-8 file, distinguishing absence from every other I/O failure.
 * @param {String} filePath
 * @param {Object} fsModule
 * @returns {Promise<String|null>}
 * @private
 */
async function readOptionalFile(filePath, fsModule) {
    try {
        return await fsModule.readFile(filePath, 'utf8')
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error
    }
}

/**
 * @summary Reads optional path metadata without treating permission/type errors as absence.
 * @param {String} filePath
 * @param {Object} fsModule
 * @returns {Promise<Object|null>}
 * @private
 */
async function lstatOptional(filePath, fsModule) {
    try {
        return await fsModule.lstat(filePath)
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error
    }
}

/**
 * @summary Captures enough metadata to reject a project-env replacement race.
 * @param {Object} stat
 * @returns {Object}
 * @private
 */
function statIdentity(stat) {
    return {
        dev    : stat.dev,
        ino    : stat.ino,
        mode   : stat.mode,
        size   : stat.size,
        mtimeMs: stat.mtimeMs
    }
}

/**
 * @summary Classifies the Compose project env carrier and validates any existing symlink target.
 * @param {String} projectEnvPath
 * @param {String} envPath
 * @param {Object} fsModule
 * @returns {Promise<Object>} `{kind, statIdentity?, content?}`.
 * @private
 */
async function inspectProjectEnvironment(projectEnvPath, envPath, fsModule) {
    const stat = await lstatOptional(projectEnvPath, fsModule);

    if (!stat) return {kind: 'missing'};

    if (stat.isSymbolicLink()) {
        const linkTarget = await fsModule.readlink(projectEnvPath),
              resolved   = path.resolve(path.dirname(projectEnvPath), linkTarget);

        if (resolved !== path.resolve(envPath)) {
            throw new Error('project env is an unexpected symlink; refusing to retarget operator state')
        }

        return {kind: 'linked'}
    }

    if (!stat.isFile()) {
        throw new Error('project env is neither a regular file nor the managed symlink')
    }

    return {
        kind        : 'regular',
        statIdentity: statIdentity(stat),
        content     : await fsModule.readFile(projectEnvPath, 'utf8')
    }
}

/**
 * @summary Restores a captured regular project env without overwriting a concurrent replacement.
 * @param {String} capturedPath
 * @param {String} projectEnvPath
 * @param {Object} fsModule
 * @returns {Promise<Boolean>} `true` when restored; `false` when another path occupant won.
 * @private
 */
async function restoreCapturedProjectEnvironment(capturedPath, projectEnvPath, fsModule) {
    try {
        // `link` is the no-overwrite primitive `rename` is not. The capture is a sibling, so it is on
        // the same filesystem; retaining it until the link succeeds also preserves the operator bytes
        // when another writer has already recreated `.env`.
        await fsModule.link(capturedPath, projectEnvPath);
        await fsModule.unlink(capturedPath);
        return true
    } catch (error) {
        if (error?.code === 'EEXIST') return false;
        throw error
    }
}

/**
 * @summary Makes the Compose project's default `.env` resolve to the persistent carrier.
 *
 * Missing paths are created without replacement semantics. A regular file is adopted only under the
 * explicit flag and only if its metadata still matches the version inspected before materialization;
 * an unexpected symlink or a concurrent replacement is never overwritten.
 * @param {Object} options
 * @param {String} options.projectEnvPath
 * @param {String} options.envPath
 * @param {Boolean} options.adoptExistingEnv
 * @param {Object} options.observation
 * @param {Object} options.fsModule
 * @returns {Promise<void>}
 * @private
 */
async function ensureProjectEnvironmentLink({
    projectEnvPath,
    envPath,
    adoptExistingEnv,
    observation,
    fsModule
}) {
    if (observation.kind === 'linked') return {createdLink: false, capturedPath: null};

    await fsModule.mkdir(path.dirname(projectEnvPath), {recursive: true});

    if (observation.kind === 'missing') {
        try {
            await fsModule.symlink(path.resolve(envPath), projectEnvPath)
        } catch (error) {
            if (error?.code === 'EEXIST') {
                throw new Error('project env appeared during materialization; refusing to replace it')
            }
            throw error
        }
        return {createdLink: true, capturedPath: null}
    }

    if (!adoptExistingEnv) {
        throw new Error('project env is a regular file; pass --adopt-existing-env to preserve and adopt it')
    }

    const capturedPath = `${projectEnvPath}.${process.pid}.${randomUUID()}.captured`;

    // Capture the ACTUAL final path occupant first. A check followed by rename(target) is not CAS:
    // rename would silently overwrite an operator update that lands between those calls. Moving the
    // occupant to a unique sibling never overwrites it, and leaves the destination absent so symlink
    // creation can use its native no-overwrite behavior.
    await fsModule.rename(projectEnvPath, capturedPath);

    let capturedStat, capturedContent;

    try {
        capturedStat    = await fsModule.lstat(capturedPath);
        capturedContent = await fsModule.readFile(capturedPath, 'utf8')
    } catch (error) {
        const restored = await restoreCapturedProjectEnvironment(capturedPath, projectEnvPath, fsModule);

        throw new Error(restored
            ? `project env capture could not be verified and was restored: ${error.message}`
            : `project env capture could not be verified; operator file retained at ${capturedPath}`)
    }

    const unchanged = capturedStat.isFile()
        && JSON.stringify(statIdentity(capturedStat)) === JSON.stringify(observation.statIdentity)
        && capturedContent === observation.content;

    if (!unchanged) {
        const restored = await restoreCapturedProjectEnvironment(capturedPath, projectEnvPath, fsModule);

        throw new Error(restored
            ? 'project env changed during materialization; restored without replacement'
            : `project env changed during materialization; captured operator file retained at ${capturedPath}`)
    }

    try {
        await fsModule.symlink(path.resolve(envPath), projectEnvPath)
    } catch (error) {
        const restored = await restoreCapturedProjectEnvironment(capturedPath, projectEnvPath, fsModule);

        if (!restored) {
            throw new Error(
                `project env appeared during adoption; captured operator file retained at ${capturedPath}`
            )
        }

        throw error
    }

    // Keep the captured regular file until the caller commits the persistent carrier. If that write
    // fails, rollback can restore the exact original instead of leaving a dangling symlink.
    return {createdLink: true, capturedPath}
}

/**
 * @summary Commits a prepared project-env link after the persistent carrier write succeeds.
 * @param {Object} transaction
 * @param {Object} fsModule
 * @returns {Promise<void>}
 * @private
 */
async function commitProjectEnvironmentLink(transaction, fsModule) {
    if (transaction.capturedPath) {
        await fsModule.unlink(transaction.capturedPath)
    }
}

/**
 * @summary Rolls back a prepared link without overwriting a concurrent path occupant.
 * @param {Object} transaction
 * @param {String} projectEnvPath
 * @param {String} envPath
 * @param {Object} fsModule
 * @returns {Promise<void>}
 * @private
 */
async function rollbackProjectEnvironmentLink(transaction, projectEnvPath, envPath, fsModule) {
    if (!transaction.createdLink) return;

    const current = await lstatOptional(projectEnvPath, fsModule);

    if (!current?.isSymbolicLink()) {
        throw new Error(transaction.capturedPath
            ? `project env changed during rollback; operator file retained at ${transaction.capturedPath}`
            : 'project env changed during rollback; refusing to remove it')
    }

    const currentTarget = path.resolve(path.dirname(projectEnvPath), await fsModule.readlink(projectEnvPath));

    if (currentTarget !== path.resolve(envPath)) {
        throw new Error(transaction.capturedPath
            ? `project env retargeted during rollback; operator file retained at ${transaction.capturedPath}`
            : 'project env retargeted during rollback; refusing to remove it')
    }

    await fsModule.unlink(projectEnvPath);

    if (transaction.capturedPath) {
        const restored = await restoreCapturedProjectEnvironment(
            transaction.capturedPath,
            projectEnvPath,
            fsModule
        );

        if (!restored) {
            throw new Error(
                `project env appeared during rollback; operator file retained at ${transaction.capturedPath}`
            )
        }
    }
}

/**
 * @summary Identifies benign history rows that lost to a newer sink sequence.
 * @param {Object} refusal
 * @returns {Boolean}
 * @private
 */
function isBenignSupersession(refusal) {
    return refusal?.reason === LEDGER_REFUSALS.conflictingSequence
        && refusal.detail?.length === 1
        && refusal.detail[0].startsWith('superseded by sequence ')
}

/**
 * @summary Identifies a strict-raise refusal whose desired deployment state is already live.
 *
 * This is deliberately registry-declared and materializer-only. Append/actuation keeps the strict
 * transaction invariant; only reconciliation may accept equality, and an absent predicate fails
 * closed for future knobs.
 * @param {Object} refusal
 * @returns {Boolean}
 * @private
 */
function isAlreadyApplied(refusal) {
    const record  = refusal?.record,
          matcher = RECOVERY_KNOBS[record?.knob]?.matchesCurrentDeployment;

    return refusal?.reason === LEDGER_REFUSALS.invalidTransaction
        && typeof matcher === 'function'
        && matcher(record.values, record.validatedAgainst?.context)
}

/**
 * @summary Creates a stable SHA-256 digest for exact carrier-byte provenance.
 * @param {String} content
 * @returns {String}
 * @private
 */
function digest(content) {
    return createHash('sha256').update(content).digest('hex')
}

/**
 * @summary Resolves the current runtime context required to revalidate one active deployment knob.
 *
 * The stored `validatedAgainst.context` proves why the operator's append was valid THEN. It cannot
 * authorize deployment NOW: a 12 GiB raise captured against an 8 GiB container becomes a lowering
 * instruction if the live container has since moved to 14 GiB. The materializer therefore asks Docker
 * for the one identity-proven Compose target immediately before rendering and substitutes that fresh
 * fact into current-registry validation.
 *
 * The resolver is intentionally closed over today's deployment-capable requirement. A future knob with
 * another context leaf must add its own measured resolver rather than inheriting a guessed/default value.
 * @param {Object} record Active, trusted ledger record.
 * @param {Object} options
 * @param {String} options.composeProject Exact Compose project identity.
 * @param {Function} [options.execFileImpl]
 * @returns {Promise<Object>} Current context keyed by registry requirement path.
 */
export async function resolveDeploymentRuntimeContext(record, {
    composeProject,
    execFileImpl = execFileAsync
} = {}) {
    if (!composeProject) {
        throw new Error('runtime-context resolution requires the Compose project identity')
    }

    const requirements = RECOVERY_KNOBS[record?.knob]?.requires ?? [];

    if (requirements.length === 0) return {};

    if (requirements.length !== 1 || requirements[0] !== 'runtime.chroma.liveMemoryLimitBytes'
        || record.targetIdentity?.id !== 'chroma') {
        throw new Error(`no runtime-context resolver is declared for knob '${record?.knob}'`)
    }

    const listed = await execFileImpl('docker', [
        'ps', '-a',
        '--filter', `label=com.docker.compose.project=${composeProject}`,
        '--filter', `label=com.docker.compose.service=${record.targetIdentity.id}`,
        '--format', '{{.ID}}'
    ], {encoding: 'utf8'}),
          ids = listed.stdout.split('\n').map(value => value.trim()).filter(Boolean);

    if (ids.length !== 1) {
        throw new Error(
            `runtime-context resolution expected one '${record.targetIdentity.id}' container in ` +
            `Compose project '${composeProject}', found ${ids.length}`
        )
    }

    const inspected = await execFileImpl(
        'docker',
        ['inspect', ids[0], '--format', '{{.HostConfig.Memory}}'],
        {encoding: 'utf8'}
    ),
          liveMemoryLimitBytes = Number(inspected.stdout.trim());

    if (!Number.isFinite(liveMemoryLimitBytes) || liveMemoryLimitBytes <= 0) {
        throw new Error(`runtime-context resolution returned no finite positive memory limit for '${ids[0]}'`)
    }

    return {'runtime.chroma.liveMemoryLimitBytes': liveMemoryLimitBytes}
}

/**
 * @summary Re-admits the ledger, atomically writes the persistent env carrier, links the Compose
 * project to it, and snapshots the exact pre-deploy materialization for the later receipt.
 * @param {Object} options
 * @param {String} options.ledgerPath
 * @param {String} options.envPath
 * @param {String} options.projectEnvPath
 * @param {String} [options.statePath]
 * @param {String} [options.deploymentRunId]
 * @param {Boolean} [options.adoptExistingEnv]
 * @param {Function} [options.resolveContext] Fresh runtime-context resolver for each active record.
 * @param {Object} [options.ambientEnvironment]
 * @param {Object} [options.fsModule]
 * @param {Function} [options.now]
 * @returns {Promise<Object>} Bounded materialization summary; never env values or unrelated content.
 */
export async function materializeDeploymentPrescriptions({
    ledgerPath,
    envPath,
    projectEnvPath,
    statePath = null,
    deploymentRunId = randomUUID(),
    adoptExistingEnv = false,
    resolveContext = null,
    ambientEnvironment = process.env,
    fsModule = fs,
    now = Date.now
} = {}) {
    if (!ledgerPath || !envPath || !projectEnvPath) {
        throw new Error('materialize requires ledgerPath, envPath, and projectEnvPath')
    }

    if (path.resolve(envPath) === path.resolve(projectEnvPath)) {
        throw new Error('persistent env and project env must be distinct paths')
    }

    if (!RUN_ID_PATTERN.test(deploymentRunId ?? '')) {
        throw new Error('materialize requires a UUID deploymentRunId')
    }

    assertNoAmbientPrescribedEnvironment(ambientEnvironment);

    const
        resolvedStatePath = statePath || path.join(path.dirname(path.resolve(envPath)), 'materialized-state.json'),
        observation       = await inspectProjectEnvironment(projectEnvPath, envPath, fsModule),
        persistentContent = await readOptionalFile(envPath, fsModule);

    if (observation.kind === 'regular' && !adoptExistingEnv) {
        throw new Error('project env is a regular file; pass --adopt-existing-env to preserve and adopt it')
    }

    if (observation.kind === 'regular' && persistentContent !== null
        && persistentContent !== observation.content) {
        throw new Error('persistent env and project env both exist with different content; refusing to choose one')
    }

    const
        baseContent = observation.kind === 'regular' ? observation.content : (persistentContent ?? ''),
        records     = await readDeploymentPrescriptions(ledgerPath, fsModule);

    // Parsing JSONL is not an authority check. This audit verifies the sink-owned schema, producer
    // stamp, global monotonic sequence, per-competition predecessor CAS, and observation watermark
    // before the read-side fold is allowed to derive executable environment values.
    validateDeploymentPrescriptionLedger(records);

    const
        historicalFold = admitLedgerPrescriptions(records),
        fatal          = historicalFold.refused.filter(refusal => !isBenignSupersession(refusal));

    if (fatal.length) {
        const reasons = [...new Set(fatal.map(entry => entry.reason))].sort().join(', ');

        throw new Error(`prescription ledger refused ${fatal.length} active/invalid record(s): ${reasons}`)
    }

    if (historicalFold.admitted.length && typeof resolveContext !== 'function') {
        throw new Error('active deployment prescriptions require a fresh runtime-context resolver')
    }

    const currentRecords = await Promise.all(historicalFold.admitted.map(async record => ({
        ...record,
        validatedAgainst: {
            ...record.validatedAgainst,
            context: await resolveContext(record)
        }
    }))),
          currentFold = admitLedgerPrescriptions(currentRecords),
          alreadyApplied = currentFold.refused.filter(isAlreadyApplied),
          currentFatal = currentFold.refused.filter(refusal => !isAlreadyApplied(refusal));

    if (currentFatal.length) {
        const reasons = [...new Set(currentFatal.map(entry => entry.reason))].sort().join(', ');

        throw new Error(`active prescription failed current runtime revalidation: ${reasons}`)
    }

    const
        activeRecords = [...currentFold.admitted, ...alreadyApplied.map(entry => entry.record)],
        prescriptions = activeRecords.flatMap(record => knobEnvBindings(record.knob).map(binding => ({
            key  : binding.env,
            value: record.values[binding.path]
        }))),
        rendered = renderPrescribedEnvironment(prescriptions);

    if (rendered.refused.length) {
        throw new Error(`env renderer refused ${rendered.refused.length} admitted prescription(s)`)
    }

    const
        merged             = mergePrescribedEnvironment(baseContent, rendered.content),
        materializedDigest = digest(merged),
        materializedAt     = new Date(now()).toISOString(),
        state              = {
            schemaVersion      : SCHEMA_VERSION,
            recordType         : 'deployment-prescription-materialization',
            deploymentRunId,
            materializedAt,
            materializedDigest,
            activePrescriptions: activeRecords.map(record => ({
                prescriptionId: record.prescriptionId,
                sequence      : record.sequence,
                knob          : record.knob,
                targetIdentity: record.targetIdentity
            }))
        };

    const linkTransaction = await ensureProjectEnvironmentLink({
        projectEnvPath,
        envPath,
        adoptExistingEnv,
        observation,
        fsModule
    });

    try {
        await writeAtomicFile(envPath, merged, fsModule)
    } catch (error) {
        await rollbackProjectEnvironmentLink(linkTransaction, projectEnvPath, envPath, fsModule);
        throw error
    }

    await commitProjectEnvironmentLink(linkTransaction, fsModule);
    await writeAtomicFile(resolvedStatePath, `${JSON.stringify(state, null, 2)}\n`, fsModule);

    return {
        status            : 'materialized',
        activeCount       : state.activePrescriptions.length,
        benignHistoryCount: historicalFold.refused.length,
        deploymentRunId,
        materializedDigest,
        statePath         : resolvedStatePath
    }
}

/**
 * @summary Writes a post-health delivery receipt for the exact pre-up materialization snapshot.
 * @param {Object} options
 * @param {String} options.envPath
 * @param {String} options.statePath
 * @param {String} options.receiptPath
 * @param {String} options.deploymentRunId
 * @param {String} options.deployedRevision Full commit SHA the pipeline built.
 * @param {Object} [options.fsModule]
 * @param {Function} [options.now]
 * @returns {Promise<Object>} The receipt written.
 */
export async function writeDeploymentPrescriptionReceipt({
    envPath,
    statePath,
    receiptPath,
    deploymentRunId,
    deployedRevision,
    fsModule = fs,
    now = Date.now
} = {}) {
    if (!envPath || !statePath || !receiptPath || !RUN_ID_PATTERN.test(deploymentRunId ?? '')
        || !/^[0-9a-f]{40}$/.test(deployedRevision ?? '')) {
        throw new Error(
            'receipt requires envPath, statePath, receiptPath, a UUID deploymentRunId, and a full lowercase commit SHA'
        )
    }

    const state   = JSON.parse(await fsModule.readFile(statePath, 'utf8')),
          content = await fsModule.readFile(envPath, 'utf8');

    if (state?.schemaVersion !== SCHEMA_VERSION
        || state?.recordType !== 'deployment-prescription-materialization'
        || state?.deploymentRunId !== deploymentRunId
        || !Array.isArray(state.activePrescriptions)
        || !/^[0-9a-f]{64}$/.test(state.materializedDigest ?? '')) {
        throw new Error('materialization state is malformed; refusing a delivery receipt')
    }

    if (digest(content) !== state.materializedDigest) {
        throw new Error('persistent env changed after materialization; refusing a false delivery receipt')
    }

    const receipt = {
        schemaVersion      : SCHEMA_VERSION,
        recordType         : 'deployment-prescription-delivery-receipt',
        status             : 'delivered',
        deploymentRunId,
        deliveredAt        : new Date(now()).toISOString(),
        deployedRevision,
        materializedAt     : state.materializedAt,
        materializedDigest : state.materializedDigest,
        activePrescriptions: state.activePrescriptions
    };

    await writeAtomicFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, fsModule);

    return receipt
}

/**
 * @summary Parses the three CLI modes with strict known-flag handling.
 * @param {String[]} argv
 * @returns {Object}
 */
export function parseArgs(argv) {
    const [mode, ...rest] = argv,
          knownModes      = new Set(['append', 'materialize', 'receipt']),
          flags           = {};

    if (!knownModes.has(mode)) {
        throw new Error(`first argument must be append, materialize, or receipt (received ${mode || '<none>'})`)
    }

    for (let index = 0; index < rest.length; index++) {
        const flag = rest[index];

        if (flag === '--adopt-existing-env') {
            flags.adoptExistingEnv = true;
            continue
        }

        if (!flag.startsWith('--') || rest[index + 1] === undefined || rest[index + 1].startsWith('--')) {
            throw new Error(`flag ${flag} requires a value`)
        }

        const key = flag.slice(2).replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

        if (![
            'ledger', 'env', 'state', 'projectEnv', 'receipt', 'deployedRevision', 'runId',
            'composeProject',
            'id', 'knob', 'target', 'values', 'context', 'observedAt', 'supersedes',
            'diagnosisId', 'recoveryRunId'
        ].includes(key)) {
            throw new Error(`unknown flag: ${flag}`)
        }

        flags[key] = rest[++index]
    }

    return {mode, ...flags}
}

/**
 * @summary Parses a CLI JSON object with a bounded field-specific failure.
 * @param {String} raw
 * @param {String} field
 * @returns {Object}
 * @private
 */
function parseObject(raw, field) {
    let value;

    try {
        value = JSON.parse(raw)
    } catch {
        throw new Error(`${field} must be valid JSON`)
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${field} must be a JSON object`)
    }

    return value
}

/**
 * @summary Runs one operator CLI mode, returning a process exit code.
 * @param {String[]} [argv]
 * @returns {Promise<Number>}
 */
export async function main(argv = process.argv.slice(2)) {
    try {
        const options         = parseArgs(argv),
              ledgerPath      = options.ledger || path.join(DEFAULT_ROOT, 'prescriptions.jsonl'),
              envPath         = options.env    || path.join(DEFAULT_ROOT, 'active.env'),
              deploymentRunId = options.runId,
              statePath       = options.state || (deploymentRunId
                  ? path.join(DEFAULT_ROOT, `materialized-state.${deploymentRunId}.json`)
                  : null);

        if (options.mode === 'append') {
            if (!options.id || !options.knob || !options.target || !options.values
                || !options.context || !options.observedAt) {
                throw new Error('append requires --id, --knob, --target, --values, --context, and --observed-at')
            }

            const observedAt = Number(options.observedAt);

            if (!Number.isFinite(observedAt)) {
                throw new Error('--observed-at must be a finite numeric watermark')
            }

            const result = await appendDeploymentPrescription({
                ledgerPath,
                producerPrincipal: 'operator-local',
                prescription     : {
                    prescriptionId          : options.id,
                    supersedesPrescriptionId: options.supersedes || null,
                    diagnosisId             : options.diagnosisId || null,
                    recoveryRunId           : options.recoveryRunId || null,
                    targetIdentity          : {kind: 'compose-service', id: options.target},
                    knob                    : options.knob,
                    values                  : parseObject(options.values, '--values'),
                    validatedAgainst        : {
                        context   : parseObject(options.context, '--context'),
                        observedAt
                    }
                }
            });

            if (!result.appended && !result.replayed) {
                throw new Error(`append refused: ${result.reason}`)
            }

            console.log(JSON.stringify({
                status        : result.replayed ? 'replayed' : 'appended',
                prescriptionId: result.record.prescriptionId,
                sequence      : result.record.sequence
            }));

            return 0
        }

        if (options.mode === 'materialize') {
            if (!options.composeProject || !deploymentRunId) {
                throw new Error(
                    'materialize requires --compose-project and --run-id for fresh, run-bound revalidation'
                )
            }

            const result = await materializeDeploymentPrescriptions({
                ledgerPath,
                envPath,
                statePath,
                deploymentRunId,
                projectEnvPath  : options.projectEnv || path.resolve('ai/deploy/.env'),
                adoptExistingEnv: Boolean(options.adoptExistingEnv),
                resolveContext  : record => resolveDeploymentRuntimeContext(record, {
                    composeProject: options.composeProject
                })
            });

            console.log(JSON.stringify(result));
            return 0
        }

        if (!deploymentRunId) {
            throw new Error('receipt requires --run-id')
        }

        const receipt = await writeDeploymentPrescriptionReceipt({
            envPath,
            statePath,
            receiptPath     : options.receipt
                || path.join(DEFAULT_ROOT, `delivery-receipt.${deploymentRunId}.json`),
            deploymentRunId,
            deployedRevision: options.deployedRevision || process.env.NEO_REVISION
        });

        console.log(JSON.stringify({
            status            : receipt.status,
            deploymentRunId   : receipt.deploymentRunId,
            deployedRevision  : receipt.deployedRevision,
            activeCount       : receipt.activePrescriptions.length,
            materializedDigest: receipt.materializedDigest
        }));

        return 0
    } catch (error) {
        console.error(`[deployment-prescriptions] FATAL: ${error.message}`);
        return 1
    }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
    process.exitCode = await main()
}
