import Base                    from '../core/Base.mjs';
import DragCoordinator         from '../manager/DragCoordinator.mjs';
import WindowManager           from '../manager/Window.mjs';
import NativeVesselTransaction from '../dashboard/dock/window/NativeVesselTransaction.mjs';

/**
 * @summary Receives the OS-titlebar drag of one committed desktop popup at its original workspace.
 * The drag coordinator owns native geometry, arbitration and its dwell clock. The desktop has a single
 * return slot: it keeps the popup visible until the dwell commits through the ordinary Back action.
 * @class Neo.desktop.NativeReturnTarget
 * @extends Neo.core.Base
 */
class NativeReturnTarget extends Base {
    static #cueOwners = new WeakMap()

    static config = {
        className: 'Neo.desktop.NativeReturnTarget',
        /** @member {Function} canReturn Whether the exact popup route still owns the live body. */
        canReturn: null,
        /** @member {Neo.desktop.AppWindow} owner The task's retained desktop dialog. */
        owner: null,
        /** @member {Function} returnWindow Restores the existing app window and retires the captured native handle. */
        returnWindow: null,
        /** @member {Object} route Native route captured when the popup document adopted the live body. */
        route: null,
        /** @member {Neo.container.Base} workspace The eligible desktop surface, excluding its taskbar. */
        workspace: null
    }

    #armedAt = null
    #bounds = null
    #measureGeneration = 0
    #registered = false

    /** @summary This native return belongs to the one retained dialog. */
    get ownershipId() { return this.owner.id }
    /** @summary Isolates this dialog's return surface from other desktop and dock targets. */
    get sortGroup() { return 'desktop-return-' + this.owner.id }
    /** @summary The dialog ID remains stable when its popup reloads. */
    get stableTargetId() { return this.owner.id }
    /** @summary The receiving workspace is painted by the opener. */
    get windowId() { return this.route.ownerWindowId }

