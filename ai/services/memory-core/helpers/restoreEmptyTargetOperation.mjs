import {
    deriveRestoreTargetSetIdentity,
    RESTORE_EMPTY_TARGET_ACTION,
    RESTORE_TARGET_ROLES
} from './restoreTargetSetContract.mjs';
import {
    createRestoreTargetSetReceipt,
    isRestoreTargetSetCommitted,
    RESTORE_TARGET_SET_TERMINALS
} from './restoreTargetSetStateStore.mjs';

/**
 * @module ai/services/memory-core/helpers/restoreEmptyTargetOperation
 * @summary Fenced, crash-resumable controller for the exact
 * `restore-empty-target` action.
 *
 * Store-specific staging and promotion mechanics are injected. This controller
 * owns ordering, strict transitions, forward-only reconciliation, and the
 * committed-only eligibility boundary.
 */

const PROMOTION_STATES = Object.freeze({
    memories : 'promoted:memories',
    summaries: 'promoted:summaries',
    graph    : 'promoted:graph'
});

/**
 * @summary Creates the actuator operation consumed by `dispatchHeal`.
 *
 * @param {Object} collaborators
 * @param {Function} collaborators.withWriterFence `async (identity, task)`.
 * @param {Function} collaborators.inspectFreshTargetSet Under-fence production proof.
 * @param {Function} collaborators.stageTargetSet Creates/loads isolated staging.
 * @param {Function} collaborators.validateStagedTargetSet Validates all staged targets.
 * @param {Function} collaborators.promoteComponent Ordered per-role promotion.
 * @param {Function} collaborators.revalidateProductionTargetSet Complete post-promotion validation.
 * @param {Function} collaborators.reconcileAttempt Resume proof for an existing nonterminal ledger.
 * @param {Function} collaborators.cleanupUnpromotedStaging Deletes only run-owned unpromoted staging.
 * @param {Function} [collaborators.cleanupCommittedArtifacts=async()=>{}] Best-effort
 * cleanup of run-owned parking/staging after strict commit.
 * @param {Function} collaborators.readTransitions Strict ledger reader.
 * @param {Function} collaborators.appendTransition Strict ledger appender.
 * @param {Function} [collaborators.clock=Date.now] Injected live clock.
 * @returns {Function} Heal operation.
 */
export function createRestoreEmptyTargetOperation({
    withWriterFence,
    inspectFreshTargetSet,
    stageTargetSet,
    validateStagedTargetSet,
    promoteComponent,
    revalidateProductionTargetSet,
    reconcileAttempt,
    cleanupUnpromotedStaging,
    cleanupCommittedArtifacts = async () => {},
    readTransitions,
    appendTransition,
    clock = Date.now
} = {}) {
    const required = {
        withWriterFence,
        inspectFreshTargetSet,
        stageTargetSet,
        validateStagedTargetSet,
        promoteComponent,
        revalidateProductionTargetSet,
        reconcileAttempt,
        cleanupUnpromotedStaging,
        cleanupCommittedArtifacts,
        readTransitions,
        appendTransition,
        clock
    };

    for (const [name, value] of Object.entries(required)) {
        if (typeof value !== 'function') {
            throw new TypeError(`createRestoreEmptyTargetOperation: ${name} must be a function`)
        }
    }

    return async function restoreEmptyTarget({
        targetSet,
        recoveryUnitKey,
        attemptFingerprint
    } = {}) {
        const identity = deriveRestoreTargetSetIdentity(targetSet);

        if (identity.recoveryUnitKey !== recoveryUnitKey ||
            identity.attemptFingerprint !== attemptFingerprint) {
            throw new Error('restore-empty-target dispatch identity does not match the canonical target set')
        }

        const context = {
            action    : RESTORE_EMPTY_TARGET_ACTION,
            descriptor: identity.descriptor,
            targetSet,
            recoveryUnitKey,
            attemptFingerprint
        };

        return withWriterFence({
            recoveryUnitKey,
            attemptFingerprint
        }, async () => executeUnderFence({
            context,
            inspectFreshTargetSet,
            stageTargetSet,
            validateStagedTargetSet,
            promoteComponent,
            revalidateProductionTargetSet,
            reconcileAttempt,
            cleanupUnpromotedStaging,
            cleanupCommittedArtifacts,
            readTransitions,
            appendTransition,
            clock
        }))
    }
}

