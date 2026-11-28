import Base         from '../../plugin/Base.mjs';
import ToastManager from '../../manager/Toast.mjs';
import '../../component/Toast.mjs';

const swipeClass = 'neo-list-swipe-actions';

/**
 * @summary Adds a record-bound trailing action to a buffered list.
 * Main's first-contact path identifies the rendered binding. App verifies it against the current
 * slot before showing a preview or applying the action. A view can paint the revealed action from
 * `slotId` and `distance`, and pass a binding from a visible control to the same commit command.
 * @class Neo.list.plugin.SwipeActions
 * @extends Neo.plugin.Base
 */
class SwipeActions extends Base {
    static config = {
        /** @member {String} className='Neo.list.plugin.SwipeActions' */
        className: 'Neo.list.plugin.SwipeActions',
        /** @member {String} ntype='plugin-list-swipe-actions' */
        ntype: 'plugin-list-swipe-actions',
        /**
         * Applies the action to `{key, record, store}` and returns `{message, undo}` for its Toast.
         * @member {Function|null} action=null
         */
        action: null,
        /**
         * Visible trailing reveal in CSS px.
         * @member {Number} distance_=0
         * @reactive
         */
        distance_: 0,
        /**
         * The physical slot currently displaying the validated preview.
         * @member {String|null} slotId_=null
         * @reactive
         */
        slotId_: null,
        /**
         * Positive leftward travel required to commit on release.
         * @member {Number} threshold_=80
         * @reactive
         */
        threshold_: 80
    }

    /** @member {Object|null} #binding */
    #binding = null
    /** @member {WeakSet<Object>} #committed */
    #committed = new WeakSet()
    /** @member {Number|null} #gestureId */
    #gestureId = null
    /** @member {Object[]|null} #listeners */
    #listeners = null

    /**
     * @summary Keeps the release threshold finite and positive.
     * @param {Number} value
     * @returns {Number}
     * @protected
     */
    beforeSetThreshold(value) {
        return Number.isFinite(value) && value > 0 ? value : 80
    }

    /**
     * @summary Retires the preview and removes bindings if the list itself survives.
     * @param {...*} args
     */
    destroy(...args) {
        const {owner} = this;

        if (!owner.isDestroying && !owner.isDestroyed && this.#listeners) {
            owner.removeDomListeners(this.#listeners);
            owner.removeCls(swipeClass);
            owner.un('createItems', this.checkPreview, this)
        }

        this.#binding = null;
        this.#gestureId = null;
        this.#listeners = null;
        super.destroy(...args)
    }

    /** @summary Registers one pan stream on the real scrolling list. */
    onOwnerConstructed() {
        super.onOwnerConstructed();

        const {owner} = this;

        this.#listeners = [{
            'pan:start' : {fn: this.onPanStart, scope: this},
            'pan:move'  : {fn: this.onPanMove, scope: this},
            'pan:end'   : {fn: this.onPanEnd, scope: this},
            'pan:cancel': {fn: this.onPanCancel, scope: this}
        }];

        owner.addCls(swipeClass);
        owner.addDomListeners(this.#listeners);
        owner.on('createItems', this.checkPreview, this);
        this.observeConfig(owner, 'mounted', mounted => {
            if (!mounted) {
                this.clearPreview()
            }
        })
    }

    /**
     * @summary Snapshots the rendered row identity from the native event path.
     * @param {Object} data
     * @returns {Object|null}
     */
    getBinding(data) {
        const {owner} = this,
              {store} = owner,
              row     = data?.path?.find(({id, data: rowData}) =>
                  rowData?.slotBinding != null && id === owner.getSlotId(Number(rowData.poolIndex)));

        if (!row || !store) return null;

        const internal = owner.useInternalId,
              recordId = internal ? row.data.recordId : store.getCanonicalKey(row.data.recordId);

        return recordId == null ? null : {id: row.id, internal, recordId, stamp: String(row.data.slotBinding), store}
    }

