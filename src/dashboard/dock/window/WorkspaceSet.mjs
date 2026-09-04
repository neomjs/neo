/**
 * @summary Pure worker-owned workspace-set registry — the `{workspaceId → document}` composition
 * of the docking design record (§2.1 workspace topology; §2.8.3 vessel lifecycle;
 * `learn/agentos/decisions/0029-docking-design.md`).
 *
 * A workspace is one dock-zone document owned by one workspace container; multi-window
 * composition registers each vessel's document under a STABLE workspace id. This registry is that
 * composition's single source of resolution: cross-window participations resolve foreign
 * documents through it, and an atomic transfer's committed pair is adopted through it —
 * both-or-neither, mirroring the executor's commit-or-neither contract at the ownership tier.
 *
 * Boundary discipline (the §2.1 state-class table, binding):
 * - **Worker-owned shared truth only.** Entries carry document accessors keyed by semantic
 *   workspace identity. `windowId`, screen geometry, and projection state NEVER enter this
 *   registry — a window is a render target, not a state owner, and runtime window identity is
 *   never persisted workspace identity.
 * - **Retirement is an explicit owner decision.** Closing a vessel unbinds a render target; it
 *   does not delete worker documents — so this registry never auto-retires an entry. Whether an
 *   emptied workspace-set entry is retained or retired is decided and named separately by the
 *   reintegration tier (§2.8.3).
 * - **Projection choreography stays with the owner.** The registry answers "whose document, and
 *   what is it now" — reconcile ordering, generation guards, and render-target sync remain the
 *   workspace container's own contract.
 *
 * Dependency-free by design — closure state, injected accessor seams — so witnesses drive the
 * full registry contract without a browser or a model import.
 */

/**
 * Creates one worker-owned workspace-set registry.
 * @returns {Object} workspaceSet
 * @returns {Function} workspaceSet.adoptTransfer  `({sourceWorkspaceId, sourceDocument, targetWorkspaceId, targetDocument})` both-or-neither pair adoption; Boolean.
 * @returns {Function} workspaceSet.getDocument    `(workspaceId)` → the entry's current document, or `null` (fail closed).
 * @returns {Function} workspaceSet.has            `(workspaceId)` → Boolean.
 * @returns {Function} workspaceSet.ids            `()` → registered workspace ids.
 * @returns {Function} workspaceSet.register       `(workspaceId, {getDocument, setDocument})` registers-or-replaces an entry; Boolean.
 * @returns {Number}   workspaceSet.size           Registered entry count.
 * @returns {Function} workspaceSet.unregister     `(workspaceId)` explicit retirement; Boolean.
 */
export function createDockWorkspaceSet() {
    const entries = new Map();

    return {
        get size() {
            return entries.size
        },

        /**
         * Adopts an atomically-committed document pair into both owning entries — or neither.
         * Fail-closed preconditions, all checked BEFORE the first write: distinct source and
         * target ids, both entries registered, both writable.
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
                source = entries.get(sourceWorkspaceId),
                target = entries.get(targetWorkspaceId);

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
         * Adopts one committed document per registered workspace, in `ids()` order — the slot
         * order a topology perspective was captured in.
         *
         * All-or-nothing, like {@link #adoptTransfer} one arity up: a slot count that does not
         * match the registry, a missing document, or a read-only entry refuses before anything is
         * written, and a throw mid-write rolls every earlier slot back to the document it replaced.
         * A partially adopted topology is a composition no capture could have produced.
         * @param {Object[]} documents Slot-ordered committed documents, primary first.
         * @returns {Boolean} true when every slot adopted
         */
        adoptAll(documents) {
            const ids = [...entries.keys()];

            if (
                !Array.isArray(documents) || documents.length !== ids.length ||
                documents.some(document => !document) ||
                ids.some(workspaceId => !entries.get(workspaceId).setDocument)
            ) {
                return false
            }

            const written = [];

            for (let index = 0; index < ids.length; index++) {
                const entry = entries.get(ids[index]);

                written.push([entry, entry.getDocument()]);

                try {
                    entry.setDocument(documents[index])
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
         * @returns {Object|null} the entry's current document, or null (fail closed)
         */
        getDocument(workspaceId) {
            return entries.get(workspaceId)?.getDocument() ?? null
        },

        /**
         * @param {String} workspaceId
         * @returns {Boolean}
         */
        has(workspaceId) {
            return entries.has(workspaceId)
        },

        /**
         * @returns {String[]}
         */
        ids() {
            return [...entries.keys()]
        },

        /**
         * Registers-or-replaces one workspace entry. Replacement is deliberate: a re-embodied
         * vessel re-registers the SAME stable workspace id with fresh accessor seams, and the
         * stale seams must not survive it.
         * @param {String} workspaceId Stable semantic identity — never a `windowId`.
         * @param {Object} seams
         * @param {Function} seams.getDocument `()` → the workspace's current committed document.
         * @param {Function} [seams.setDocument] `(document)` adopts a committed document; an
         *     entry without one is read-only to `adoptTransfer` (fail closed).
         * @returns {Boolean} true when registered
         */
        register(workspaceId, {getDocument, setDocument} = {}) {
            if (!workspaceId || typeof workspaceId !== 'string' || typeof getDocument !== 'function') {
                return false
            }

            entries.set(workspaceId, {
                getDocument,
                setDocument: typeof setDocument === 'function' ? setDocument : null
            });
            return true
        },

        /**
         * Explicit entry retirement — never invoked by the registry itself (see the class
         * summary's vessel-lifecycle boundary).
         * @param {String} workspaceId
         * @returns {Boolean} true when an entry was removed
         */
        unregister(workspaceId) {
            return entries.delete(workspaceId)
        }
    }
}
