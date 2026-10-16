import Button         from '../button/Base.mjs';
import Component      from '../component/Base.mjs';
import Container      from '../container/Base.mjs';
import SearchField    from '../form/field/Search.mjs';
import SearchFilter   from '../collection/SearchFilter.mjs';
import Toolbar        from '../toolbar/Base.mjs';
import {isDescriptor} from '../core/ConfigSymbols.mjs';

/**
 * @summary Projects a Store's shared record search and exposes the filters owned by grid controls.
 * Attaching or destroying a toolbar never changes the Store's query or resolved field list.
 * @class Neo.grid.SearchToolbar
 * @extends Neo.toolbar.Base
 */
class SearchToolbar extends Toolbar {
    static config = {
        /** @member {String} className='Neo.grid.SearchToolbar' @protected */
        className: 'Neo.grid.SearchToolbar',
        /** @member {String} ntype='grid-search-toolbar' @protected */
        ntype: 'grid-search-toolbar',
        /** @member {String[]} baseCls=['neo-grid-search-toolbar','neo-toolbar'] @protected */
        baseCls: ['neo-grid-search-toolbar', 'neo-toolbar'],
        /** @member {Object} layout={ntype:'vbox',align:'stretch'} @reactive */
        layout: {ntype: 'vbox', align: 'stretch'},
        /** @member {Neo.grid.Container|null} gridContainer_=null @reactive */
        gridContainer_: null,
        /** @member {Neo.data.Store|null} store_=null @reactive */
        store_: null,
        /**
         * Optional text conversions for declared Model fields. Stored with the search on an explicit write.
         * @member {Object|null} fieldText_=null
         * @reactive
         */
        fieldText_: {[isDescriptor]: true, clone: 'none', value: null}
    }

    /** @member {Boolean} syncing=false @protected */
    syncing = false
    /** @member {String|null} refusal=null @protected */
    refusal = null

    /** @summary Builds native controls once; subsequent Store changes update their values in place. */
    construct(config) {
        super.construct(config);
        const me = this;
        me.items = [{
            module: Toolbar,
            cls   : ['neo-grid-search-controls'],
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap', gap: '8px'},
            items : [{
                module         : SearchField, reference: 'query', flex: '1 1 12rem', labelText: 'Search records',
                placeholderText: 'Search records', clearToOriginalValue: false,
                listeners      : {change: data => me.onSearchChange(data)}
            }, {
                module : Button, reference: 'scope', text: 'Search fields', ui: 'ghost',
                iconCls: 'fa-solid fa-angle-down', iconPosition: 'right',
                handler: () => me.updateScopeMenu(), menu: []
            }, {
                module : Button, reference: 'case', text: 'Aa', ui: 'ghost',
                tooltip: 'Match case', vdom: {'aria-label': 'Match case', 'aria-pressed': 'false'},
                handler: () => me.writeSearch({caseSensitive: !me.getSearchFilter()?.caseSensitive})
            }, {
                module: Button, reference: 'clear', text: 'Clear filters', ui: 'ghost', handler: () => me.clearFilters()
            }]
        }, {
            module: Container, reference: 'summary', cls: ['neo-grid-filter-summary'],
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap', gap: '4px'}, items: []
        }]
    }

    /** @summary Subscribes after child controls exist and projects without creating a search contribution. */
    onConstructed() {
        super.onConstructed();
        this.bindStore(this.store);
        this.syncFromStore()
    }

    /** @summary Moves observation to the new Store without retiring the old Store's intent. */
    afterSetStore(value, oldValue) {
        if (this.isConstructed) {
            this.bindStore(value, oldValue);
            this.refusal = null;
            this.syncFromStore()
        }
    }

    /** @summary Binds filter/load notifications; Observable consumes the listener object, so each call gets its own. */
    bindStore(value, oldValue) {
        const listeners = {filter: this.syncFromStore, load: this.syncFromStore, scope: this};
        oldValue?.un({...listeners});
        value?.on({...listeners})
    }

    /** @summary Returns the one columnless search contribution, independent of either grid's columns. */
    getSearchFilter() {
        return this.store?.getFilter(null, 'grid-search') || null
    }

    /** @summary Reads the stored scope; only a new search defaults to all searchable Model fields. */
    getSearchFields() {
        return this.getSearchFilter()?.fields ?? this.resolveScope('all')
    }

    /**
     * @summary Resolves a user-chosen scope, including locked columns, without using viewport visibility.
     * @param {String} scope 'all', 'columns', or a Model field name
     * @returns {String[]}
     */
    resolveScope(scope) {
        const me    = this, store = me.store,
              hooks = me.getSearchFilter()?.fieldText ?? me.fieldText;
        if (!store?.model) return [];
        if (scope !== 'all' && scope !== 'columns') return [scope];
        const names = scope === 'all' ? [...store.model.fieldsMap.keys()] : scope === 'columns' ?
            (me.gridContainer?.columns?.items || []).map(column => column.dataField) : [scope];
        return [...new Set(names)].filter(name => name && store.model.getField(name) &&
            !store.getSearchRefusal([name], hooks))
    }