    /**
     * @summary Returns the record only while the exact rendered binding is still current.
     * @param {Object|null} binding
     * @returns {Neo.data.Record|null}
     * @protected
     */
    getBoundRecord(binding) {
        if (!binding || binding.store !== this.owner.store || binding.internal !== this.owner.useInternalId) return null;

        const data = this.owner.getVdomChild(binding.id)?.data;

        if (!data || String(data.slotBinding) !== binding.stamp || data.recordId !== binding.recordId) return null;

        return binding.internal ? binding.store.getByInternalId(binding.recordId) : binding.store.get(binding.recordId)
    }

    /**
     * @summary Locks a leftward single touch to the binding in its first-contact path.
     * @param {Object} data
     * @protected
     */
    onPanStart(data) {
        const travel = -data.deltaX;

        if (data.pointerType !== 'touch' || data.contacts.length !== 1 || travel <= Math.abs(data.deltaY)) return;

        this.clearPreview();
        const binding = this.getBinding(data);

        if (typeof this.action === 'function' && this.getBoundRecord(binding)) {
            this.#binding = binding;
            this.#gestureId = data.gestureId;
            this.set({slotId: binding.id, distance: Math.min(this.threshold, travel)})
        }
    }

    /**
     * @summary Follows only the admitted contact while its original binding is still current.
     * @param {Object} data
     * @protected
     */
    onPanMove(data) {
        if (data.gestureId !== this.#gestureId) return;

        if (data.contacts.length !== 1 || !this.getBoundRecord(this.#binding)) {
            this.clearPreview();
            return
        }

        this.distance = Math.max(0, Math.min(this.threshold, -data.deltaX))
    }

    /**
     * @summary Commits a qualifying release or leaves a short, deliberate reveal available for tapping.
     * @param {Object} data
     * @protected
     */
    onPanEnd(data) {
        if (data.gestureId !== this.#gestureId) return;

        const binding = this.#binding,
              travel  = -data.deltaX;

        this.#gestureId = null;

        if (!this.getBoundRecord(binding) || travel <= Math.abs(data.deltaY) || travel < Math.min(24, this.threshold)) {
            this.clearPreview()
        } else if (travel >= this.threshold) {
            this.commit(binding)
        } else {
            this.distance = this.threshold
        }
    }

    /**
     * @summary Releases one cancelled preview without changing its record.
     * @param {Object} data
     * @protected
     */
    onPanCancel(data) {
        if (data.gestureId === this.#gestureId) {
            this.clearPreview()
        }
    }

    /** @summary Clears a displayed action if the list has since rebound that slot. */
    checkPreview() {
        if (this.#binding && !this.getBoundRecord(this.#binding)) {
            this.clearPreview()
        }
    }

    /** @summary Clears the active gesture and its visual projection. */
    clearPreview() {
        this.#binding = null;
        this.#gestureId = null;
        this.set({slotId: null, distance: 0})
    }

    /**
     * @summary Commits an action from release, a revealed button, or a visible menu using the same binding check.
     * @param {Object|null} binding
     * @returns {Boolean} Whether the action was applied.
     */
    commit(binding) {
        const record = this.getBoundRecord(binding);

        if (!record || typeof this.action !== 'function' || this.#committed.has(binding)) {
            this.checkPreview();
            return false
        }

        this.#committed.add(binding);
        this.clearPreview();

        const {owner} = this,
              receipt = this.action({record, key: binding.store.getKey(record), store: binding.store});

        if (typeof receipt?.undo === 'function') {
            ToastManager.createToast({
                action  : {text: 'Undo', handler: receipt.undo},
                appName : owner.appName,
                msg     : receipt.message || 'Action applied',
                position: 'bc',
                windowId: owner.windowId
            })
        }

        return true
    }
}

export default Neo.setupClass(SwipeActions);
