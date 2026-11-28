import Base from '../../plugin/Base.mjs';

const pullClass = 'neo-list-pull-to-refresh';

/**
 * @summary Adds a touch pull and a shared refresh command to a scrolling list.
 * Main admits the pan on the list's live scroll boundary. The owner fires a `refresh` event whose
 * listeners can synchronously provide their work through `waitUntil(promise)`. A view can observe
 * the distance and refreshing configs to paint its indicator and call `refresh()` from a button.
 * @class Neo.list.plugin.PullToRefresh
 * @extends Neo.plugin.Base
 */
class PullToRefresh extends Base {
    static config = {
        /** @member {String} className='Neo.list.plugin.PullToRefresh' */
        className: 'Neo.list.plugin.PullToRefresh',
        /** @member {String} ntype='plugin-list-pull-to-refresh' */
        ntype: 'plugin-list-pull-to-refresh',
        /**
         * Visible pull progress in CSS px, held at the threshold while the work settles.
         * @member {Number} distance_=0
         * @reactive
         */
        distance_: 0,
        /**
         * Whether the owner is processing one refresh.
         * @member {Boolean} refreshing_=false
         * @reactive
         */
        refreshing_: false,
        /**
         * Minimum vertical pull in CSS px.
         * @member {Number} threshold_=64
         * @reactive
         */
        threshold_: 64
    }

    /** @member {Object|null} #listeners */
    #listeners = null
    /** @member {Number|null} #gestureId */
    #gestureId = null

    /**
     * @summary Keeps the commit threshold positive and finite.
     * @param {Number} value
     * @returns {Number}
     * @protected
     */
    beforeSetThreshold(value) {
        return Number.isFinite(value) && value > 0 ? value : 64
    }

    /**
     * @summary Releases this plugin's CSS scope and gesture listeners when the list itself survives.
     * @param {...*} args
     */
    destroy(...args) {
        const {owner} = this;

        if (!owner.isDestroying && !owner.isDestroyed && this.#listeners) {
            owner.removeDomListeners(this.#listeners);
            owner.removeCls(pullClass)
        }

        this.#listeners = null;
        this.#gestureId = null;
        super.destroy(...args)
    }

    /** @summary Installs opted-in phases on the actual list scroller through its normal mount lifecycle. */
    onOwnerConstructed() {
        super.onOwnerConstructed();

        const {owner} = this;

        this.#listeners = [{
            'pan:start' : {fn: this.onPanStart, scope: this, atScrollStart: true},
            'pan:move'  : {fn: this.onPanMove, scope: this},
            'pan:end'   : {fn: this.onPanEnd, scope: this},
            'pan:cancel': {fn: this.onPanCancel, scope: this}
        }];

        owner.addCls(pullClass);
        owner.addDomListeners(this.#listeners);
        this.observeConfig(owner, 'mounted', mounted => {
            if (!mounted) {
                this.resetPull()
            }
        })
    }

    /**
     * @summary Starts a preview only for a downward single-touch pan.
     * @param {Object} data
     * @protected
     */
    onPanStart(data) {
        const distance = this.pullDistance(data);

        if (!this.refreshing && this.#gestureId === null && data.contacts.length === 1 && distance > 0) {
            this.#gestureId = data.gestureId;
            this.distance = distance
        }
    }

    /**
     * @summary Follows the admitted finger and releases the preview if another contact joins.
     * @param {Object} data
     * @protected
     */
    onPanMove(data) {
        if (data.gestureId === this.#gestureId) {
            if (data.contacts.length === 1) {
                this.distance = this.pullDistance(data)
            } else {
                this.resetPull()
            }
        }
    }

    /**
     * @summary Commits the admitted pull once at release, only if its final travel still qualifies.
     * @param {Object} data
     * @protected
     */
    onPanEnd(data) {
        if (data.gestureId === this.#gestureId) {
            if (this.pullDistance(data) >= this.threshold) {
                this.refresh()
            } else {
                this.resetPull()
            }
        }
    }

    /**
     * @summary Clears a cancelled preview without starting a refresh.
     * @param {Object} data
     * @protected
     */
    onPanCancel(data) {
        if (data.gestureId === this.#gestureId) {
            this.resetPull()
        }
    }

    /**
     * @summary Returns bounded preview travel for a touch still moving predominantly downward.
     * @param {Object} data
     * @returns {Number}
     * @protected
     */
    pullDistance({deltaX, deltaY, pointerType}) {
        return pointerType === 'touch' && deltaY > Math.abs(deltaX) ? Math.min(deltaY, this.threshold) : 0
    }

    /**
     * @summary Fires the list refresh event and holds the indicator until all registered work settles.
     * @returns {Promise<Boolean>} Whether a new refresh ran and all its work fulfilled.
     */
    async refresh() {
        if (this.refreshing || this.isDestroyed) return false;

        this.#gestureId = null;
        this.set({distance: this.threshold, refreshing: true});

        const work       = [];
        let   collecting = true;

        try {
            this.owner.fire('refresh', {waitUntil: promise => {
                if (collecting) {
                    work.push(Promise.resolve(promise))
                }
            }})
        } catch (error) {
            work.push(Promise.reject(error))
        } finally {
            collecting = false
        }

        const results = await Promise.allSettled(work);

        if (!this.isDestroyed) {
            this.set({distance: 0, refreshing: false})
        }

        return results.every(result => result.status === 'fulfilled')
    }

    /** @summary Clears the active pull while leaving an in-flight refresh visible. */
    resetPull() {
        this.#gestureId = null;

        if (!this.refreshing) {
            this.distance = 0
        }
    }
}

export default Neo.setupClass(PullToRefresh);
