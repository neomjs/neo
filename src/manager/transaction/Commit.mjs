import Base          from '../../core/Base.mjs';
import EffectManager from '../../core/EffectManager.mjs';

/**
 * @summary Executes one Group's semantic write, with presentation outside its critical section.
 * @description The manager supplies serialization and participant ownership. This executor prepares
 * immutable endpoints before invoking synchronous, compensatable adopters. History and the current
 * snapshot join that same rollback boundary; observers run only after all semantic truth agrees.
 * @class Neo.manager.transaction.Commit
 * @extends Neo.core.Base
 */
class Commit extends Base {
    static config = {
        /**
         * @member {String} className='Neo.manager.transaction.Commit'
         * @protected
         */
        className: 'Neo.manager.transaction.Commit'
    }

    /**
     * @summary Copies and freezes a finite JSON value before it reaches a semantic write.
     * @param {*} value
     * @returns {*}
     */
    static copy(value) {
        const copy   = structuredClone(value), path = new Set();
        const freeze = entry => {
            if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return entry;
            if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
            if (!entry || typeof entry !== 'object' || path.has(entry)) {
                throw new TypeError('transaction values must be finite JSON data without cycles')
            }
            if (!Array.isArray(entry) && Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null) {
                throw new TypeError('transaction values must contain only plain objects and arrays')
            }
            path.add(entry);
            Object.values(entry).forEach(freeze);
            path.delete(entry);
            return Object.freeze(entry)
        };
        return freeze(copy)
    }

    /**
     * @summary Captures a participant's value and its opaque generation/revision stamps.
     * @param {Object} participant
     * @returns {Object}
     */
    static capture(participant) {
        const captured = participant.capture();
        if (!captured || typeof captured.then === 'function' || !['value', 'generation', 'revision'].every(key => Object.hasOwn(captured, key))) {
            throw new TypeError('participant capture must synchronously return value, generation and revision')
        }
        return this.copy({value: captured.value, generation: captured.generation, revision: captured.revision})
    }

