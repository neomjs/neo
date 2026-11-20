import Base           from '../core/Base.mjs';
import {generateUUID} from '../util/UUID.mjs';

/**
 * @summary Hosts a floating desktop window's live body in a native popup. The desktop keeps the AppWindow,
 * its task and the source drag zone while the same body moves between browser windows on the shared App worker.
 * @class Neo.desktop.WindowTearOut
 * @extends Neo.core.Base
 */
class WindowTearOut extends Base {
    static config = {
        /**
         * @member {String} className='Neo.desktop.WindowTearOut'
         * @protected
         */
        className: 'Neo.desktop.WindowTearOut',
        /** @member {Neo.desktop.AppWindow|null} owner=null The window whose body is borrowed. */
        owner: null,
        /** @member {String|null} popupUrl=null Same-origin page that boots the child viewport. */
        popupUrl: null
    }

    /** @member {Object|null} #entry The current admission, including a popup whose child app is still booting. */
    #entry = null

    /**
     * @summary Whether release left the app in its native window.
     * @returns {Boolean}
     */
    get committed() {
        return this.#entry?.committed === true
    }

    /**
     * @summary Returns the child's measured outer extent once the browser has given it a frame.
     * @returns {{width:Number,height:Number}|null}
     */
    get currentSize() {
        return this.#entry?.size ?? null
    }

    /**
     * @summary Listens for child arrivals and departures on the same App worker.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        Neo.currentWorker.on({connect: this.onWindowConnect, disconnect: this.onWindowDisconnect, scope: this})
    }

    /**
     * @summary Opens the native drag proxy. A later connection attaches the existing app body. A late grant for a
     * cancelled gesture closes only its own popup.
     * @param {Object} data
     * @param {Number} [data.gestureId] Source Main's current pointer gesture, for cancelling from the child
     * @param {Object} data.rect Requested screen-space outer rectangle in CSS pixels
     * @returns {Promise<{popupName:String,popupWidth:Number,popupHeight:Number}|null>}
     */
    async open({gestureId, rect}) {
        const me        = this,
              {owner}   = me,
              sourceId  = owner.windowId,
              sourceUrl = Neo.windowConfigs?.[sourceId]?.url?.href,
              body      = owner.getItem('bodyContainer');

        if (!Neo.currentWorker.isSharedWorker || !sourceUrl || !body || me.committed) return null;

        const address    = new URL(me.popupUrl, sourceUrl), source = new URL(sourceUrl),
              left       = Math.round(rect.left ?? rect.x), top = Math.round(rect.top ?? rect.y),
              popupWidth = Math.round(rect.width), popupHeight = Math.round(rect.height);

        if (address.origin !== source.origin || ![left, top, popupWidth, popupHeight].every(Number.isFinite) ||
            popupWidth < 1 || popupHeight < 1) return null;

        me.returnToDesktop();
        const popupName = generateUUID(), home = body.parent,
              entry     = {body, gestureId, home, index: home.indexOf(body), popupName, sourceId};

        if (entry.index < 0) return null;
        me.#entry = entry;
        source.searchParams.forEach((value, key) => {
            if (!address.searchParams.has(key)) address.searchParams.set(key, value)
        });
        address.searchParams.set('desktopPopup', popupName);

        try {
            entry.admitted = await Neo.Main.windowOpen({
                nativeCapabilities: {close: true, focus: true, position: true},
                url               : address.href,
                windowFeatures    : `popup=yes,left=${left},top=${top},width=${popupWidth},height=${popupHeight}`,
                windowId          : sourceId,
                windowName        : popupName
            }) === true
        } catch {
            entry.admitted = false
        }

        if (me.#entry !== entry) {
            entry.admitted && me.#close(entry);
            return null
        }
        if (!entry.admitted) {
            me.#entry = null;
            return null
        }

        if (entry.target) {
            me.#attach(entry)
        } else {
            // A window that closes before its App worker connects never emits a matching disconnect.
            entry.timer = setTimeout(() => me.#lost(entry), 10_000)
        }
        return me.#entry === entry ? {popupName, popupWidth, popupHeight} : null
    }

    /**
     * @summary Associates a child with its opener and unique gesture before borrowing its viewport.
     * @param {Object} data App worker connect event
     * @protected
     */
    onWindowConnect({windowId, windowData}) {
        const me = this, entry = me.#entry, config = Neo.windowConfigs[windowId];

        if (!entry || new URLSearchParams(config?.url?.search).get('desktopPopup') !== entry.popupName) return;
        const route = windowData?.nativeRoute;

        if (entry.target || route?.ownerWindowId !== entry.sourceId || route?.targetWindowId !== windowId) return;
        const target = Neo.apps[windowId]?.mainView;
        if (!target) return;

        const {outerWidth: width, outerHeight: height} = windowData;
        if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
            entry.size = {width, height}
        }
        entry.route  = route;
        entry.target = target;
        if (entry.admitted) me.#attach(entry)
    }

