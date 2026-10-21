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
        /**
         * One wrapping row: the filter summary sits beside the search controls, so the first filter does not
         * push the grid, or an open header menu, down. It wraps below them only when the row is too narrow.
         * @member {Object} layout={ntype:'hbox',align:'center',wrap:'wrap',gap:'8px'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'center', wrap: 'wrap', gap: '8px'},
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
            flex  : '1 1 24rem',
            cls   : ['neo-grid-search-controls'],
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap', gap: '8px'},
            items : [{
                module         : SearchField, reference: 'query', flex: '1 1 12rem', labelText: 'Search records',
                placeholderText: 'Search records', clearToOriginalValue: false,
                listeners      : {change: data => me.onSearchChange(data)}
            }, {
                module : Button, reference: 'scope', text: 'Grid columns', ui: 'ghost',
                iconCls: 'fa-solid fa-angle-down', iconPosition: 'right',
                handler: () => me.updateScopeMenu(),
                menu   : {cls: ['neo-grid-search-scope-menu'], items: []}
            }, {
                module : Button, reference: 'case', text: 'Aa', ui: 'ghost',
                tooltip: 'Match case', vdom: {'aria-label': 'Match case', 'aria-pressed': 'false'},
                handler: () => me.writeSearch({caseSensitive: !me.getSearchFilter()?.caseSensitive})
            }]
        }, {
            module: Container, reference: 'summary', cls: ['neo-grid-filter-summary'], flex: '0 1 auto',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap', gap: '4px'},
            items : [{
                module: Container, reference: 'entries', cls: ['neo-grid-filter-entries'], flex: '0 1 auto',
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap', gap: '4px'}, items: []
            }, {
                module: Button, reference: 'clear', cls: ['neo-grid-filter-clear'], text: 'Clear filters',
                ui    : 'ghost', handler: () => me.clearFilters()
            }]
        }]
    }

    /** @summary Subscribes after child controls exist and projects without creating a search contribution. */
    onConstructed() {
        super.onConstructed();
        this.getItem('query').changeInputElKey('aria-label', 'Search records');
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

    /** @summary Reads the stored scope; a new grid search starts with its declared columns, including locked ones. */
    getSearchFields() {
        return this.getSearchFilter()?.fields ?? this.resolveScope(this.gridContainer ? 'columns' : 'all')
    }

    /** @summary Names fields through this grid's captions. @param {String} name @returns {String} */
    getFieldLabel(name) {
        const column = this.gridContainer?.columns?.items?.find(column => column.dataField === name);
        return column ? column.text || 'Unnamed column' : `Record field: ${name}`
    }

    /** @summary Identifies one matching choice without rewriting the stored list. @param {String[]} fields @returns {String|null} */
    getScopeKey(fields=this.getSearchFields()) {
        const matches = scope => {
            const resolved = this.resolveScope(scope);
            return fields.length === resolved.length && fields.every(name => resolved.includes(name))
        };
        if (!fields.length) return null;
        if (this.gridContainer && matches('columns')) return 'columns';
        if (matches('all')) return 'all';
        return fields.length === 1 ? `field:${fields[0]}` : null
    }

    /** @summary Describes the stored list using its matching choice or field count. @param {String[]} fields @returns {String} */
    getScopeLabel(fields=this.getSearchFields()) {
        const key = this.getScopeKey(fields);
        if (!fields.length) return 'No search fields';
        if (key === 'columns') return 'Grid columns';
        if (key === 'all') return 'All record fields';
        return fields.length === 1 ? this.getFieldLabel(fields[0]) : `Selected fields (${fields.length})`
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
              hooks   = me.getSearchFilter()?.fieldText ?? me.fieldText,
              active  = me.getScopeKey(fields),
              choice  = (id, text, resolveFields) => ({id, text,
                  iconCls: active === id ? 'fa-solid fa-check' : '',
                  handler: () => me.writeSearch({fields: resolveFields()})}),
              items   = [choice('columns', 'Grid columns', () => me.resolveScope('columns')),
                  choice('all', 'All record fields', () => me.resolveScope('all')),
                  {text: 'All record fields includes values outside this grid', disabled: true}, {separator: true}];
        const seen = new Set();
        for (const column of columns) {
            const name = column.dataField;
            if (name && !seen.has(name)) {
                seen.add(name);
                const item = choice(`field:${name}`, me.getFieldLabel(name), () => [name]);
                if (me.store?.getSearchRefusal([name], hooks)) {
                    item.text += ' (not searchable)';
                    item.disabled = true
                }
                items.push(item)
            }
        }
        items.push({separator: true}, {text: `Searching: ${fields.map(name => me.getFieldLabel(name)).join(', ') || 'none'}`, disabled: true});
        // Button owns this menu and its teardown; keep that instance instead of resetting its menu config.
        button.menuListReady?.then(() => {
            if (!button.isDestroyed && button.menuList) {
                const menu = button.menuList;
                menu.align = {edgeAlign: 't0-b0', target: button.id, constrainTo: me.gridContainer?.id || 'document.body'};
                menu.selectionModel.deselectAll(true);
                menu.items = items;
                const selected = items.find(item => item.iconCls);
                if (selected) menu.selectionModel.select(menu.store.get(selected.id))
            }
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
            me.getItem('scope').set({text: me.getScopeLabel(fields), disabled: !me.store});
            const hasHeaders = effective.some(item => ['header-inline', 'header-picker'].includes(item.ownerRole));
            me.getItem('clear').set({hidden: !hasHeaders, disabled: !hasHeaders});
        } finally { me.syncing = false }
        for (const item of effective) {
            if (item.ownerRole === 'grid-search') continue;
            const name = me.gridContainer?.columns?.items?.find(column => column.dataField === item.property)?.text || item.property;
            if (me.isOwnedFilter(item)) {
                entries.push({module: Button, ui: 'ghost', text: `${name}: ${String(item.value)}`,
                    iconCls: 'fa-solid fa-xmark', iconPosition: 'right',
                    vdom   : {'aria-label': `Remove ${name} filter`},
                    handler: () => me.removeFilter(item)});
            } else {
                entries.push({module: Component, text: `Application restriction${!item.filterBy && name ? ': ' + name : ''}`})
            }
        }
        if (!fields.length) entries.push({module: Component, text: 'No field is searchable'});
        if (filter?.disabled) entries.push({module: Component, text: 'Search is disabled by the application'});
        if (filter && !filter.effective && !filter.disabled && fields.length && String(filter.value ?? '').length) {
            entries.push({module: Component, text: 'Enter a search term'})
        }
        if (me.refusal) entries.push({module: Component, text: {
            'remote-projection': 'Search needs all records loaded locally',
            'unknown-field'    : 'The selected search field is no longer available',
            'unsupported-field': 'The selected column cannot be searched',
            'tree-population'  : 'Search is unavailable for tree data'
        }[me.refusal] || 'Search is unavailable for these records'});
        const summary = me.getItem('summary'), holder = me.getItem('entries');
        holder.removeAll();
        if (entries.length) holder.add(entries);
        summary.hidden = !entries.length
    }

    /** @summary Releases observation and child controls; the borrowed Store and its search remain alive. */
    destroy(...args) {
        this.bindStore(null, this.store);
        super.destroy(...args)
    }
}

export default Neo.setupClass(SearchToolbar);
