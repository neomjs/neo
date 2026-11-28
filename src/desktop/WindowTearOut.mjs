import Base                    from '../core/Base.mjs';
import NativeReturnTarget      from './NativeReturnTarget.mjs';
import NativeVesselTransaction from '../dashboard/dock/window/NativeVesselTransaction.mjs';
import VesselEmbodiment        from '../dashboard/dock/window/VesselEmbodiment.mjs';
import {generateUUID}          from '../util/UUID.mjs';

const reconnectLease = 10_000;

/**
 * @summary Stages a desktop window's live body in an admitted native vessel. The desktop retains the window, task,
 * and state while a popup document can disconnect and reconnect on the same opener-owned handle.
 * @class Neo.desktop.WindowTearOut
 * @extends Neo.core.Base
 */
class WindowTearOut extends Base {
    static config = {
        /** @member {String} className='Neo.desktop.WindowTearOut' */
        className: 'Neo.desktop.WindowTearOut',
        /** @member {Neo.desktop.AppWindow|null} owner=null The window whose body is borrowed. */
        owner: null,
        /** @member {String|null} popupUrl=null Same-origin page that boots the child viewport. */
        popupUrl: null
    }

    /** @member {Object|null} #entry The native admission while it is opening, bound, reconnecting or retiring. */
    #entry = null

    /** @member {Neo.dashboard.dock.window.VesselEmbodiment|null} #embodiment */
    #embodiment = null

    /** @summary Whether the popup owns the desktop task's presentation. */
    get committed() {
        return this.#entry?.committed === true
    }

    /** @summary The child's measured outer extent, once the browser has supplied it. */
    get currentSize() {
        return this.#entry?.size ?? null
    }

