import Base            from '../../../core/Base.mjs';
import Transaction     from '../../../manager/Transaction.mjs';
import WindowManager   from '../../../manager/Window.mjs';
import DragCoordinator from '../../../manager/DragCoordinator.mjs';
import InstanceManager from '../../../manager/Instance.mjs';
import {buffer}        from '../../../util/Function.mjs';
import Persistence     from '../model/Persistence.mjs';

/**
 * @summary Owns a Group's relative placement hints and observes native movement without recording
 * requested geometry as an outcome.
 * @description Documents remain independent participants. This participant contains only keyed
 * relative offsets and semantic fallback targets; window routes, rectangles and pending effects
 * stay on this live owner. A free popup move appends after quiescence. A main-frame move rebases
 * current hints through a preserve write, leaving history and the redo tail intact.
 * @class Neo.dashboard.dock.window.Placement
 * @extends Neo.core.Base
 */
class Placement extends Base {
    /**
     * @summary Reuses the Group-owned placement controller across render-host replacement.
     * @param {Object} config Group and main-workspace identity.
     * @returns {Neo.dashboard.dock.window.Placement}
     * @static
     */
    static forGroup(config) {
        const entry = Transaction.getParticipant(config.groupId, config.participantKey ?? 'placementHints');
        if (!entry) return Neo.create(Placement, config);
        const owner = InstanceManager.get(entry.componentId);
        if (!(owner instanceof Placement)) throw new Error('the placement participant key belongs to another owner');
        return owner
    }

    static config = {
        /** @member {String} className='Neo.dashboard.dock.window.Placement' @protected */
        className: 'Neo.dashboard.dock.window.Placement',
        /** @member {String|null} groupId=null */
        groupId: null,
        /** @member {String} mainBindingKey='main' */
        mainBindingKey: 'main',
        /** @member {String|null} mainWorkspaceKey=null */
        mainWorkspaceKey: null,
        /** @member {String} participantKey='placementHints' */
        participantKey: 'placementHints',
        /** @member {Object|null} initialHints=null */
        initialHints: null
    }

    /** @member {Object} #hints @private */
    #hints = Object.freeze({})
    /** @member {Number} #revision=0 @private */
    #revision = 0
    /** @member {Map<String,Object>} #pending @private */
    #pending = new Map()
    /** @member {Function|null} #listener=null @private */
    #listener = null
    /** @member {Object|null} #groupListeners=null @private */
    #groupListeners = null
    /** @member {Object|null} #participant=null @private */
    #participant = null
    /** @member {Map<String,Object>} #receipts @private */
    #receipts = new Map()
    /** @member {Promise<Object>|null} lastWrite=null */
    lastWrite = null

    /**
     * @summary Registers this auxiliary participant separately from the Group's documents.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        const me = this, group = Transaction.get(me.groupId);
        if (!group || !me.mainWorkspaceKey || group.participants.has(me.participantKey)) {
            throw new Error('Placement requires a live Group, a main workspace and an unused participant key')
        }

        me.#hints = me.prepare(me.initialHints ?? me.observedHints());
        me.#participant = {
            domain     : 'dock',
            componentId: me.id,
            capture    : () => ({
                value     : me.#hints,
                generation: me.generation(),
                revision  : me.#revision
            }),
            prepare   : hints => me.prepare(hints),
            adopt     : hints => { me.#hints = hints; me.#revision++ },
            compensate: captured => { me.#hints = captured.value; me.#revision = captured.revision },
            project   : context => me.project(context)
        };
        Transaction.registerParticipant({groupId: me.groupId, workspaceKey: me.participantKey, participant: me.#participant});
        me.#listener = event => me.onGeometry(event);
        WindowManager.on('positionchange', me.#listener);
        me.#groupListeners = {
            groupRetired: ({groupId}) => { if (groupId === me.groupId) me.destroy() },
            bind        : ({groupId, workspaceKey}) => {
                if (groupId !== me.groupId || !me.#hints[workspaceKey]) return;
                me.restoreBinding(workspaceKey).catch(error => Neo.logError(error))
            }
        };
        Transaction.on(me.#groupListeners)
    }

    /**
     * @summary The immutable committed relative hints, suitable for topology capture.
     * @member {Object} hints
     */
    get hints() {
        return this.#hints
    }