    /** @summary Arms both native geometry streams and registers this route once its workspace is measurable. */
    async arm() {
        const me = this, {route, workspace} = me;
        await Promise.all([
            me.onWorkspaceResize(),
            NativeVesselTransaction.observeWindowGeometry(route.ownerWindowId),
            NativeVesselTransaction.observeWindowGeometry(route.targetWindowId)
        ]);
        if (me.isDestroyed || me.isDestroying || workspace.isDestroyed || me.#registered) return;
        workspace.addDomListeners({resize: me.onWorkspaceResize, scope: me});
        WindowManager.on({positionchange: me.onWindowPositionChange, scope: me});
        DragCoordinator.register(me);
        me.#registered = true
    }

    /** @summary Measures the actual available workspace after a resize; late reads cannot replace newer bounds. */
    async onWorkspaceResize() {
        const me = this, generation = ++me.#measureGeneration;
        me.#bounds = null;
        try {
            const rect = await me.workspace.getDomRect();
            if (!me.isDestroyed && generation === me.#measureGeneration) {
                me.#bounds = rect;
                me.onWindowPositionChange({windowId: me.windowId})
            }
        } catch { /* a removed workspace cannot receive a return */ }
    }

    /**
     * @summary Whether the moving window's current anchor still lies inside these workspace bounds.
     * @param {Neo.util.Rectangle|null} bounds The workspace in opener-local coordinates.
     * @returns {Boolean}
     */
    containsNativeAnchor(bounds) {
        const me     = this, popup = WindowManager.get(me.route.targetWindowId)?.outerRect,
              opener = WindowManager.get(me.windowId)?.innerRect, inset = DragCoordinator.nativeWindowDropAnchorInset;
        return Boolean(bounds && popup && opener && bounds.containsPoint(popup.x + inset - opener.x, popup.y + inset - opener.y))
    }

    /**
     * @summary A moving opener can take the target away without producing another moving-popup event.
     * @param {Object} data Live geometry publication.
     */
    onWindowPositionChange({windowId}) {
        const me = this;
        if (windowId !== me.windowId || me.#armedAt === null || me.containsNativeAnchor(me.#bounds)) return;
        const popupId = me.route.targetWindowId, candidate = DragCoordinator.nativeWindowDropCandidates.get(popupId);
        if (candidate?.sourceSortZone === me && !candidate.phase) {
            DragCoordinator.clearNativeWindowDropCandidate(popupId);
            DragCoordinator.endNativeGesture(popupId)
        }
    }

    /**
     * @summary Only this committed native document can return this app window.
     * @param {String} windowId The moving window.
     * @returns {Object|null}
     */
    getNativeWindowDrag(windowId) {
        const me = this;
        return windowId === me.route.targetWindowId && me.canReturn()
            ? {draggedItem: me.owner, sourceWindowId: windowId, widgetName: me.owner.id}
            : null
    }

    /**
     * @summary Restricts the coordinator's window-local anchor to the live desktop workspace.
     * @param {Number} x Opener-local horizontal coordinate.
     * @param {Number} y Opener-local vertical coordinate.
     * @returns {Boolean}
     */
    acceptsRemoteDrag(x, y) {
        return this.canReturn() && this.#bounds?.containsPoint(x, y) === true
    }

    /**
     * @summary Paints the coordinator's existing dwell clock on this workspace.
     * @param {Object} data The coordinator's current hover frame.
     * @returns {Object|null} Stable identity of the offered return.
     */
    onRemoteDragMove({dwell, draggedItem}) {
        const me = this, {workspace} = me;
        if (draggedItem !== me.owner || !me.canReturn()) return null;
        if (dwell && dwell.armedAt !== me.#armedAt) {
            const previous = NativeReturnTarget.#cueOwners.get(workspace);
            if (previous !== me) previous?.onRemoteDragLeave();
            NativeReturnTarget.#cueOwners.set(workspace, me);
            me.#armedAt = dwell.armedAt;
            workspace.style = {...workspace.style,
                '--neo-desktop-return-dwell' : dwell.durationMs + 'ms',
                '--neo-desktop-return-offset': Math.min(dwell.durationMs, Math.max(0, Date.now() - dwell.armedAt)) + 'ms'
            };
            workspace.addCls('neo-desktop-window-dwelling')
        }
        return {previewId: me.stableTargetId}
    }

    /** @summary Removes the visual only if this popup still owns it. */
    onRemoteDragLeave() {
        const me = this, {workspace} = me;
        me.#armedAt = null;
        if (NativeReturnTarget.#cueOwners.get(workspace) !== me) return;
        NativeReturnTarget.#cueOwners.delete(workspace);
        if (!workspace.isDestroyed) {
            workspace.removeCls('neo-desktop-window-dwelling');
            workspace.style = {...workspace.style, '--neo-desktop-return-dwell': null, '--neo-desktop-return-offset': null}
        }
    }

    /** @summary Desktop return has no provisional target shell; its native source stays visible throughout dwell. */
    suspendWindowDrag() { return false }

    /**
     * @summary Revalidates current native and workspace geometry before using the existing return transaction.
     * @param {Neo.desktop.AppWindow} item The dialog that started the native gesture.
     * @returns {Promise<Boolean>}
     */
    async onRemoteDrop(item) {
        const me = this;
        me.onRemoteDragLeave();
        if (item !== me.owner || !me.canReturn()) return false;
        const bounds = await me.workspace.getDomRect();
        return !me.isDestroyed && me.canReturn() && me.containsNativeAnchor(bounds) && me.returnWindow()
    }

    /** @summary Releases this route's geometry subscription and pending dwell on reload, close or teardown. */
    destroy(...args) {
        const me = this;
        if (me.#registered) {
            WindowManager.un({positionchange: me.onWindowPositionChange, scope: me});
            if (!me.workspace.isDestroyed) me.workspace.removeDomListeners({resize: me.onWorkspaceResize, scope: me});
            DragCoordinator.unregister(me);
            me.#registered = false
        }
        me.onRemoteDragLeave();
        super.destroy(...args)
    }
}

export default Neo.setupClass(NativeReturnTarget);
