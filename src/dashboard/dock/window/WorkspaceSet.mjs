import Base       from '../../../core/Base.mjs';
import Operations from '../model/Operations.mjs';

/**
 * @summary The dock adapter over a Group's participant membership and transaction entry.
 *
 * The Group owns document membership; this adapter owns no registry. Its methods resolve the
 * current Group through the host's live getGroupId seam. A missing Group refuses registration
 * and returns empty lookups. Closing a window does not retire semantic participants.
 *
 * Registration captures the manager, document model and Group identity for its callbacks.
 * Those callbacks belong to the Group and remain usable after the creating adapter is destroyed.
 * The creator releases this Base instance; borrowed popup references do not own its lifetime.
 * Projection stays with the registered document owner and must not admit another semantic write.
 *
 * @class Neo.dashboard.dock.window.WorkspaceSet
 * @extends Neo.core.Base
 */
class WorkspaceSet extends Base {
    static config = {
        /** @member {String} className='Neo.dashboard.dock.window.WorkspaceSet' @protected */
        className: 'Neo.dashboard.dock.window.WorkspaceSet',
        /** @member {Object|null} documentModel=null Pure validate/clone surface required for writes. */
        documentModel: null,
        /** @member {Function|null} getGroupId=null Resolves the host's current Group identity. */
        getGroupId: null,
        /** @member {Neo.manager.Transaction|null} manager=null Worker-wide transaction authority. */
        manager: null
    }

    /**
     * @summary Resolves document-bearing participant keys without retaining an adapter instance.
     * @param {Neo.manager.Transaction} manager
     * @param {String|null} groupId
     * @returns {String[]}
     * @protected
     */
    static getParticipantKeys(manager, groupId) {
        return groupId ? manager.participantKeys(groupId)
            .filter(key => typeof manager.getParticipant(groupId, key)?.getDocument === 'function') : []
    }

    /** @member {Number} size Registered document participant count. */
    get size() {
        return this.ids().length
    }

    /**
     * @summary Resolves the live Group while this adapter owns its host connection.
     * @returns {String|null}
     * @protected
     */
    resolveGroupId() {
        return this.isDestroyed ? null : this.getGroupId?.() ?? null
    }

    /**
     * @summary Resolves a document-bearing participant through the current Group.
     * @param {String} workspaceId
     * @returns {Object|null}
     * @protected
     */
    getParticipant(workspaceId) {
        const id    = this.resolveGroupId(),
              entry = id ? this.manager.getParticipant(id, workspaceId) : null;

        return typeof entry?.getDocument === 'function' ? entry : null
    }

    /**
     * @summary Adopts an atomically-committed document pair into both owning participants — or neither.
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
            source = this.getParticipant(sourceWorkspaceId),
            target = this.getParticipant(targetWorkspaceId);

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
    }

    /**
     * @summary Adopts one committed document per registered workspace key.
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
            ids      = this.ids(),
            entries  = ids.map(workspaceId => this.getParticipant(workspaceId)),
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
    }

    /**
     * @summary Reads the current document of a registered workspace.
     * @param {String} workspaceId
     * @returns {Object|null} the participant's current document, or null (fail closed)
     */
    getDocument(workspaceId) {
        return this.getParticipant(workspaceId)?.getDocument() ?? null
    }

    /**
     * @summary Reports whether the current Group holds this document participant.
     * @param {String} workspaceId
     * @returns {Boolean}
     */
    has(workspaceId) {
        return this.getParticipant(workspaceId) !== null
    }

    /**
     * @summary Lists the current Group's registered document identities.
     * @returns {String[]}
     */
    ids() {
        return this.constructor.getParticipantKeys(this.manager, this.resolveGroupId())
    }