    /** @member {Object[]} receipts Latest observed effect per semantic workspace. */
    get receipts() {
        return [...this.#receipts.values()]
    }

    /**
     * @summary Resolves only document-bearing participants, excluding this auxiliary value.
     * @returns {Object<String,Object>}
     */
    documents() {
        return Object.fromEntries([...Transaction.get(this.groupId).participants]
            .filter(([, participant]) => typeof participant.getDocument === 'function')
            .map(([key, participant]) => [key, participant.getDocument()]))
    }

    /**
     * @summary Fences a prepare against changes to any live binding in this Group.
     * @returns {String} Runtime-only stamp; never a field in a placement hint.
     */
    generation() {
        const group = Transaction.get(this.groupId);
        return JSON.stringify(group ? [...group.bindings].map(([key, binding]) => [key, binding.windowId, binding.generation]) : null)
    }

    /**
     * @summary Validates hints through the existing topology wire boundary.
     * @param {Object} hints
     * @returns {Object}
     */
    prepare(hints) {
        const {topology, errors} = Persistence.captureTopologyPerspective(this.documents(), {
            layoutId: 'placement-validation', title: 'Placement', placementHints: hints
        });
        if (errors.length) throw new Error(errors.join('; '));
        if (Object.hasOwn(topology.placementHints, this.mainWorkspaceKey)) throw new Error('the main workspace has no placement hint');
        Object.values(topology.placementHints).forEach(hint => {
            Object.freeze(hint.fallbackTarget);
            Object.freeze(hint)
        });
        return Object.freeze(topology.placementHints)
    }

    /**
     * @summary Derives popup offsets from current observed outer rectangles.
     * @returns {Object}
     */
    observedHints() {
        const me   = this, group = Transaction.get(me.groupId), documents = me.documents();
        const main = WindowManager.get(group.bindings.get(me.mainBindingKey)?.windowId)?.outerRect;
        if (!main) return {};
        const hints = Object.fromEntries(Object.entries(me.#hints).filter(([key]) => documents[key]));
        for (const [key, binding] of group.bindings) {
            const rect = WindowManager.get(binding.windowId)?.outerRect;
            if (key === me.mainBindingKey || !rect || !documents[key]) continue;
            hints[key] = me.relativeHint(rect, main, me.#hints[key]?.fallbackTarget)
        }
        return hints
    }

    /**
     * @summary Converts a runtime rectangle pair into the durable relative representation.
     * @param {Object} rect
     * @param {Object} main
     * @param {Object} [fallbackTarget]
     * @returns {Object}
     */
    relativeHint(rect, main, fallbackTarget) {
        return {
            dx            : rect.x - main.x,
            dy            : rect.y - main.y,
            fallbackTarget: fallbackTarget ?? {workspaceKey: this.mainWorkspaceKey, nodeId: this.documents()[this.mainWorkspaceKey].root}
        }
    }

    /**
     * @summary Coalesces a burst using the same quiet-period policy as native drop settling.
     * @param {Object} event
     * @param {String} event.windowId
     * @param {Object|null} event.before
     * @param {Object} event.after
     */
    onGeometry({windowId, before, after, nativeEffect}) {
        const me = this, binding = Transaction.findByWindow(windowId);
        if (nativeEffect) return;
        if (!binding || binding.groupId !== me.groupId || !before || before.x === after.x && before.y === after.y) return;
        let pending = me.#pending.get(windowId);
        if (!pending) {
            pending = {windowId, before, after, generation: me.generation()};
            pending.flush = buffer(() => {
                me.#pending.delete(windowId);
                me.lastWrite = me.ingest(pending);
                me.lastWrite.catch(error => Neo.logError(error))
            }, me, DragCoordinator.nativeWindowDropSettleMs);
            me.#pending.set(windowId, pending)
        }
        pending.after = after;
        pending.flush()
    }

    /**
     * @summary Records a settled free move, or rebases the main frame without a history row.
     * @param {Object} movement The generation-fenced, quiesced observation.
     * @returns {Promise<Object|null>}
     */
    async ingest({windowId, before, after, generation}) {
        const me = this, binding = Transaction.findByWindow(windowId);
        if (!binding || binding.groupId !== me.groupId || me.generation() !== generation || me.isDestroyed) return null;
        const group  = Transaction.get(me.groupId);
        const isMain = binding.workspaceKey === me.mainBindingKey;
        if (!isMain && DragCoordinator.nativeWindowDropCandidates.has(windowId)) return null;
        const main = WindowManager.get(group.bindings.get(me.mainBindingKey)?.windowId)?.outerRect;
        if (!main) return null;
        const key = binding.workspaceKey;
        if (!isMain && !me.documents()[key]) return null;
        if (!isMain && !Object.hasOwn(me.#hints, key)) {
            await me.write({...me.#hints, [key]: me.relativeHint(before, main)}, 'placement-baseline', 'preserve')
        }
        return me.write(isMain ? me.observedHints() : {
            ...me.#hints, [key]: me.relativeHint(after, main, me.#hints[key].fallbackTarget)
        }, isMain ? 'main-frame-rebase' : 'native-popup-move', isMain ? 'preserve' : 'append')
    }

    /**
     * @summary Adopts validated hints through the same compensating Group writer as documents.
     * @param {Object} hints
     * @param {String} cause
     * @param {String} [cursorAction='append']
     * @returns {Promise<Object>}
     */
    write(hints, cause, cursorAction='append') {
        return Transaction.write({
            groupId: this.groupId, cause, cursorAction, provenance: {origin: 'observed-geometry'},
            changes: [{workspaceKey: this.participantKey, input: hints}]
        })
    }

    /**
     * @summary Applies semantic undo/redo or explicit placement after the Group queue releases.
     * @param {Object} context Committed participant context.
     * @returns {Promise<void>}
     */
    async project(context) {
        if (context.cursorAction === 'preserve' || context.cause === 'native-popup-move') return;
        const hints = context.snapshot.participants[this.participantKey];
        for (const [key, hint] of Object.entries(hints)) {
            const before = context.captured.value[key];
            if (!before || before.dx !== hint.dx || before.dy !== hint.dy) {
                await this.applyHint(key, hint, context)
            }
        }
    }

    /**
     * @summary Projects the current saved hint when a bound window's native geometry becomes available.
     * @param {String} workspaceKey
     * @returns {Promise<Object|null>} The native outcome, or null for an unbound or unhinted slot.
     */
    async restoreBinding(workspaceKey) {
        const group = Transaction.get(this.groupId), hint = this.#hints[workspaceKey];
        if (!hint || !group?.bindings.get(workspaceKey)?.windowId) return null;
        return this.applyHint(workspaceKey, hint, {
            transactionId: group.history?.current?.transactionId ?? `${this.groupId}:snapshot:${group.snapshot?.version ?? 0}`
        })
    }

    /**
     * @summary Resolves a relative hint inside the current screen's usable bounds.
     * @param {Object} hint
     * @param {Object} main Observed main outer rectangle.
     * @param {Object} popup Observed popup outer rectangle.
     * @param {Object} screen Current usable screen bounds.
     * @returns {Object|null} Runtime coordinates, or null for semantic fallback.
     * @static
     */
    static resolvePosition(hint, main, popup, screen) {
        const {availLeft, availTop, availWidth, availHeight} = screen ?? {};
        if (![availLeft, availTop, availWidth, availHeight].every(Number.isFinite) || availWidth <= 0 || availHeight <= 0) return null;
        return {
            x: Math.min(Math.max(main.x + hint.dx, availLeft), availLeft + Math.max(0, availWidth - popup.width)),
            y: Math.min(Math.max(main.y + hint.dy, availTop), availTop + Math.max(0, availHeight - popup.height))
        }
    }

    /**
     * @summary Projects onto one exact live generation and records its observed result separately.
     * @param {String} workspaceKey
     * @param {Object} hint
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    async applyHint(workspaceKey, hint, context) {
        const me         = this, group = Transaction.get(me.groupId);
        const binding    = group?.bindings.get(workspaceKey), windowId = binding?.windowId;
        const generation = binding?.generation, popup = WindowManager.get(windowId);
        const route      = popup?.nativeRoute, mainBinding = group?.bindings.get(me.mainBindingKey);
        const effectId   = crypto.randomUUID();
        const live       = () => !me.isDestroyed && Transaction.get(me.groupId) === group &&
            group.bindings.get(workspaceKey)?.windowId === windowId &&
            group.bindings.get(workspaceKey)?.generation === generation &&
            WindowManager.get(windowId)?.nativeRoute === route;
        let status = 'fallback', observed = null, error = null;
        try {
            if (windowId && route && popup.capabilities?.position && mainBinding?.windowId) {
                const screen   = await me.readScreen(windowId);
                const main     = WindowManager.get(mainBinding.windowId)?.outerRect;
                const position = main && Placement.resolvePosition(hint, main, popup.outerRect, screen);
                if (!live()) status = 'stale';
                else if (position) {
                    const admitted = await me.moveWindow(route, position, {transactionId: context.transactionId, effectId});
                    const rect     = live() ? await me.readGeometry(route) : null;
                    if (!live()) status = 'stale';
                    else {
                        const currentMain = WindowManager.get(mainBinding.windowId)?.outerRect;
                        observed = rect && currentMain ? {dx: rect.x - currentMain.x, dy: rect.y - currentMain.y} : null;
                        status = admitted === true && observed ? 'applied' : 'refused'
                    }
                }
            }
        } catch (failure) {
            status = live() ? 'refused' : 'stale';
            error = String(failure?.message ?? failure)
        }
        const receipt = Object.freeze({
            transactionId : context.transactionId, effectId, workspaceKey, status,
            observed      : observed && Object.freeze(observed),
            fallbackTarget: hint.fallbackTarget,
            error
        });
        if (live()) me.#receipts.set(workspaceKey, receipt);
        try { Transaction.fire('effectReceipt', {groupId: me.groupId, receipt}) } catch (failure) { Neo.logError(failure) }
        return receipt
    }

    /** @summary Reads current screen facts from the addressed realm. @param {String} windowId @returns {Promise<Object>} */
    async readScreen(windowId) {
        return (await Neo.Main.getWindowData({windowId})).screen
    }

    /** @summary Requests one generation-fenced native effect. @param {Object} route @param {Object} position @param {Object} nativeEffect @returns {Promise<Boolean>} */
    moveWindow(route, position, nativeEffect) {
        return Neo.Main.windowNativeMoveTo({...route, ...position, nativeEffect, windowId: route.ownerWindowId})
    }

    /** @summary Reads what the exact native handle actually did. @param {Object} route @returns {Promise<Object|null>} */
    readGeometry(route) {
        return Neo.Main.windowNativeGetGeometry({...route, windowId: route.ownerWindowId})
    }

    /**
     * @summary Cancels pending movement and releases only this owner's registration.
     */
    destroy() {
        WindowManager.un('positionchange', this.#listener);
        Transaction.un(this.#groupListeners);
        this.#pending.forEach(pending => pending.flush.cancel());
        this.#pending.clear();
        if (Transaction.getParticipant(this.groupId, this.participantKey) === this.#participant) {
            Transaction.unregisterParticipant({groupId: this.groupId, workspaceKey: this.participantKey})
        }
        super.destroy()
    }
}

export default Neo.setupClass(Placement);
