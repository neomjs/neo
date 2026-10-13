import Plugin from './Base.mjs';

/**
 * @summary Projects the current Store/column inline contribution into a Grid or Table header field.
 * The Store owns the predicate. Rebinding and disposal release observations, never contributions.
 * @class Neo.plugin.HeaderFilter
 * @extends Neo.plugin.Base
 */
class HeaderFilter extends Plugin {
    static config = {
        /** @member {String} className='Neo.plugin.HeaderFilter' @protected */
        className: 'Neo.plugin.HeaderFilter',
        /** @member {String} ntype='plugin-header-filter' @protected */
        ntype: 'plugin-header-filter'
    }

    /** @member {Neo.component.Base|null} container=null @private */
    #container = null
    /** @member {Function|null} containerCleanup=null @private */
    #containerCleanup = null
    /** @member {Function|null} filtersCleanup=null @private */
    #filtersCleanup = null
    /** @member {Function[]} ownerCleanups=[] @private */
    #ownerCleanups = []
    /** @member {Neo.data.Store|null} store=null @private */
    #store = null

    /**
     * @summary Returns the borrowed Store currently observed by this header.
     * @returns {Neo.data.Store|null}
     */
    get sourceStore() {
        return this.#store
    }

    /**
     * @summary Follows the header's current Grid/Table container without adding a source ownership API.
     * @param {Neo.component.Base|null} [container]
     */
    bindContainer(container=this.owner.up('grid-container') || this.owner.up('table-container')) {
        if (this.isDestroyed) return;
        if (container !== this.#container) {
            this.#containerCleanup?.();
            this.#container = container;
            this.#containerCleanup = container
                ? this.observeConfig(container, 'store', value => this.bindStore(value))
                : null
        }
        this.bindStore(container?.store ?? null)
    }

    /**
     * @summary Replaces observations of a borrowed Store and projects its current inline contribution.
     * @param {Neo.data.Store|null} store
     */
    bindStore(store) {
        if (this.isDestroyed) return;
        if (store !== this.#store) {
            this.#releaseStore();
            this.#store = store;
            if (store) {
                this.#filtersCleanup = this.observeConfig(store, 'filters', () => this.syncField());
                store.on({filter: this.syncField, load: this.syncField, scope: this})
            }
        }
        this.syncField()
    }

    /**
     * @summary Releases only this plugin's Store observers; the Store and its filters remain owned elsewhere.
     */
    #releaseStore() {
        this.#filtersCleanup?.();
        this.#filtersCleanup = null;
        this.#store?.un({filter: this.syncField, load: this.syncField, scope: this});
        this.#store = null
    }

    /**
     * @summary Binds once the header is constructed, including plugins created during owner construction.
     * @protected
     */
    onOwnerConstructed() {
        if (this.isDestroyed) return;
        super.onOwnerConstructed();
        if (!this.#ownerCleanups.length) {
            this.#ownerCleanups = [
                this.observeConfig(this.owner, 'dataField', () => this.syncField()),
                this.observeConfig(this.owner, 'parentId', () => this.bindContainer())
            ]
        }
        this.bindContainer()
    }

    /**
     * @summary Re-resolves the source after owner mounting without duplicating subscriptions.
     * @protected
     */
    onOwnerMounted() {
        if (!this.isDestroyed) this.bindContainer()
    }

    /**
     * @summary Echoes only the exact inline contribution, suppressing field events that could write it back.
     * Call after creating or showing a previously absent inline field. Text fields have no operator config;
     * operator-capable fields reset to their creation default when the contribution is absent.
     */
    syncField() {
        if (this.isDestroyed) return;
        const {owner} = this, field = owner.filterField;
        if (!field || field.isDestroyed || owner.isDestroyed) return;
        const filter = this.#store?.getFilter(owner.dataField, 'header-inline'),
            values   = {value: filter?.value ?? null}, suspended = field.suspendEvents;
        if (field.isConfig('operator')) {
            values.operator = filter ? filter.operator : (field.originalConfig.operator ?? field.constructor.config.operator)
        }
        field.suspendEvents = true;
        try {
            field.set(values)
        } finally {
            field.suspendEvents = suspended
        }
    }

    /**
     * @summary Releases source/config observations without clearing the field or deleting its contribution.
     * @param {Array} args
     */
    destroy(...args) {
        this.#ownerCleanups.forEach(cleanup => cleanup());
        this.#containerCleanup?.();
        this.#releaseStore();
        this.owner.un('mounted', this.onOwnerMounted, this);
        super.destroy(...args)
    }
}

export default Neo.setupClass(HeaderFilter);