    /**
     * @summary Runs at the Group queue head; no awaited work occurs inside adoption/rollback.
     * @param {Neo.manager.Transaction} manager
     * @param {Object} group
     * @param {Object} request
     * @returns {Promise<Object>}
     */
    static async run(manager, group, request) {
        manager.assertLive(group, 'write');
        const {
            cause,
            cursorAction = 'append',
            descriptor = {},
            provenance = {},
            effects = []
        } = request;
        if (!['append', 'preserve', 'undo', 'redo'].includes(cursorAction) || typeof cause !== 'string' || !cause.trim()) {
            throw new TypeError('a transaction needs a valid cursorAction and an explicit cause')
        }
        if (request.adopt !== undefined) {
            throw new TypeError('write uses registered compensatable participants, not an adopt callback')
        }
        const transactionId = crypto.randomUUID();
        const priorRow      = cursorAction === 'undo' || cursorAction === 'redo' ? group.history?.peek(cursorAction) : null;
        if ((cursorAction === 'undo' || cursorAction === 'redo') && !priorRow) {
            return {row: null, snapshot: group.snapshot ?? null, transactionId, notificationErrors: [], plans: [], effects: []}
        }
        const changes = priorRow
            ? priorRow.participants.map(entry => ({workspaceKey: entry.workspaceKey, input: entry[cursorAction === 'undo' ? 'before' : 'after']}))
            : request.changes ?? [];
        if (!Array.isArray(changes) || !Array.isArray(effects)) throw new TypeError('changes and effects must be arrays');
        if (effects.some(effect => typeof effect.effectId !== 'string' || !effect.effectId || typeof effect.run !== 'function') ||
            new Set(effects.map(effect => effect.effectId)).size !== effects.length) {
            throw new TypeError('each effect needs a unique effectId and a run callback')
        }
        const members = [...group.participants.entries()].sort(([a], [b]) => a.localeCompare(b));
        const byKey   = new Map(members), changedKeys = new Set();
        for (const change of changes) {
            const entry = byKey.get(change.workspaceKey);
            if (!entry || changedKeys.has(change.workspaceKey) || !['capture', 'prepare', 'adopt', 'compensate'].every(key => typeof entry[key] === 'function')) {
                throw new TypeError('every changed participant must be unique, registered and compensatable')
            }
            changedKeys.add(change.workspaceKey)
        }
        const domains = new Set(changes.map(change => byKey.get(change.workspaceKey).domain));
        if ([...domains].some(domain => typeof domain !== 'string' || !domain.trim()) || domains.size > 1) {
            throw new TypeError('mixed or undeclared participant domains are not supported')
        }
        if (changes.some(change => ['adopt', 'compensate'].some(key =>
            Object.prototype.toString.call(byKey.get(change.workspaceKey)[key]) === '[object AsyncFunction]'
        ))) throw new TypeError('participant adoption and compensation must be synchronous');
        const captures = new Map(members.map(([key, entry]) => [key, this.capture(entry)]));
        const metadata = this.copy({cause, provenance, descriptor});
        const plans    = [];
        for (const change of [...changes].sort((a, b) => a.workspaceKey.localeCompare(b.workspaceKey))) {
            const participant = byKey.get(change.workspaceKey), captured = captures.get(change.workspaceKey);
            const context     = Object.freeze({transactionId, cursorAction, ...metadata, workspaceKey: change.workspaceKey, captured});
            const after       = this.copy(await participant.prepare(this.copy(change.input), captured, context));
            plans.push({workspaceKey: change.workspaceKey, participant, captured, after, context})
        }
        const endpoints = this.copy(plans.map(plan => ({workspaceKey: plan.workspaceKey, before: plan.captured.value, after: plan.after})));
        const rowData   = this.copy({...descriptor, transactionId, cause, provenance, participants: endpoints});
        const values    = Object.fromEntries(members.map(([key]) => [key, captures.get(key).value]));
        plans.forEach(plan => values[plan.workspaceKey] = plan.after);
        const snapshot = this.copy({version: (group.snapshot?.version ?? 0) + 1, participants: values});
        const history  = cursorAction === 'preserve' ? group.history : await manager.loadHistory(group);
        if (cursorAction === 'append') history?.assertRow(rowData);
        if (cursorAction === 'preserve' && history?.count) throw new Error('preserve is only valid for an empty history baseline');
        manager.assertLive(group, 'write');
        if (group.participants.size !== members.length || members.some(([key, entry]) => {
            if (group.participants.get(key) !== entry) return true;
            const now = this.capture(entry), captured = captures.get(key);
            return now.generation !== captured.generation || now.revision !== captured.revision
        })) throw new Error('participant membership, generation or revision changed during preparation');

        const checkpoint = history?.captureState(), previousSnapshot = group.snapshot ?? null;
        const invoked    = [], notificationErrors = [], queuedBefore = new Set(EffectManager.queuedEffects);
        let   row        = priorRow, failed = false, failure;
        EffectManager.pause();
        try {
            for (const plan of plans) {
                invoked.push(plan);
                const result = plan.participant.adopt(plan.after, plan.context);
                if (result === false || result?.then) throw new Error(`participant ${plan.workspaceKey} adoption must be synchronous and accepted`)
            }
            if (cursorAction === 'append') row = history ? history.append(rowData) : null;
            else if (cursorAction === 'undo' || cursorAction === 'redo') history[cursorAction]();
            group.snapshot = snapshot
        } catch (error) {
            failed = true;
            const rollbackErrors = [];
            try { checkpoint && history.restoreState(checkpoint) } catch (rollbackError) { rollbackErrors.push(rollbackError) }
            for (const plan of invoked.reverse()) {
                try {
                    const result = plan.participant.compensate(plan.captured, plan.context);
                    if (result === false || result?.then) throw new Error(`participant ${plan.workspaceKey} compensation must be synchronous and accepted`)
                } catch (rollbackError) { rollbackErrors.push(rollbackError) }
            }
            group.snapshot = previousSnapshot;
            for (const effect of EffectManager.queuedEffects) {
                if (!queuedBefore.has(effect)) EffectManager.queuedEffects.delete(effect)
            }
            failure = rollbackErrors.length ? new AggregateError([error, ...rollbackErrors], String(error?.message ?? error)) : error
        }
        if (!failed) {
            try { manager.publishHistory(group) } catch (error) { notificationErrors.push(error) }
        }
        try { EffectManager.resume() } catch (error) { notificationErrors.push(error) }
        if (failed) throw failure;

        const result = {row, snapshot, transactionId, notificationErrors, plans, effects};
        try { manager.fire('commit', {groupId: group.id, row, snapshot, transactionId}) } catch (error) { notificationErrors.push(error) }
        return result
    }

    /**
     * @summary Schedules presentation after queue release; failures never reject the committed write.
     * @param {Neo.manager.Transaction} manager
     * @param {Object} group
     * @param {Object} result
     */
    static complete(manager, group, result) {
        const receipt = (kind, id, observation, error = null) => {
            const value = this.copy({transactionId: result.transactionId, kind, id, observation: observation ?? null, error: error?.message ?? null});
            try { manager.fire('effectReceipt', {groupId: group.id, receipt: value}) } catch (notificationError) { Neo.logError(notificationError) }
        };
        for (const plan of result.plans) {
            if (typeof plan.participant.project === 'function') {
                Promise.resolve().then(() => {
                    if (manager.get(group.id) !== group || group.snapshot !== result.snapshot ||
                        group.participants.get(plan.workspaceKey) !== plan.participant ||
                        plan.participant.capture().generation !== plan.captured.generation) return;
                    return plan.participant.project({...plan.context, snapshot: result.snapshot})
                })
                    .catch(error => receipt('projection', plan.workspaceKey, null, error))
            }
        }
        for (const effect of result.effects) {
            Promise.resolve().then(() => {
                if (manager.get(group.id) !== group) throw new Error('effect Group was retired');
                return effect.run({transactionId: result.transactionId, snapshot: result.snapshot})
            }).then(observation => receipt('native', effect.effectId, observation))
                .catch(error => receipt('native', effect.effectId, null, error))
        }
    }
}

export default Neo.setupClass(Commit);
