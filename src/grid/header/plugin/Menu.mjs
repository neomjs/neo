import Plugin      from '../../../plugin/Base.mjs';
import Button      from '../../../button/Base.mjs';
import Component   from '../../../component/Base.mjs';
import Container   from '../../../container/Base.mjs';
import Filter      from '../../../collection/Filter.mjs';
import Store       from '../../../data/Store.mjs';
import Text        from '../../../form/field/Text.mjs';
import ValuePicker from '../../../list/ValuePicker.mjs';

const refusalMessages = {
    'remote-projection'    : 'Values cannot be counted for a remote projection.',
    'incomplete-population': 'Wait for the complete data before filtering values.',
    'raw-complex-fields'   : 'Value counts need canonical records for complex fields.',
    'noncanonical-field'   : 'These values have not been normalized for counting.',
    'unsupported-value'    : 'This column contains values the picker cannot compare.',
    'tree-population'      : 'Value filtering is available for flat data.',
    'unknown-field'        : 'This column does not name a known data field.',
    'unknown-filter'       : 'The filter changed; reopen the value picker.'
};

/**
 * @summary A per-column floating value filter projecting one Store-owned contribution.
 *
 * The source Store owns selection. This plugin owns only its trigger, floating surface and
 * options Store; disposing or rebinding it never removes the source's filter. Option keys map
 * directly to typed source values, independently of the options Model's normalization.
 * @class Neo.grid.header.plugin.Menu
 * @extends Neo.plugin.Base
 */
class Menu extends Plugin {
    static config = {
        /** @member {String} className='Neo.grid.header.plugin.Menu' @protected */
        className: 'Neo.grid.header.plugin.Menu',
        /** @member {String} ntype='plugin-grid-header-menu' @protected */
        ntype: 'plugin-grid-header-menu'
    }

    /** @member {Neo.container.Base|null} surface=null @protected */
    surface = null
    /** @member {Neo.data.Store|null} optionsStore=null @protected */
    optionsStore = null
    /** @member {Neo.list.ValuePicker|null} valuePicker=null @protected */
    valuePicker = null
    /** @member {Neo.button.Base|null} trigger=null @protected */
    trigger = null
    /** @member {Neo.data.Store|null} store=null @private */
    #store = null;
    /** @member {Map} values @private */
    #values = new Map();
    /** @member {String} keyPrefix='' @private */
    #keyPrefix = '';
    /** @member {Number} generation=0 @private */
    #generation = 0;
    /** @member {Number} openSerial=0 @private */
    #openSerial = 0;
    /** @member {Boolean} queued=false @private */
    #queued = false;
    /** @member {Boolean} prepared=false @private */
    #prepared = false;
    /** @member {Function|null} releaseStore=null @private */
    #releaseStore = null;
    /** @member {Function|null} releaseField=null @private */
    #releaseField = null;
    /** @member {Function|null} releaseFilters=null @private */
    #releaseFilters = null;
    /** @member {Array|null} domListeners=null @private */
    #domListeners = null;
    /** @member {Object[]|null} outsideListener=null @private */
    #outsideListener = null;
    /** @member {Neo.component.Base|null} outsideOwner=null @private */
    #outsideOwner = null;
    /** @member {Boolean} refused=false @private */
    #refused = false;
    /** @member {Intl.Collator} labelCollator @private */
    #labelCollator = new Intl.Collator(undefined, {numeric: true});
    /** @member {Object|null} dateFormatters=null @private */
    #dateFormatters = null;