    /**
     * @summary Registers-or-replaces one workspace participant in the host's Group. Replacement is
     * deliberate: a re-embodied vessel re-registers the SAME stable workspace id with fresh
     * accessor seams, and the stale seams must not survive it. Refused while the host has no
     * Group — there is no membership to join yet.
     * @param {String} workspaceId Stable semantic identity — never a `windowId`.
     * @param {Object} seams
     * @param {Function} seams.getDocument `()` → the workspace's current committed document.
     * @param {Function} [seams.setDocument] `(document)` adopts a committed document; a
     *     participant without one is read-only to `adoptTransfer` (fail closed).
     * @param {Function} [seams.getRevision] Owner-supplied revision stamp; otherwise reference changes are counted.
     * @param {Function} [seams.project] Post-commit context includes `preserveItemIds` owned by sibling documents.
     * @param {Function} [seams.dispose] Releases this owner when its Group explicitly retires.
     * @param {String} [seams.bindingKey=workspaceId] Window slot whose generation fences this document.
     * @param {String} [seams.componentId] Opaque live owner lookup; excluded from captured document truth.
     * @returns {Boolean} true when registered
     */
    register(workspaceId, {getDocument, setDocument, getRevision, project, dispose, bindingKey = workspaceId, componentId} = {}) {
        const id                       = this.resolveGroupId(),
              {documentModel, manager} = this;

        if (!id || !workspaceId || typeof workspaceId !== 'string' || typeof getDocument !== 'function' ||
            (getRevision !== undefined && typeof getRevision !== 'function')) {
            return false
        }

        const participantKeys = this.constructor.getParticipantKeys.bind(this.constructor, manager, id);
        let   initialized     = false, lastDocument, revision = 0;

        // Registration never reads a document: the first transaction establishes the reference.
        const observeDocument = () => {
            const value = getDocument();
            if (!getRevision && initialized && value !== lastDocument) revision++;
            initialized = true;
            lastDocument = value;
            return value
        };
        const cloneDocument = value => {
            if (typeof documentModel?.clone !== 'function' || typeof documentModel?.validate !== 'function') {
                throw new TypeError('WorkspaceSet transactions require an injected documentModel')
            }
            return documentModel.clone(value)
        };
        const entry = {
            domain     : 'dock',
            getDocument,
            setDocument: typeof setDocument === 'function' ? setDocument : null,
            capture    : () => ({
                value     : observeDocument(),
                generation: manager.getBinding(id, bindingKey)?.generation || 0,
                revision  : getRevision ? getRevision() : revision
            }),
            prepare: (input, captured, context) => {
                let candidate = input;
                if (input.transfer) {
                    const descriptor = input.transfer;
                    const result     = Operations[descriptor.operation](context.valuesBefore[descriptor.sourceWorkspaceId],
                        context.valuesBefore[descriptor.targetWorkspaceId], descriptor);
                    if (result.errors.length) throw new TypeError(result.errors.join('; '));
                    candidate = workspaceId === descriptor.sourceWorkspaceId ? result.sourceDocument : result.targetDocument
                }
                if (Array.isArray(input.operations)) {
                    candidate = captured.value;
                    for (const descriptor of input.operations) {
                        const result = Operations.applyOperation(candidate, descriptor);
                        if (result.errors.length) throw new TypeError(result.errors.join('; '));
                        candidate = result.document
                    }
                }
                candidate = cloneDocument(candidate);
                const errors = documentModel.validate(candidate);
                if (errors.length) throw new TypeError(`invalid dock document: ${errors.join('; ')}`);
                return candidate
            }
        };

        if (entry.setDocument) {
            entry.adopt = (candidate, context) => {
                const result = setDocument(cloneDocument(candidate), context);
                if (result === false || result?.then) return result;
                observeDocument();
                return result
            };
            entry.compensate = (captured, context) => {
                const result = setDocument(cloneDocument(captured.value), context);
                if (result === false || result?.then) return result;
                lastDocument = getDocument();
                initialized = true;
                if (!getRevision) revision = captured.revision;
                return result
            }
        }

        if (typeof project === 'function') entry.project = context => project({
            ...context,
            preserveItemIds: participantKeys().filter(key => key !== workspaceId)
                .flatMap(key => Object.keys(context.snapshot.participants[key]?.items ?? {}))
        });
        if (componentId !== undefined) entry.componentId = componentId;
        if (typeof dispose === 'function') entry.dispose = dispose;

        return manager.registerParticipant({
            groupId     : id,
            participant : entry,
            workspaceKey: workspaceId
        })
    }

    /**
     * @summary Queues keyed document candidates through the Group's participant protocol.
     * @param {Object<String,Object>} workspaces The workspace keys changed by this transaction.
     * @param {Object} options Cause, provenance, descriptor and cursorAction for the Group write.
     * @returns {Promise<Object>} The manager's complete transaction result.
     */
    async write(workspaces, {cause, provenance = {}, descriptor = {}, cursorAction = 'append'} = {}) {
        const id = this.resolveGroupId();
        if (!id) throw new Error('WorkspaceSet.write requires a bound Group');
        if (!workspaces || typeof workspaces !== 'object' || Array.isArray(workspaces) ||
            (Object.getPrototypeOf(workspaces) !== Object.prototype && Object.getPrototypeOf(workspaces) !== null)) {
            throw new TypeError('WorkspaceSet.write requires documents keyed by workspace')
        }
        return this.manager.write({
            groupId: id,
            cause,
            provenance,
            descriptor,
            cursorAction,
            changes: Object.entries(workspaces).map(([workspaceKey, input]) => ({workspaceKey, input}))
        })
    }

    /**
     * @summary Reduces semantic operations against the document captured at the Group queue head.
     * @param {String} workspaceKey
     * @param {Object[]} operations
     * @param {Object} [options={}] Group cause and provenance.
     * @returns {Promise<Object>} The committed Group transaction.
     */
    commit(workspaceKey, operations, options = {}) {
        return this.write({[workspaceKey]: {operations}}, {
            cause: 'dock', descriptor: {operations, workspaceKey}, ...options
        })
    }

    /**
     * @summary Prepares a transfer from both queue-head documents before either owner adopts.
     * @param {Object} descriptor Source and target workspace keys plus the transfer operation.
     * @param {Object} [options={}]
     * @returns {Promise<Object>}
     */
    transfer(descriptor, options = {}) {
        if (!['transferItem', 'transferNode'].includes(descriptor.operation) ||
            descriptor.sourceWorkspaceId === descriptor.targetWorkspaceId) {
            return Promise.reject(new TypeError('a transfer needs distinct workspace keys'))
        }
        return this.write({[descriptor.sourceWorkspaceId]: {transfer: descriptor},
            [descriptor.targetWorkspaceId]: {transfer: descriptor}},
            {cause: 'dock-transfer', descriptor, ...options})
    }

    /**
     * @summary Explicitly retires a participant, independently of window binding or adapter disposal.
     * @param {String} workspaceId
     * @returns {Boolean} true when a participant was removed
     */
    unregister(workspaceId) {
        const id = this.resolveGroupId();

        return id ? this.manager.unregisterParticipant({groupId: id, workspaceKey: workspaceId}) : false
    }
}

export default Neo.setupClass(WorkspaceSet);