    /**
     * @summary Mounts the existing body in the popup, retaining its desktop state-provider ancestry.
     * @param {Object} entry The admitted popup and its source slot
     */
    #attach(entry) {
        const me = this, {body, home, target} = entry;
        clearTimeout(entry.timer);
        try {
            // The contents depend on theme tokens owned by two classes that stay in the source window.
            const root = Neo.apps[entry.sourceId]?.mainView;
            if (root) Neo.currentWorker.insertThemeFiles(target.windowId, Object.getPrototypeOf(root));
            Neo.currentWorker.insertThemeFiles(target.windowId, Object.getPrototypeOf(me.owner));
            target.theme = body.getTheme();
            target.parentComponent = me.owner;
            entry.bodyTheme = body.theme;
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
            home.remove(body, false, true);
            target.add(body, true);
            home.updateDepth = target.updateDepth = -1;
            home.update();
            target.promiseUpdate().catch(() => me.#lost(entry))
        } catch {
            me.#lost(entry)
        }
    }

    /**
     * @summary Retains the current native admission across pointer release.
     * @returns {Boolean}
     */
    commit() {
        const entry = this.#entry;
        if (!entry?.admitted) return false;
        entry.committed = true;
        return true
    }

    /**
     * @summary Asks the source browser to focus the exact admitted popup.
     * @returns {Promise<Boolean>}
     */
    async focus() {
        const entry = this.#entry;
        if (!entry?.admitted) return false;
        try {
            const focused = entry.route
                ? await Neo.Main.windowNativeFocus({...entry.route, windowId: entry.sourceId})
                : await Neo.Main.windowFocus({windowName: entry.popupName, windowId: entry.sourceId});
            return this.#entry === entry && focused === true
        } catch {
            return false
        }
    }

    /**
     * @summary Moves a departed window's body home before the worker reaps the departed app.
     * @param {Object} data App worker disconnect event
     * @protected
     */
    onWindowDisconnect({windowId}) {
        const entry = this.#entry;
        if (entry?.route?.targetWindowId === windowId) this.#lost(entry)
    }

    /**
     * @summary Restores a failed or departed generation and informs its gesture owner.
     * @param {Object} entry
     */
    #lost(entry) {
        if (this.#entry !== entry) return;
        this.returnToDesktop();
        this.owner.onTearOutDisconnect?.({committed: entry.committed === true})
    }

    /**
     * @summary Releases the native handle of this unique admission.
     * @param {Object} entry
     */
    #close(entry) {
        Neo.Main.windowClose({names: entry.popupName, windowId: entry.sourceId}).catch(() => {})
    }

    /** @summary Cancels acquisition or restores the body synchronously to its original slot, then closes its popup. */
    returnToDesktop() {
        const entry = this.#entry;
        if (!entry) return;
        this.#entry = null;
        clearTimeout(entry.timer);

        const {body, home, index, target} = entry;
        if (target) {
            entry.keyListener && target.removeDomListeners(entry.keyListener);
            if (!home.isDestroyed && !home.isDestroying && !body.isDestroyed && !home.items.includes(body)) {
                target.remove(body, false, true);
                home.insert(index, body, true);
                body.theme = entry.bodyTheme;
                home.updateDepth = -1;
                home.update()
            }
            target.parentComponent = null
        }
        if (entry.admitted) this.#close(entry)
    }

    /**
     * @summary Returns borrowed contents and removes the worker listeners.
     * @param {...*} args
     */
    destroy(...args) {
        Neo.currentWorker.un({connect: this.onWindowConnect, disconnect: this.onWindowDisconnect, scope: this});
        this.returnToDesktop();
        super.destroy(...args)
    }
}

export default Neo.setupClass(WindowTearOut);