    /** @summary Refreshes the already-owned menu when opened, so changed columns never silently rewrite search. */
    updateScopeMenu() {
        const me      = this, button = me.getItem('scope'), fields = me.getSearchFields(),
              columns = me.gridContainer?.columns?.items || [],
              choose  = scope => () => me.writeSearch({fields: me.resolveScope(scope)}),
              items   = [{text: 'All searchable fields', handler: choose('all')},
                  {text: "This grid's columns", handler: choose('columns')},
                  {text: `Searched: ${fields.join(', ') || 'none'}`, disabled: true}];
        const seen = new Set();
        for (const column of columns) {
            const name = column.dataField;
            if (name && !seen.has(name)) {
                seen.add(name);
                items.push({text: column.text || name, handler: choose(name)})
            }
        }
        // Button owns this menu and its teardown; keep that instance instead of resetting its menu config.
        button.menuListReady?.then(() => {
            if (!button.isDestroyed && button.menuList) button.menuList.items = items
        })
    }

    /** @summary Writes user input only; Store projection must not become a second user edit. */
    onSearchChange({value}) {
        if (!this.syncing) this.writeSearch({value})
    }

    /**
     * @summary Validates and writes one shared search, preserving application-owned disabled state and unrelated filters.
     * @param {Object} changes Query value, case sensitivity or an explicitly resolved fields list
     * @returns {Object} Written or refused result
     */
    writeSearch(changes) {
        const me = this, store = me.store, filter = me.getSearchFilter();
        if (!store) return {status: 'refused', reason: 'store-unavailable'};
        const fields    = changes.fields ?? me.getSearchFields().filter(name => store.model?.getField(name)),
              fieldText = filter?.fieldText ?? me.fieldText,
              reason    = store.getSearchRefusal(fields, fieldText);
        me.refusal = reason;
        if (reason) {
            me.syncFromStore();
            return {status: 'refused', reason}
        }
        const settings = {fields, fieldText, ...changes};
        settings.fields = fields;
        if (filter) {
            filter.set(settings)
        } else {
            store.filters = [...(store.filters || []), {
                module: SearchFilter, ownerRole: 'grid-search', property: null, value: '', ...settings
            }]
        }
        me.syncFromStore();
        return {status: 'written'}
    }

    /** @summary Clears only the three grid UI roles; application and future roles remain intact. */
    clearFilters() {
        if (this.store) this.store.filters = this.store.filters.filter(filter => !this.isOwnedFilter(filter));
        this.refusal = null;
        this.syncFromStore()
    }

    /** @summary Removes one owned contribution by identity, never another role on the same property. */
    removeFilter(filter) {
        if (this.store && this.isOwnedFilter(filter)) {
            this.store.filters = this.store.filters.filter(item => item !== filter)
        }
    }

    /** @summary Enumerates the admitted UI roles instead of treating every named role as ours. */
    isOwnedFilter(filter) {
        return ['header-inline', 'header-picker', 'grid-search'].includes(filter.ownerRole)
    }

    /** @summary Projects shared settings and every effective predicate without rebuilding the input or losing its focus. */
    syncFromStore() {
        const me = this, query = me.getItem('query');
        if (!(query instanceof SearchField) || me.isDestroying || me.isDestroyed) return;
        const filter    = me.getSearchFilter(), fields = me.getSearchFields(), filters = me.store?.filters || [],
              effective = filters.filter(item => item.effective), entries = [];
        me.syncing = true;
        try {
            query.set({value: filter?.value ?? '', disabled: !me.store});
            const caseButton = me.getItem('case');
            caseButton.vdom['aria-pressed'] = String(filter?.caseSensitive === true);
            caseButton.set({pressed: filter?.caseSensitive === true, disabled: !me.store});
            me.getItem('scope').set({text: `${fields.length} search fields`, disabled: !me.store,
                tooltip: fields.join(', ') || 'No field is searchable'});
            me.getItem('clear').disabled = !filters.some(item => me.isOwnedFilter(item));
        } finally { me.syncing = false }
        for (const item of effective) {
            const name = me.gridContainer?.columns?.items?.find(column => column.dataField === item.property)?.text || item.property;
            if (me.isOwnedFilter(item)) {
                entries.push({module: Button, ui: 'ghost', text: item.ownerRole === 'grid-search' ?
                    `“${item.value}” in ${item.fields.length} fields` : `${name}: ${String(item.value)}`,
                    iconCls: 'fa-solid fa-xmark', iconPosition: 'right',
                    vdom   : {'aria-label': `Remove ${item.ownerRole === 'grid-search' ? 'search' : name + ' filter'}`},
                    handler: () => me.removeFilter(item)});
            } else {
                entries.push({module: Component, text: `Application restriction${name ? ': ' + name : ''}`})
            }
        }
        if (!fields.length) entries.push({module: Component, text: 'No field is searchable'});
        if (filter?.disabled) entries.push({module: Component, text: 'Search is disabled by the application'});
        if (me.refusal) entries.push({module: Component, text: `Search unavailable: ${me.refusal}`});
        const summary = me.getItem('summary');
        summary.removeAll();
        if (entries.length) summary.add(entries)
    }

    /** @summary Releases observation and child controls; the borrowed Store and its search remain alive. */
    destroy(...args) {
        this.bindStore(null, this.store);
        super.destroy(...args)
    }
}

export default Neo.setupClass(SearchToolbar);