    /**
     * @summary Installs the trigger and observes the header's current source tuple once.
     */
    onOwnerConstructed() {
        super.onOwnerConstructed();
        if (this.#prepared || this.isDestroyed || this.isDestroying) return;
        this.#prepared = true;
        const me = this, owner = me.owner;
        owner.prepareColumnMenuWrapper();
        owner.addCls('neo-grid-menu-enabled');
        me.trigger = Neo.create(Button, {
            appName        : owner.appName, windowId: owner.windowId, parentComponent: owner,
            parentId       : owner.vdom.id, cls: ['neo-grid-menu-trigger'], text: '▾',
            useRippleEffect: false, handler: () => me.open(),
            vdom           : {'aria-label': `Filter ${owner.text || owner.dataField}`, 'aria-haspopup': 'dialog'}
        });
        me.trigger.addDomListeners({keydown: {fn: me.onHeaderKeyDown, scope: me, bubble: true}});
        owner.vdom.cn.push(me.trigger.createVdomReference());
        owner.updateDepth = -1;
        owner.update();
        me.#domListeners = [
            {contextmenu: me.onContextMenu, scope: me},
            {keydown: {fn: me.onHeaderKeyDown, scope: me, bubble: true}}
        ];
        if (owner.mounted) {
            me.trap((owner.parent || owner).promiseUpdate()).then(() => {
                if (!me.isDestroyed && !me.isDestroying) owner.addDomListeners(me.#domListeners)
            })
        } else {
            owner.addDomListeners(me.#domListeners)
        }
        me.#releaseField = me.observeConfig(owner, 'dataField', () => me.bindStore(me.#store));
        const grid = owner.up('grid-container');
        if (grid) {
            me.#releaseStore = me.observeConfig(grid, 'store', store => me.bindStore(store));
            me.bindStore(grid.store)
        }
        if (owner.windowId) {
            Neo.main.DomEvents.registerPreventDefaultTargets({
                cls: 'neo-grid-menu-enabled', name: 'contextmenu', windowId: owner.windowId
            })
        }
    }

    /**
     * @summary Rebinds borrowed source observers synchronously and fences queued work from the old tuple.
     * @param {Neo.data.Store|null} store
     */
    bindStore(store) {
        this.#generation++;
        this.#queued = false;
        this.#releaseFilters?.();
        this.#releaseFilters = null;
        this.#store?.un(this.sourceListeners());
        this.#store = store;
        this.#values = new Map();
        this.#refused = true;
        this.#keyPrefix = `${JSON.stringify([store?.id || null, this.owner.dataField])}:`;
        if (store) {
            store.on(this.sourceListeners());
            this.#releaseFilters = this.observeConfig(store, 'filters', () => this.scheduleRefresh())
        }
        if (this.surface && !this.surface.hidden) this.refreshOptions()
    }

    /** @summary Returns a fresh listener config because Observable consumes its scope key. @returns {Object} */
    sourceListeners() {
        return {filter: 'scheduleRefresh', load: 'scheduleRefresh', mutate: 'scheduleRefresh',
            recordChange: 'scheduleRefresh', scope: this}
    }

    /** @summary Coalesces open-surface recounts and discards old-source or retired work. */
    scheduleRefresh() {
        if (!this.surface || this.surface.hidden || this.#queued) return;
        this.#queued = true;
        const generation = this.#generation;
        queueMicrotask(() => {
            if (generation !== this.#generation || this.isDestroyed || this.isDestroying) return;
            this.#queued = false;
            if (!this.surface.hidden) this.refreshOptions()
        })
    }

    /** @summary Creates the owner-local floating interaction island without borrowing the source as its options Store. */
    createSurface() {
        const me = this, owner = me.owner;
        me.optionsStore = Neo.create(Store, {
            autoInitRecords: false, keyProperty: 'key', data: [], model: {fields: [
                {name: 'key'}, {name: 'value'}, {name: 'label'}, {name: 'count', type: 'Number'}
            ]}
        });
        me.surface = Neo.create(Container, {
            appName : owner.appName, windowId: owner.windowId, parentComponent: owner,
            parentId: 'document.body', floating: true, hidden: true, width: 320,
            cls     : ['neo-grid-column-menu'], role: 'dialog',
            align   : {edgeAlign: 't0-b0', axisLock: true, target: owner.id},
            layout  : {ntype: 'vbox', align: 'stretch'},
            vdom    : {'aria-label': `Filter ${owner.text || owner.dataField}`},
            items   : [
                {module: Text, labelText: 'Search values', labelPosition: 'top', reference: 'search',
                    listeners: {change: ({value}) => {me.valuePicker.searchValue = value || ''}}},
                {module: ValuePicker, reference: 'values', store: me.optionsStore,
                    listeners: {selectionChange: data => me.onSelectionChange(data)}},
                {module: Component, reference: 'status', hidden: true, role: 'status'},
                {module: Button, reference: 'clear', text: 'Clear', hidden: true,
                    handler: data => me.onClearClick(data)}
            ]
        });
        me.valuePicker = me.surface.getItem('values');
        me.surface.addDomListeners({keydown: {fn: me.onSurfaceKeyDown, scope: me, bubble: true}});
        me.observeConfig(me.surface, 'mounted', value => me.syncOutsideListener(value))
    }

    /**
     * @summary Opens the same surface from pointer, touch or keyboard and reads fresh authoritative state.
     * @returns {Promise}
     */
    async open() {
        if (this.isDestroyed || this.isDestroying || !this.owner.columnMenu) return;
        const serial = ++this.#openSerial;
        await this.trap((this.owner.parent || this.owner).promiseUpdate());
        if (this.isDestroyed || this.isDestroying || !this.owner.columnMenu || serial !== this.#openSerial) return;
        if (!this.surface) this.createSurface();
        this.refreshOptions();
        this.surface.hidden = false;
        await this.surface.promiseUpdate();
        if (!this.isDestroyed && serial === this.#openSerial && !this.surface.hidden) this.surface.getItem('search').focus()
    }

    /** @summary Dismisses the complete island and restores native header focus. */
    close() {
        ++this.#openSerial;
        if (!this.surface || this.surface.hidden) return;
        this.surface.hidden = true;
        this.syncOutsideListener(false);
        this.owner.focus()
    }

    /**
     * @summary Projects selected zero-count values and contextual buckets, cancelling redundant queued recounts.
     */
    refreshOptions() {
        this.#generation++;
        this.#queued = false;
        const store  = this.#store, field = this.owner.dataField;
        let   filter = store?.getFilter(field, 'header-picker'), buckets;
        try {
            buckets = store ? store.getFilterValues(field, filter || null) : {refused: true, reason: 'incomplete-population'}
        } catch (error) {
            this.showRefusal('Unable to read values.');
            throw error
        }
        if (buckets.refused) {
            this.showRefusal(refusalMessages[buckets.reason] || 'Values cannot be counted for this data.');
            return
        }
        this.#refused = false;
        this.#values = new Map();
        const records = new Map(), selected = Array.isArray(filter?.value) ? filter.value : [];
        for (const bucket of buckets) {
            const key = this.getOptionKey(bucket.value);
            this.#values.set(key, bucket.value);
            records.set(key, {...bucket, key, label: this.formatValueLabel(bucket.value)})
        }
        for (const value of selected) {
            const key = this.getOptionKey(value);
            this.#values.set(key, value);
            if (!records.has(key)) records.set(key, {key, value, label: this.formatValueLabel(value), count: 0})
        }
        this.optionsStore.data = [...records.values()].sort((a, b) => this.compareOptions(a, b));
        this.valuePicker.selection = selected.map(value => this.getOptionKey(value));
        this.valuePicker.hidden = false;
        this.surface.getItem('status').hidden = true;
        const clear = this.surface.getItem('clear');
        clear.vdom['data-picker-scope'] = this.#keyPrefix;
        clear.hidden = !selected.length;
        clear.update()
    }

    /**
     * @summary Groups scalar types, orders numbers and Dates by value, and naturally collates labels.
     * @param {Object} a
     * @param {Object} b
     * @returns {Number}
     */
    compareOptions(a, b) {
        const typeA = a.value instanceof Date ? 'date' : a.value === null ? 'null' : typeof a.value,
              typeB = b.value instanceof Date ? 'date' : b.value === null ? 'null' : typeof b.value;
        if (typeA !== typeB) return typeA < typeB ? -1 : 1;
        if (typeA === 'number' || typeA === 'date') {
            const valueA = typeA === 'date' ? a.value.getTime() : a.value,
                  valueB = typeB === 'date' ? b.value.getTime() : b.value;
            return valueA < valueB ? -1 : valueA > valueB ? 1 : 0
        }
        return this.#labelCollator.compare(a.label, b.label) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    }

    /**
     * @summary Formats locale-aware Dates and distinct empty values without invoking a cell renderer.
     * @param {*} value
     * @returns {String}
     */
    formatValueLabel(value) {
        if (value instanceof Date) {
            const locale     = Neo.config.locale;
            let   formatters = this.#dateFormatters;
            if (!formatters || formatters.locale !== locale) {
                formatters = this.#dateFormatters = {
                    locale,
                    date    : new Intl.DateTimeFormat(locale, {dateStyle: 'medium'}),
                    dateTime: new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'medium'})
                }
            }
            const midnight = value.getHours() === 0 && value.getMinutes() === 0 &&
                value.getSeconds() === 0 && value.getMilliseconds() === 0;
            return (midnight ? formatters.date : formatters.dateTime).format(value)
        }
        if (value === '') return '(blank)';
        if (value === null) return '(null)';
        if (value === undefined) return '(undefined)';
        return String(value)
    }

    /**
     * @summary Names an option in its current source tuple so stale field/source intents cannot select a same-valued new option.
     * @param {*} value
     * @returns {String}
     */
    getOptionKey(value) {
        return this.#keyPrefix + Filter.getValueKey(value)
    }

    /** @param {String} message @summary Renders a visible refusal and disables value writes. */
    showRefusal(message) {
        this.#refused = true;
        this.optionsStore.data = [];
        this.valuePicker.selection = [];
        this.valuePicker.hidden = true;
        this.surface.getItem('status').set({hidden: false, html: message});
        this.surface.getItem('clear').hidden = true
    }

    /**
     * @summary Writes only this tuple's contribution from typed source values; projection never calls this path.
     * @param {Object} data
     * @param {String[]} data.selection
     * @param {String[]} [data.added=[]]
     * @param {String[]} [data.removed=[]]
     */
    onSelectionChange({selection, added=[], removed=[]}) {
        if (this.#refused || !this.#store) return;
        if ([...selection, ...added, ...removed].some(key => !this.#values.has(key))) return;
        const store = this.#store, field = this.owner.dataField,
            filter  = store.getFilter(field, 'header-picker');
        if (!selection.length) {
            if (filter) store.filters = store.filters.filter(item => item !== filter)
        } else {
            const value = selection.map(key => this.#values.get(key));
            if (filter) filter.value = value;
            else store.filters = [...store.filters, {
                property             : field, ownerRole: 'header-picker', operator: 'typedIncluded',
                reapplyOnRecordChange: true, value
            }]
        }
        this.refreshOptions()
    }

    /**
     * @summary Clears only the source tuple the native Clear button displayed at input capture.
     * @param {Object} data
     */
    onClearClick(data) {
        const clear = this.surface.getItem('clear'), node = data.path?.find(item => item.id === clear.id);
        if (node?.data?.pickerScope === this.#keyPrefix) this.onSelectionChange({selection: []})
    }

    /** @param {Object} data @summary Opens on the routed context menu without changing sorting. */
    onContextMenu(data) {
        this.open()
    }

    /** @param {Object} data @summary Opens on the header's context-menu keyboard gestures. */
    onHeaderKeyDown(data) {
        if (data.key === 'ContextMenu' || data.key === 'F10' && data.shiftKey) this.open()
        else if (data.key === 'Escape') this.close()
    }

    /** @param {Object} data @summary Escape dismisses from every focusable child of the floating surface. */
    onSurfaceKeyDown(data) {
        if (data.key === 'Escape') this.close()
    }

    /** @param {Boolean} attach @summary Keeps the outside-pointer listener bound only while the surface is mounted. */
    syncOutsideListener(attach) {
        if (attach && !this.#outsideOwner) {
            const owner = this.owner.app?.mainView;
            if (owner) {
                this.#outsideListener ||= [
                    {mousedown: this.onOutsidePointer, scope: this},
                    {touchstart: this.onOutsidePointer, scope: this}
                ];
                owner.addDomListeners(this.#outsideListener);
                this.#outsideOwner = owner
            }
        } else if (!attach && this.#outsideOwner) {
            this.#outsideOwner.removeDomListeners(this.#outsideListener);
            this.#outsideOwner = null
        }
    }

    /** @param {Object} data @summary A pointer inside the surface or its trigger belongs to the same interaction island. */
    onOutsidePointer(data) {
        const ids = new Set([this.surface?.id, this.trigger?.id]);
        if (!(data.path || []).some(node => ids.has(node.id))) this.close()
    }

    /** @param {Array} args @summary Releases owned UI and borrowed observers while leaving source intent intact. */
    destroy(...args) {
        this.#generation++;
        this.#openSerial++;
        this.#releaseStore?.(); this.#releaseField?.(); this.#releaseFilters?.();
        this.#store?.un(this.sourceListeners());
        this.syncOutsideListener(false);
        if (this.#domListeners) this.owner.removeDomListeners(this.#domListeners);
        this.owner.un('mounted', this.onOwnerMounted, this);
        this.surface?.destroy(true);
        this.optionsStore?.destroy();
        if (this.trigger) {
            const id = this.trigger.id;
            this.owner.vdom.cn = this.owner.vdom.cn.filter(node => node.componentId !== id && node.id !== id);
            this.trigger.destroy();
            if (!this.owner.isDestroying && !this.owner.isDestroyed) {
                this.owner.updateDepth = -1;
                this.owner.update()
            }
        }
        this.owner.removeCls('neo-grid-menu-enabled');
        super.destroy(...args)
    }
}

export default Neo.setupClass(Menu);
