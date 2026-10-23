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
    /** @member {Neo.grid.header.Button|null} hintTarget=null @protected */
    hintTarget = null
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
    /** @member {Function|null} releaseFiltered=null @private */
    #releaseFiltered = null;
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
            parentId       : owner.vdom.id, cls: ['neo-grid-menu-trigger'], text: me.getTriggerGlyph(),
            useRippleEffect: false, handler: () => me.open(),
            vdom           : {'aria-label': me.getTriggerLabel(), 'aria-haspopup': 'dialog'}
        });
        me.#releaseFiltered = me.observeConfig(owner, 'isFiltered', () => me.syncTrigger());
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
                // The trigger is a sibling of the header button, so its own event path never carries the
                // header's class: without the trigger, a right-click on the arrow opens the browser's menu.
                cls: ['neo-grid-menu-enabled', 'neo-grid-menu-trigger'], name: 'contextmenu', windowId: owner.windowId
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
        if (this.surface && !this.surface.hidden && !this.hintTarget) this.refreshOptions()
    }

    /** @summary Closes any open menu or hint surface on sibling header plugins in the same wrapper. */
    closeSiblingMenus() {
        for (const toolbar of this.owner.up('grid-header-wrapper')?.getToolbars() || []) {
            for (const item of toolbar.items || []) {
                const plugin = item.getPlugin('plugin-grid-header-menu');
                if (plugin && plugin !== this) plugin.close(false)
            }
        }
    }

    /** @summary The filled glyph marks a filtered column; the outline glyph an unfiltered one. @returns {String} */
    getTriggerGlyph() {
        return this.owner.isFiltered ? '▾' : '▿'
    }

    /** @summary ARIA has no filtered columnheader attribute, so the trigger's label carries the state. @returns {String} */
    getTriggerLabel() {
        const {owner} = this, label = `Filter ${owner.text || owner.dataField}`;
        return owner.isFiltered ? `${label}, active` : label
    }

    /** @summary Projects the header's filtered state into the trigger's glyph and label. */
    syncTrigger() {
        const {trigger} = this;
        if (!trigger || trigger.isDestroyed) return;
        trigger.vdom['aria-label'] = this.getTriggerLabel();
        trigger.text = this.getTriggerGlyph();
        trigger.update()
    }

    /** @summary Returns a fresh listener config because Observable consumes its scope key. @returns {Object} */
    sourceListeners() {
        return {filter: 'scheduleRefresh', load: 'scheduleRefresh', mutate: 'scheduleRefresh',
            recordChange: 'scheduleRefresh', scope: this}
    }

    /** @summary Coalesces open-surface recounts and discards old-source or retired work. */
    scheduleRefresh() {
        if (!this.surface || this.surface.hidden || this.hintTarget || this.#queued) return;
        this.#queued = true;
        const generation = this.#generation;
        queueMicrotask(() => {
            if (generation !== this.#generation || this.isDestroyed || this.isDestroying) return;
            this.#queued = false;
            if (!this.surface.hidden && !this.hintTarget) this.refreshOptions()
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
            // open() owns the initial focus, so it can yield to a value picked before it lands
            focusOnMount: false,
            cls         : ['neo-grid-column-menu'], role: 'dialog',
            align       : {edgeAlign: 't0-b0', axisLock: true, target: owner.id},
            layout      : {ntype: 'vbox', align: 'stretch'},
            vdom        : {'aria-label': `Filter ${owner.text || owner.dataField}`},
            items       : [
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
     * @summary Opens the floating surface in value-picker mode (default) or disabled-column hint mode (`hintButton`).
     *
     * The search field takes focus one round trip after the surface shows, so a value picked in between keeps focus:
     * the main thread skips the search focus while focus already sits inside the surface.
     * @param {Neo.grid.header.Button|null} [hintButton=null]
     * @returns {Promise}
     */
    async open(hintButton=null) {
        const button = hintButton || this.owner,
              isHint = Boolean(hintButton);
        if (this.isDestroyed || this.isDestroying || !button || button.isDestroyed || Boolean(button.columnMenu) === isHint) return;
        const serial = ++this.#openSerial;
        this.closeSiblingMenus();
        await this.trap((button.parent || button).promiseUpdate());
        if (this.isDestroyed || this.isDestroying || button.isDestroyed || Boolean(button.columnMenu) === isHint ||
            serial !== this.#openSerial) return;
        if (!this.surface) this.createSurface();
        const retarget = !this.surface.hidden && this.hintTarget !== (isHint ? button : null);
        this.hintTarget = isHint ? button : null;
        this.surface.set({
            align: {edgeAlign: 't0-b0', axisLock: true, target: button.id},
            cls  : [isHint ? 'neo-grid-column-menu-hint' : 'neo-grid-column-menu'],
            width: isHint ? null : 320
        });
        this.surface.vdom['aria-label'] = `Filter ${button.text || button.dataField}`;
        this.surface.getItem('search').hidden = isHint;
        if (isHint) {
            this.valuePicker.hidden = true;
            this.surface.getItem('clear').hidden = true;
            this.surface.getItem('status').set({hidden: false, html: 'Value filtering is off for this column.'})
        } else {
            this.refreshOptions()
        }
        this.surface.hidden = false;
        if (retarget) this.surface.update();
        await this.surface.promiseUpdate();
        if (!this.isDestroyed && serial === this.#openSerial && !this.surface.hidden) {
            const {surface} = this;
            if (retarget && surface.mounted && this.owner.windowId) await surface.alignTo();
            if (isHint) {
                button.focus()
            } else {
                Neo.main.DomAccess.focus({id: surface.getItem('search').getInputElId(), unlessFocusWithin: surface.id, windowId: surface.windowId})
            }
        }
    }

    /** @param {Neo.grid.header.Button} button @returns {Promise} @summary Opens the shared surface in hint mode. */
    openHint(button) {
        return this.open(button)
    }

    /** @param {Boolean} [restoreFocus=false] @summary Dismisses the surface only when currently showing a disabled-column hint. */
    closeHint(restoreFocus=false) {
        if (this.hintTarget) this.close(restoreFocus)
    }

    /** @param {Boolean} [restoreFocus=true] @summary Dismisses the complete island and restores native header focus. */
    close(restoreFocus=true) {
        ++this.#openSerial;
        const target = this.hintTarget || this.owner;
        this.hintTarget = null;
        if (!this.surface || this.surface.hidden) return;
        this.surface.hidden = true;
        this.syncOutsideListener(false);
        if (restoreFocus && target && !target.isDestroyed) target.focus()
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
     * Exact UTC midnight retains its calendar day independently of the local timezone.
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
                    dateTime: new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'medium'}),
                    utcDate : new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeZone: 'UTC'})
                }
            }
            const utcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 &&
                value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
            const midnight = value.getHours() === 0 && value.getMinutes() === 0 &&
                value.getSeconds() === 0 && value.getMilliseconds() === 0;
            return (utcMidnight ? formatters.utcDate : midnight ? formatters.date : formatters.dateTime).format(value)
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
        const {surface} = this, clear = surface.getItem('clear'), node = data.path?.find(item => item.id === clear.id);
        if (node?.data?.pickerScope !== this.#keyPrefix) return;
        // Clearing hides this button while it holds focus: the search field (open()'s target) takes focus first,
        // so the keyboard and Escape stay inside the menu
        Neo.main.DomAccess.focus({id: surface.getItem('search').getInputElId(), windowId: surface.windowId});
        this.onSelectionChange({selection: []})
    }

    /**
     * @summary True when a header event originated inside the header's inline filter control.
     * @param {Object} data
     * @param {Neo.grid.header.Button} [button=this.owner]
     * @returns {Boolean}
     */
    isFilterFieldEvent(data, button=this.owner) {
        const id = button?.filterField?.id;
        return Boolean(id && (data?.path || []).some(node => node.id === id))
    }

    /** @param {Object} data @summary Opens on the routed context menu without changing sorting. */
    onContextMenu(data) {
        if (!this.isFilterFieldEvent(data)) this.open()
    }

    /** @param {Object} data @summary Opens on the header's context-menu keyboard gestures. */
    onHeaderKeyDown(data) {
        if (data.key === 'Escape') this.close();
        else if ((data.key === 'ContextMenu' || data.key === 'F10' && data.shiftKey) && !this.isFilterFieldEvent(data)) {
            this.open()
        }
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
        const ids = new Set([this.surface?.id, !this.hintTarget && this.trigger?.id]);
        if (!(data.path || []).some(node => ids.has(node.id))) this.close(!this.hintTarget)
    }

    /** @param {Array} args @summary Releases owned UI and borrowed observers while leaving source intent intact. */
    destroy(...args) {
        this.#generation++;
        this.#openSerial++;
        this.#releaseStore?.(); this.#releaseField?.(); this.#releaseFilters?.(); this.#releaseFiltered?.();
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
