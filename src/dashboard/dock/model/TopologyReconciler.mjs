import Base              from '../../../core/Base.mjs';
import Persistence       from './Persistence.mjs';
import WorkspaceDocument from './WorkspaceDocument.mjs';
import RestorePlanner    from '../persistence/RestorePlanner.mjs';

/**
 * @class Neo.dashboard.dock.model.TopologyReconciler
 * @extends Neo.core.Base
 *
 * @summary Reconciles a persisted keyed topology toward currently registered workspace documents.
 *
 * `workspaceKey` is the durable identity. There is no positional extraction, shape-affinity
 * assignment, or registration-order fallback: a captured key either reaches the same semantic
 * participant or produces a key-named remainder. Excess live workspaces remain reference-identical.
 * Every input is validated before proposals run, and no live document is mutated in place.
 */
class TopologyReconciler extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.model.TopologyReconciler'
         * @protected
         */
        className: 'Neo.dashboard.dock.model.TopologyReconciler'
    }

    /** @member {String} REASON_APPLY_ERROR='apply-error' @static */
    static REASON_APPLY_ERROR = 'apply-error'

    /** @member {String} REASON_NO_LIVE_WORKSPACE='no-live-workspace' @static */
    static REASON_NO_LIVE_WORKSPACE = 'no-live-workspace'

    /** @member {String} REASON_VALIDATION_FAILED='validation-failed' @static */
    static REASON_VALIDATION_FAILED = 'validation-failed'

    /**
     * @summary Validates the live workspace record and its cross-workspace item ownership.
     * @param {Object<String,Object>} workspaces
     * @returns {String[]}
     * @protected
     * @static
     */
    static validateLiveWorkspaces(workspaces) {
        if (!WorkspaceDocument.isJsonRecord(workspaces)) {
            return ['live workspaces must be a JSON object keyed by workspaceKey']
        }

        let errors = [],
            owners = new Map();

        for (const [workspaceKey, document] of Object.entries(workspaces)) {
            if (!workspaceKey.trim() || Persistence.unsafeRecordKeys.has(workspaceKey)) {
                errors.push(`live workspace key "${workspaceKey}" is not usable`);
                continue
            }

            const documentErrors = WorkspaceDocument.validate(document),
                  unexpected     = WorkspaceDocument.findUnexpectedDockZoneKey(
                      document,
                      `liveWorkspaces.${workspaceKey}`
                  );

            errors.push(...documentErrors.map(error => `live workspace "${workspaceKey}": ${error}`));

            if (unexpected) {
                errors.push(
                    `live workspace "${workspaceKey}" contains unexpected field "${unexpected.key}" ` +
                    `at ${unexpected.path}: ${unexpected.reason}`
                )
            }

            Object.keys(document?.items || {}).forEach(itemId => {
                if (owners.has(itemId)) {
                    errors.push(
                        `live workspaces "${owners.get(itemId)}" and "${workspaceKey}" both carry item "${itemId}"`
                    )
                } else {
                    owners.set(itemId, workspaceKey)
                }
            })
        }

        return errors
    }

    /**
     * @summary Builds the fail-closed result used by every envelope/live validation refusal.
     * @param {Object} topology
     * @param {Object<String,Object>} liveWorkspaces
     * @param {String[]} errors
     * @returns {Object}
     * @protected
     * @static
     */
    static validationFailure(topology, liveWorkspaces, errors) {
        const captured = WorkspaceDocument.isJsonRecord(topology?.workspaces) ? topology.workspaces : {},
              live     = WorkspaceDocument.isJsonRecord(liveWorkspaces) ? liveWorkspaces : {};

        return {
            applied      : [],
            displaced    : [],
            errors,
            restored     : [],
            unmatchedLive: Object.keys(live),
            unrestored   : Object.entries(captured).flatMap(([workspaceKey, document]) =>
                Object.keys(document?.items || {}).map(itemId => ({
                    workspaceKey,
                    itemId,
                    reason: this.REASON_VALIDATION_FAILED
                }))),
            workspaces: live
        }
    }

    /**
     * @summary Reconciles captured documents against live participants with exact key matching.
     *
     * Same-shape documents use the landed restore planner so semantic changes can apply
     * incrementally. The planner's declared `topology-fingerprint-mismatch` is the one wholesale
     * adoption path; every other deferral stays visible in `unrestored`. A missing participant is
     * never guessed by shape and never auto-created here.
     *
     * @param {Object} savedTopology A validated `neo.dock.topology.v1` record.
     * @param {Object<String,Object>} [liveWorkspaces={}] Current documents keyed by workspaceKey.
     * @returns {{
     *     applied: Object[],
     *     displaced: Object[],
     *     errors: String[],
     *     restored: Object[],
     *     unmatchedLive: String[],
     *     unrestored: Object[],
     *     workspaces: Object<String,Object>
     * }}
     * @static
     */
    static reconcile(savedTopology, liveWorkspaces={}) {
        const restoredTopology = Persistence.restoreTopology(savedTopology ?? {}),
              errors           = [
                  ...restoredTopology.errors,
                  ...TopologyReconciler.validateLiveWorkspaces(liveWorkspaces)
              ];

        if (errors.length) {
            return TopologyReconciler.validationFailure(savedTopology, liveWorkspaces, errors)
        }

        const captured      = restoredTopology.topology.workspaces,
              workspaces    = {...liveWorkspaces},
              applied       = [],
              displaced     = [],
              restored      = [],
              unrestored    = [],
              unmatchedLive = Object.keys(liveWorkspaces)
                  .filter(workspaceKey => !Object.hasOwn(captured, workspaceKey));

        const reportWorkspace = (workspaceKey, reason) => {
            Object.keys(captured[workspaceKey].items || {}).forEach(itemId => {
                unrestored.push({workspaceKey, itemId, reason})
            })
        };

        for (const [workspaceKey, capturedDocument] of Object.entries(captured)) {
            if (!Object.hasOwn(liveWorkspaces, workspaceKey)) {
                reportWorkspace(workspaceKey, TopologyReconciler.REASON_NO_LIVE_WORKSPACE);
                continue
            }

            const liveDocument = liveWorkspaces[workspaceKey],
                  result       = RestorePlanner.restoreToward(liveDocument, capturedDocument),
                  capturedIds  = Object.keys(capturedDocument.items || {});

            if (result.deferred && result.reason === 'topology-fingerprint-mismatch') {
                const capturedSet = new Set(capturedIds);

                Object.keys(liveDocument.items || {}).forEach(itemId => {
                    if (!capturedSet.has(itemId)) {
                        displaced.push({workspaceKey, itemId})
                    }
                });

                workspaces[workspaceKey] = WorkspaceDocument.clone(capturedDocument);
                applied.push({workspaceKey, applied: 0, mode: 'adopt'});
                restored.push(...capturedIds.map(itemId => ({workspaceKey, itemId})))
            } else if (result.deferred) {
                reportWorkspace(workspaceKey, result.reason)
            } else if (result.errors.length) {
                errors.push(`workspace "${workspaceKey}": ${result.errors[0]}`);
                reportWorkspace(workspaceKey, TopologyReconciler.REASON_APPLY_ERROR)
            } else {
                workspaces[workspaceKey] = result.document;
                applied.push({workspaceKey, applied: result.applied, mode: 'incremental'});
                restored.push(...capturedIds.map(itemId => ({workspaceKey, itemId})))
            }
        }

        // A captured record is internally unique and the live record is internally unique, but a
        // captured item may still collide with an EXCESS live workspace. A partial answer would
        // duplicate ownership, so the complete candidate is checked once more before it can leave.
        const finalOwners = new Map(),
              finalErrors = [];

        Object.entries(workspaces).forEach(([workspaceKey, document]) => {
            Object.keys(document.items || {}).forEach(itemId => {
                if (finalOwners.has(itemId)) {
                    finalErrors.push(
                        `reconciled workspaces "${finalOwners.get(itemId)}" and "${workspaceKey}" both carry item "${itemId}"`
                    )
                } else {
                    finalOwners.set(itemId, workspaceKey)
                }
            })
        });

        if (finalErrors.length) {
            return TopologyReconciler.validationFailure(savedTopology, liveWorkspaces, finalErrors)
        }

        return {applied, displaced, errors, restored, unmatchedLive, unrestored, workspaces}
    }
}

export default Neo.setupClass(TopologyReconciler);