    /**
     * @summary Configures the shared body staging and listens for native renderer lifecycles.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.#embodiment = Neo.create(VesselEmbodiment, {
            resolvePane  : () => this.owner.getItem('bodyContainer'),
            resolveTarget: windowId => {
                const view = Neo.apps[windowId]?.mainView;
                return view?.getReference('desktopPopupBody') || view
            }
        });
        Neo.currentWorker.on({connect: this.onWindowConnect, disconnect: this.onWindowDisconnect, scope: this})
    }

    /**
     * @summary Opens a new vessel for the held gesture or deliberate popout command.
     * @param {Object} data
     * @param {Number} [data.gestureId] Source Main's pointer gesture, if any.
     * @param {Object} data.rect Requested screen-space rectangle.
     * @returns {Promise<{popupName:String,popupWidth:Number,popupHeight:Number}|null>}
     */
    async open({gestureId, rect}) {
        const me = this, {owner} = me;

        if (me.#entry?.retiring) await me.returnToDesktop();
        if (me.isDestroyed || me.isDestroying || me.#entry || !Neo.currentWorker.isSharedWorker) return null;

        const sourceId = owner.windowId, sourceUrl = Neo.windowConfigs?.[sourceId]?.url?.href,
              body     = owner.getItem('bodyContainer');

        if (!sourceUrl || !body?.parent || owner.hidden) return null;

        const address    = new URL(me.popupUrl, sourceUrl), source = new URL(sourceUrl),
              left       = Math.round(rect.left ?? rect.x), top = Math.round(rect.top ?? rect.y),
              popupWidth = Math.round(rect.width), popupHeight = Math.round(rect.height);

        if (address.origin !== source.origin || ![left, top, popupWidth, popupHeight].every(Number.isFinite) ||
            popupWidth < 1 || popupHeight < 1) return null;

        const popupName = generateUUID(),
              entry     = {body, gestureId, popupName, sourceId};

        me.#entry = entry;
        source.searchParams.forEach((value, key) => {
            if (!address.searchParams.has(key)) address.searchParams.set(key, value)
        });
        address.searchParams.set('desktopPopup', popupName);

        let opened;
        try {
            entry.opening = NativeVesselTransaction.openVessel({
                nativeCapabilities      : {close: true, focus: true, position: true},
                renewNativeRouteOnReload: true,
                url                     : address.href,
                windowFeatures          : `popup=yes,left=${left},top=${top},width=${popupWidth},height=${popupHeight}`,
                windowId                : sourceId,
                windowName              : popupName
            }).catch(() => null);

            opened = await entry.opening;
            entry.admitted = opened === true
        } catch {
            entry.admitted = false
        }

        if (!entry.admitted) {
            if (me.#entry === entry) {
                me.#entry = null;
                if (opened === false && !entry.retiring && !owner.hidden && !owner.isDestroyed && !owner.isDestroying) {
                    owner.onPopupOpenRefused()
                }
            }
            return null
        }

        if (entry.retiring || me.#entry !== entry) return null;

        if (gestureId == null) {
            entry.committed = true;
            owner.setTearOutSourceVisible?.(false)
        }

        if (entry.target) {
            me.#attach(entry)
        } else {
            entry.timer = setTimeout(() => me.#failedAdmission(entry), reconnectLease)
        }

        return {popupName, popupWidth, popupHeight}
    }

    /**
     * @summary Accepts the exact new document for this vessel and stages the original body there.
     * @param {Object} data App worker connect event.
     * @protected
     */
    onWindowConnect({windowId, windowData}) {
        const entry = this.#entry, config = Neo.windowConfigs[windowId], route = windowData?.nativeRoute;

        if (!entry || route?.ownerWindowId !== entry.sourceId ||
            route.targetWindowId !== windowId || route.windowName !== entry.popupName ||
            !route.nativeHandleKey || new URLSearchParams(config?.url?.search).get('desktopPopup') !== entry.popupName ||
            entry.route && (entry.route.nativeHandleKey !== route.nativeHandleKey || entry.route.targetWindowId === windowId)) return;

        const view   = Neo.apps[windowId]?.mainView,
              target = view?.getReference('desktopPopupBody') || view;

        if (!target) return;

        if (entry.target) this.#detachTarget(entry);

        const {outerWidth: width, outerHeight: height} = windowData;
        if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
            entry.size = {width, height}
        }

        clearTimeout(entry.timer);
        entry.route  = route;
        entry.target = target;
        entry.view   = view;

        if (entry.retiring) {
            Promise.resolve(entry.retirement).then(() => {
                if (this.#entry === entry && entry.route === route && !entry.retirement) this.returnToDesktop()
            });
            return
        }

        if (entry.admitted) this.#attach(entry)
    }

    /**
     * @summary Preserves the desktop provider while the shared vessel mounts the same body in this document.
     * @param {Object} entry Current native admission.
     */
    async #attach(entry) {
        const me               = this, {body, target, view} = entry, {owner} = me,
              itemId           = owner.id, windowId = entry.route.targetWindowId,
              previousWindowId = me.#embodiment.getWindowId(itemId);

        if (entry.attachingTo === target) return;
        entry.attachingTo = target;

        try {
            const root = Neo.apps[entry.sourceId]?.mainView;
            if (root) Neo.currentWorker.insertThemeFiles(windowId, Object.getPrototypeOf(root));
            Neo.currentWorker.insertThemeFiles(windowId, Object.getPrototypeOf(owner));

            // Floating dialogs have a logical desktop parent but are outside its items, so a desktop
            // theme change can reach that parent without publishing a change on the dialog itself.
            const parent = owner.parent || root,
                  sync   = () => {
                      if (me.#entry !== entry || entry.view !== view || view.isDestroyed) return;
                      const ownScope = owner.parent || owner.theme || owner.cls?.some(cls => cls.startsWith('neo-theme-'));
                      view.theme = (ownScope ? owner : root || owner).getTheme()
                  };
            sync();
            const stopOwner  = view.observeConfig(owner, 'theme', sync),
                  stopParent = parent && view.observeConfig(parent, 'theme', sync);
            entry.stopThemeSync = () => { stopOwner(); stopParent?.() };
            target.parentComponent = owner;
            entry.keyListener = {
                keydown: data => {
                    if (data.key === 'Escape' && me.#entry === entry && !entry.committed && entry.gestureId != null) {
                        data.cancelBubble = true;
                        Neo.main.addon.DragDrop.cancelDrag({
                            gestureId: entry.gestureId, key: data.key, timeStamp: data.timeStamp, windowId: entry.sourceId
                        })
                    }
                },
                vnodeId: 'document.body'
            };
            target.addDomListeners(entry.keyListener);

            const staged = previousWindowId
                ? await me.#embodiment.reattach({itemId, previousWindowId, windowId})
                : await me.#embodiment.stage({itemId, windowId});

            if (me.#entry !== entry || entry.target !== target || entry.retiring) return;
            if (!staged || body.isDestroyed) {
                me.#failedAdmission(entry);
                return
            }

            view.setAppRecord?.(owner.record);
            view.setReturnHandler?.(() => me.returnToDesktop({focus: true}));
            const workspace = Neo.getComponent(owner.boundaryContainerId);
            if (workspace) {
                const route = entry.route;
                entry.nativeReturn = Neo.create(NativeReturnTarget, {
                    canReturn: () => me.#entry === entry && entry.route === route && entry.target === target &&
                        entry.committed && !entry.retiring && !owner.isDestroyed && !workspace.isDestroyed && !owner.dragZone?.gesture,
                    owner,
                    returnWindow: () => me.returnToDesktop({focus: true}),
                    route,
                    workspace
                });
                entry.nativeReturn.arm().catch(error => {
                    if (me.#entry === entry && entry.target === target && !entry.retiring) {
                        console.warn('Desktop native return geometry unavailable', error)
                    }
                })
            }
        } catch {
            if (entry.target === target) me.#failedAdmission(entry)
        }
    }

    /** @summary Retains an admitted popup after the source pointer releases. */
    commit() {
        const entry = this.#entry;
        if (!entry?.admitted || entry.retiring) return false;
        entry.committed = true;
        return true
    }

    /**
     * @summary Focuses the exact live popup bound to this desktop app.
     * @returns {Promise<Boolean>}
     */
    async focus() {
        const entry = this.#entry;
        if (!entry?.route || !entry.target || entry.retiring) return false;

        const {route} = entry,
              focused = await NativeVesselTransaction.focusVessel({ownerWindowId: entry.sourceId, route});
        return this.#entry === entry && entry.route === route && focused
    }

    /**
     * @summary Releases a departing renderer before reaping and observes the opener's native handle.
     * @param {Object} data App worker disconnect event.
     * @protected
     */
    onWindowDisconnect({windowId}) {
        const entry = this.#entry;

        if (entry?.route?.targetWindowId !== windowId) return;

        this.#detachTarget(entry);

        if (entry.retirement) return;
        if (!entry.committed) {
            this.#failedAdmission(entry);
            return
        }

        this.#observeClosure(entry, windowId, Date.now() + reconnectLease)
    }

    /** @summary Detaches the live body before its old renderer can destroy it. @param {Object} entry */
    #detachTarget(entry) {
        this.#embodiment.detach({itemId: this.owner.id, windowId: entry.route.targetWindowId});
        this.#releaseNativeReturn(entry);
        this.#unhookTarget(entry);
        entry.target = entry.view = null
    }

    /**
     * @summary Waits for the exact opener handle to distinguish a native close from a document reload.
     * @param {Object} entry
     * @param {String} windowId Departed renderer.
     * @param {Number} deadline Bounded reconnect lease.
     */
    async #observeClosure(entry, windowId, deadline) {
        const closed = await this.#isClosed(entry);

        if (this.#entry !== entry || entry.target || entry.route.targetWindowId !== windowId || entry.retirement) return;
        if (closed) {
            const committed = entry.committed;
            if (!this.#restorePane(entry)) return;
            this.#entry = null;
            NativeVesselTransaction.releaseClosedVessel(entry.route).catch(() => {});
            this.owner.onTearOutDisconnect?.({committed})
        } else if (Date.now() >= deadline) {
            this.#failedAdmission(entry)
        } else {
            entry.timer = setTimeout(() => this.#observeClosure(entry, windowId, deadline), 120)
        }
    }

    /** @summary Restores a failed admission and ends its still-held drag. @param {Object} entry */
    #failedAdmission(entry) {
        if (this.#entry !== entry || entry.retirement) return;

        this.returnToDesktop();
        this.owner.onTearOutDisconnect?.({committed: false})
    }

    /** @summary Stops admitting native frame movement when the popup releases its live body. @param {Object} entry */
    #releaseNativeReturn(entry) {
        entry.nativeReturn?.destroy();
        entry.nativeReturn = null
    }

    /** @summary Removes only bindings owned by this child renderer. @param {Object} entry */
    #unhookTarget(entry) {
        const {target, view, keyListener} = entry;
        entry.stopThemeSync?.();
        entry.stopThemeSync = null;
        if (target && !target.isDestroyed && keyListener) target.removeDomListeners(keyListener);
        if (view && !view.isDestroyed) {
            view.setAppRecord?.(null);
            view.setReturnHandler?.(null)
        }
    }

    /** @summary Restores through the shared placeholder only while the original pane is still staged. @param {Object} entry */
    #restorePane(entry) {
        const {owner} = this, itemId = owner.id, windowId = this.#embodiment.getWindowId(itemId);

        if (windowId && !this.#embodiment.restore({itemId, windowId})) return false;

        this.#releaseNativeReturn(entry);
        if (entry.target && !entry.target.isDestroyed) entry.target.parentComponent = null;
        owner.setTearOutSourceVisible?.(true);
        return true
    }

    /**
     * @summary Returns the live body and retires just this admission. A refused close remains available for retry.
     * @param {Object} [options]
     * @param {Boolean} [options.focus=false] Give the opener focus for an explicit Back to desktop action.
     * @returns {Promise<Boolean>}
     */
    returnToDesktop({focus=false}={}) {
        const entry = this.#entry;
        if (!entry) return Promise.resolve(false);

        entry.retiring = true;
        clearTimeout(entry.timer);
        return entry.retirement ??= this.#retire(entry, focus)
    }

    /** @summary Dispatches shared native retirement with the captured route and the source's exact body slot. */
    async #retire(entry, focus) {
        const {owner} = this, itemId = owner.id, {popupName, sourceId} = entry;

        await entry.opening;
        if (!entry.admitted) return true;

        if (focus && entry.target) {
            await NativeVesselTransaction.focusVessel({ownerWindowId: sourceId, route: entry.route, opener: true})
        }

        if (!this.isDestroyed) {
            this.#unhookTarget(entry);
            if (!this.#restorePane(entry)) {
                entry.retirement = null;
                return false
            }
        }

        entry.committed = false;

        const {route} = entry,
              result  = await NativeVesselTransaction.closeVessel({
                  ownerWindowId: sourceId,
                  resolveVessel: (id, key) => id === itemId && key === popupName
                      ? {itemId, nativeRoute: route, windowId: route?.targetWindowId, windowName: popupName, generationToken: popupName}
                      : null,
                  windowNameFor: (id, key) => id === itemId && key === popupName ? popupName : null
              }, {itemId, generationToken: popupName, nativeRoute: route, windowName: popupName, workspaceKey: popupName}),
              closed = result || await this.#isClosed(entry);

        entry.retirement = null;
        if (closed && this.#entry === entry) {
            this.#entry = null;
            if (!result) NativeVesselTransaction.releaseClosedVessel(entry.route).catch(() => {});
            if (focus && !owner.isDestroyed) owner.focus(owner.id, true)
        } else if (entry.target && !this.isDestroyed) {
            entry.view.setAppRecord?.(owner.record);
            entry.view.setReturnHandler?.(() => this.returnToDesktop({focus: true}))
        }
        return closed
    }

    /** @summary Reads closure from the opener's retained handle, independently of document identity. @param {Object} entry */
    async #isClosed({route}) {
        return route ? await NativeVesselTransaction.observeVesselClosure(route).catch(() => null) === true : false
    }

    /** @summary Releases borrowed contents and removes the worker listeners. @param {...*} args */
    destroy(...args) {
        Neo.currentWorker.un({connect: this.onWindowConnect, disconnect: this.onWindowDisconnect, scope: this});
        const entry = this.#entry;
        if (entry) {
            this.#unhookTarget(entry);
            this.#restorePane(entry);
            this.returnToDesktop()
        }
        this.#embodiment.destroy();
        super.destroy(...args)
    }
}

export default Neo.setupClass(WindowTearOut);