async function executeUnderFence({
    context,
    inspectFreshTargetSet,
    stageTargetSet,
    validateStagedTargetSet,
    promoteComponent,
    revalidateProductionTargetSet,
    reconcileAttempt,
    cleanupUnpromotedStaging,
    cleanupCommittedArtifacts,
    readTransitions,
    appendTransition,
    clock
}) {
    let   transitions  = await readTransitions(context);
    let   latest       = transitions.at(-1)?.state ?? null;
    const isNewAttempt = transitions.length === 0;

    if (RESTORE_TARGET_SET_TERMINALS.includes(latest)) {
        return outcomeFromTransitions({context, transitions})
    }

    let staging          = null;
    let validationResult = null;
    let promotionStarted = latest?.startsWith('promoted:') || latest === 'validated';

    try {
        if (latest === null) {
            await append('admitted', {
                bundleManifestFingerprint     : context.descriptor.bundleManifestFingerprint,
                admissionDescriptorFingerprint: context.descriptor.admissionDescriptorFingerprint
            });
            latest = 'admitted';
        }

        if (latest === 'interrupted') {
            await append('fenced', {resumed: true});
            latest = 'fenced';
        } else if (latest === 'admitted') {
            await append('fenced', {resumed: false});
            latest = 'fenced';
        }

        if (!isNewAttempt) {
            const reconciliation = await reconcileAttempt({
                ...context,
                transitions
            });

            if (!reconciliation?.safe) {
                await append('failed-contained', {
                    reason       : boundedText(reconciliation?.reason || 'reconciliation could not prove the ledger/storage boundary'),
                    observedState: reconciliation?.observedState ?? null,
                    ledgerState  : latest
                });
                return outcomeFromTransitions({
                    context,
                    transitions,
                    failure: new Error(reconciliation?.reason || 'restore target-set reconciliation failed')
                })
            }

            staging = reconciliation.staging ?? null;
        }

        if (latest === 'fenced') {
            const freshProof = await inspectFreshTargetSet(context);

            if (freshProof?.destinationTopologyFingerprint !== context.descriptor.destinationTopologyFingerprint) {
                await append('deferred-target-not-empty', {
                    reason                     : 'destination-topology-fingerprint-mismatch',
                    observedTopologyFingerprint: freshProof?.destinationTopologyFingerprint ?? null
                });
                return outcomeFromTransitions({context, transitions})
            }
            if (freshProof?.fresh !== true) {
                await append('deferred-target-not-empty', {
                    reason: boundedText(freshProof?.reason || 'target set is not seed-aware empty')
                });
                return outcomeFromTransitions({context, transitions})
            }

            staging = await stageTargetSet(context);
            validationResult = await validateStagedTargetSet({
                ...context,
                staging
            });

            if (validationResult?.valid !== true) {
                throw createPhaseError('staged-target-set-invalid', validationResult?.reason || 'staged target-set validation failed')
            }

            await append('staged', {
                componentFingerprints: validationResult.componentFingerprints ?? null
            });
            latest = 'staged';
        }

        for (const role of RESTORE_TARGET_ROLES) {
            const state = PROMOTION_STATES[role];

            if (hasState(transitions, state)) {
                promotionStarted = true;
                continue
            }

            promotionStarted = true;
            const promotion = await promoteComponent({
                ...context,
                staging,
                role,
                transitions
            });

            await append(state, {
                fingerprint: promotion?.fingerprint ?? null,
                count      : promotion?.count ?? null
            });
            latest = state;
        }

        if (latest !== 'validated') {
            validationResult = await revalidateProductionTargetSet({
                ...context,
                staging,
                transitions
            });

            if (validationResult?.valid !== true) {
                throw createPhaseError('production-target-set-invalid', validationResult?.reason || 'production target-set validation failed')
            }

            await append('validated', {
                componentFingerprints: validationResult.componentFingerprints ?? null
            });
            latest = 'validated';
        }

        await append('committed', {
            serviceEligible: true
        });

        const outcome = outcomeFromTransitions({
            context,
            transitions,
            validationResult
        })

        try {
            await cleanupCommittedArtifacts({
                ...context,
                staging,
                transitions
            })
        } catch {
            // Strict `committed` is already durable. Run-owned artifact cleanup is
            // best-effort observability debt and cannot revoke completion.
        }

        return outcome
    } catch (error) {
        if (isRestoreTargetSetCommitted(transitions)) {
            return outcomeFromTransitions({context, transitions, validationResult})
        }

        try {
            if (promotionStarted) {
                const current = transitions.at(-1)?.state;
                if (!RESTORE_TARGET_SET_TERMINALS.includes(current)) {
                    await append('failed-contained', {
                        reason: boundedText(error.message),
                        code  : error.code ?? 'restore-target-set-failed-after-promotion'
                    })
                }
            } else {
                await cleanupUnpromotedStaging({
                    ...context,
                    staging,
                    transitions
                });

                const current = transitions.at(-1)?.state;
                if (!RESTORE_TARGET_SET_TERMINALS.includes(current)) {
                    await append('interrupted', {
                        reason    : boundedText(error.message),
                        resumeFrom: current
                    })
                }
            }
        } catch (settlementError) {
            error.settlementError = settlementError
        }

        throw error
    }

    async function append(state, details) {
        const transition = await appendTransition({
            ...context,
            state,
            at: getTimestamp(clock),
            details
        });

        transitions = [...transitions, transition]
        return transition
    }
}

function outcomeFromTransitions({
    context,
    transitions,
    validationResult = null,
    failure = null
}) {
    const receipt = createRestoreTargetSetReceipt({
        transitions,
        recoveryUnitKey   : context.recoveryUnitKey,
        attemptFingerprint: context.attemptFingerprint,
        descriptor        : context.descriptor,
        validationResult,
        failure
    });

    return {
        status: receipt.terminal ?? 'interrupted',
        detail: receipt
    }
}

function hasState(transitions, state) {
    return transitions.some(transition => transition.state === state)
}

function getTimestamp(clock) {
    const value = clock();
    if (!Number.isFinite(value) || value < 0) {
        throw new TypeError('restore-empty-target clock must return a non-negative finite epoch millisecond')
    }
    return value
}

function createPhaseError(code, message) {
    const error = new Error(message);
    error.code  = code;
    return error
}

function boundedText(value) {
    return String(value).slice(0, 500)
}
