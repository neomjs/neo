/**
 * @summary The dock adapter over a Group's participant membership — the `{workspaceId → document}`
 * composition of the docking design record (§2.1 workspace topology; §2.8.3 vessel lifecycle;
 * `learn/agentos/decisions/0029-docking-design.md`), resolved through `Neo.manager.Transaction`.
 *
 * A workspace is one dock-zone document owned by one workspace container; multi-window composition
 * registers each vessel's document under a STABLE workspace id. That membership lives in the host's
 * topology Group: the manager holds the participants, this adapter phrases them as the dock's
 * registry and adds the dock's own adoption semantics — cross-window participations resolve foreign
 * documents through it, and an atomic transfer's committed pair is adopted through it, both-or-neither,
 * mirroring the executor's commit-or-neither contract at the ownership tier.
 *
 * Boundary discipline (the §2.1 state-class table, binding):
 * - **No registry of its own.** The adapter keeps no entry map: every registration, lookup and count
 *   is the Group's. Before the host's window has bound there is no Group and so no membership —
 *   registration is refused and every lookup fails closed. A host that imports the manager is
 *   admitted at app registration, before its workspace constructs, so this is the exception path.
 * - **Worker-owned shared truth only.** Participants carry document accessors keyed by semantic
 *   workspace identity. `windowId`, screen geometry, and projection state NEVER enter the Group as
 *   membership — a window is a render target, not a state owner, and runtime window identity is
 *   never persisted workspace identity.
 * - **Membership is separate from binding.** Closing a vessel unbinds a render target; it does not
 *   delete worker documents — a participant lives while its Group does, and a Group holding
 *   participants is never empty. Whether an emptied entry is retained or retired is decided and
 *   named by the reintegration tier (§2.8.3), through {@link #unregister}.
 * - **Projection choreography stays with the owner.** The adapter answers "whose document, and what
 *   is it now" — reconcile ordering, generation guards, and render-target sync remain the workspace
 *   container's own contract.
 *
 * Dependency-free beyond its two seams — the manager and the Group resolver are injected — so
 * witnesses drive the full contract without a browser or a model import.
 */

/**
 * Creates the dock's view of one Group's participant membership.
 * @param {Object} seams
 * @param {Neo.manager.Transaction} seams.manager The worker-wide topology manager.
 * @param {Function} seams.getGroupId `() => String|null` — the host's Group, `null` while its window has not bound.
 * @returns {Object} workspaceSet
 * @returns {Function} workspaceSet.adoptAll       `(workspaces)` all-or-nothing adoption of one document per registered key; Boolean.
 * @returns {Function} workspaceSet.adoptTransfer  `({sourceWorkspaceId, sourceDocument, targetWorkspaceId, targetDocument})` both-or-neither pair adoption; Boolean.
 * @returns {Function} workspaceSet.getDocument    `(workspaceId)` → the participant's current document, or `null` (fail closed).
 * @returns {Function} workspaceSet.has            `(workspaceId)` → Boolean.
 * @returns {Function} workspaceSet.ids            `()` → registered workspace ids.
 * @returns {Function} workspaceSet.register       `(workspaceId, {getDocument, setDocument})` registers-or-replaces a participant; Boolean.
 * @returns {Number}   workspaceSet.size           Registered participant count.
 * @returns {Function} workspaceSet.unregister     `(workspaceId)` explicit retirement; Boolean.
 */
export function createDockWorkspaceSet({manager, getGroupId}) {
    const
        groupId     = () => getGroupId?.() ?? null,
        participant = workspaceId => {
            const id = groupId();

            return id ? manager.getParticipant(id, workspaceId) : null
        },
        keys        = () => {
            const id = groupId();

            return id ? manager.participantKeys(id) : []
        };

    return {
        get size() {
            return keys().length
        },

        /**
         * Adopts an atomically-committed document pair into both owning participants — or neither.
         * Fail-closed preconditions, all checked BEFORE the first write: distinct source and
         * target ids, both participants registered, both writable.
         *
         * Both-or-neither against THROWING writers holds by two-sided compensation: BOTH previous
         * documents are captured before the first write, and either write failing compensates
         * every writer already invoked — in reverse order, each re-invoked with its prior
         * document under a guard. The compensation is deliberately re-invocation: a writer that
         * BREACHES its accessor contract by mutating before it throws is restored by the same
         * assignment landing again with the prior document (the breach's own mutation ordering
         * is what makes the compensation stick), while a writer that throws without mutating
         * makes the compensating call a guarded no-op. The original error always propagates —
         * the owner's failure stays observable. Residual, stated: a writer that defeats BOTH
         * the write and the compensating re-invocation (throwing before any mutation on both
         * calls while still having mutated externally) has broken its accessor contract twice;
         * its own state is its breach, and the pair's other side is still restored.
         * @param {Object} data
         * @param {Object} data.sourceDocument
         * @param {String} data.sourceWorkspaceId
         * @param {Object} data.targetDocument
         * @param {String} data.targetWorkspaceId
         * @returns {Boolean} true when both documents were adopted
         */
        adoptTransfer({sourceDocument, sourceWorkspaceId, targetDocument, targetWorkspaceId}) {
            const
                source = participant(sourceWorkspaceId),
                target = participant(targetWorkspaceId);

            if (
                sourceWorkspaceId === targetWorkspaceId ||
                !sourceDocument || !targetDocument      ||
                !source?.setDocument || !target?.setDocument
            ) {
                return false
            }

            const
                previousSourceDocument = source.getDocument(),
                previousTargetDocument = target.getDocument(),
                compensate             = (entry, document) => {
                    try {
                        entry.setDocument(document)
                    } catch (compensationError) {
                        // best-effort by construction: the original failure below still
                        // propagates, and a writer failing its own compensation is the
                        // documented double-breach residual
                    }
                };

            try {
                source.setDocument(sourceDocument)
            } catch (error) {
                compensate(source, previousSourceDocument);
                throw error
            }

            try {
                target.setDocument(targetDocument)
            } catch (error) {
                compensate(target, previousTargetDocument);
                compensate(source, previousSourceDocument);
                throw error
            }

            return true
        },

        /**
         * Adopts one committed document per registered workspace key.
         *
         * All-or-nothing, like {@link #adoptTransfer} one arity up: the payload must name exactly
         * the registered semantic keys. Object insertion order and registration order never pair a
         * document with its owner. A missing/excess key, missing document, or read-only participant
         * refuses before the first write; a throw mid-write compensates every earlier writer.
         * @param {Object<String,Object>} workspaces Documents keyed by stable workspace identity.
         * @returns {Boolean} true when every workspace adopted its keyed document
         */
        adoptAll(workspaces) {
            const
                isRecord = workspaces !== null && typeof workspaces === 'object' && !Array.isArray(workspaces) &&
                    (Object.getPrototypeOf(workspaces) === Object.prototype || Object.getPrototypeOf(workspaces) === null),
                ids      = keys(),
                entries  = ids.map(workspaceId => participant(workspaceId)),
                names    = isRecord ? Object.keys(workspaces) : [];

            if (
                !isRecord || names.length !== ids.length ||
                names.some(workspaceId => !ids.includes(workspaceId) || !workspaces[workspaceId]) ||
                entries.some((entry, index) => !Object.hasOwn(workspaces, ids[index]) || !entry?.setDocument)
            ) {
                return false
            }

            const written = [];

            for (let index = 0; index < ids.length; index++) {
                const entry = entries[index];

                written.push([entry, entry.getDocument()]);

                try {
                    entry.setDocument(workspaces[ids[index]])
                } catch (error) {
                    written.reverse().forEach(([slot, previous]) => {
                        try {
                            slot.setDocument(previous)
                        } catch (compensationError) {
                            // best-effort by construction, exactly as `adoptTransfer` documents:
                            // the original failure below still propagates, and a writer failing its
                            // own compensation is the documented double-breach residual
                        }
                    });

                    throw error
                }
            }

            return true
        },

        /**
         * @param {String} workspaceId
         * @returns {Object|null} the participant's current document, or null (fail closed)
         */
        getDocument(workspaceId) {
            return participant(workspaceId)?.getDocument() ?? null
        },

        /**
         * @param {String} workspaceId
         * @returns {Boolean}
         */
        has(workspaceId) {
            return participant(workspaceId) !== null
        },

        /**
         * @returns {String[]}
         */
        ids() {
            return keys()
        },

        /**
         * Registers-or-replaces one workspace participant in the host's Group. Replacement is
         * deliberate: a re-embodied vessel re-registers the SAME stable workspace id with fresh
         * accessor seams, and the stale seams must not survive it. Refused while the host has no
         * Group — there is no membership to join yet.
         * @param {String} workspaceId Stable semantic identity — never a `windowId`.
         * @param {Object} seams
         * @param {Function} seams.getDocument `()` → the workspace's current committed document.
         * @param {Function} [seams.setDocument] `(document)` adopts a committed document; a
         *     participant without one is read-only to `adoptTransfer` (fail closed).
         * @returns {Boolean} true when registered
         */
        register(workspaceId, {getDocument, setDocument} = {}) {
            const id = groupId();

            if (!id || !workspaceId || typeof workspaceId !== 'string' || typeof getDocument !== 'function') {
                return false
            }

            return manager.registerParticipant({
                groupId    : id,
                participant: {
                    getDocument,
                    setDocument: typeof setDocument === 'function' ? setDocument : null
                },
                workspaceKey: workspaceId
            })
        },

        /**
         * Explicit participant retirement — never a side effect of a window's binding leaving (see
         * the summary's vessel-lifecycle boundary).
         * @param {String} workspaceId
         * @returns {Boolean} true when a participant was removed
         */
        unregister(workspaceId) {
            const id = groupId();

            return id ? manager.unregisterParticipant({groupId: id, workspaceKey: workspaceId}) : false
        }
    }
}
