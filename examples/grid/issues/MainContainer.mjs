import Button        from '../../../src/button/Base.mjs';
import CheckBox      from '../../../src/form/field/CheckBox.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

// The snapshot holds calendar days in UTC; read in the viewer's zone, a day west of Greenwich shows as the one before
const
    dayFormat   = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'}),
    rangeFormat = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'}),
    slug        = value => value.toLowerCase().replace(/\s+/g, '-');

/**
 * Text from the tracker goes out as `text`, never `html`: an issue title can contain markup.
 * @param {String} cls
 * @returns {Function}
 */
const textRenderer = cls => ({value}) => ({cls: [cls], text: value ?? ''});

/**
 * A chip for a value from a fixed set (type, area or state), so its class and label need no escaping.
 * @param {String} kind
 * @returns {Function}
 */
const chipRenderer = kind => ({value}) => ({
    html: `<span class="issues-chip issues-${kind} issues-${kind}-${slug(value)}">${value}</span>`
});

/**
 * @summary `neomjs/neo`'s own issues in a grid whose rows fit their text and whose headers filter by value.
 *
 * Titles and summaries wrap: `contentSizedRows` gives every row the height of its tallest wrapped cell, across the
 * locked start columns and the center. The Type, Area, Author and State headers open a value menu (`columnMenu`), whose
 * counts follow the other active filters. The optional search toolbar also reaches Title and Summary and can clear
 * grid-owned filters together. The checkbox switches back to fixed-height rows for comparison, and the
 * button switches between the light and dark neo themes.
 * @class Neo.examples.grid.issues.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.issues.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.issues.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-grid-issues']
         * @reactive
         */
        cls: ['neo-examples-grid-issues'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['issues-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module: Component,
                cls   : ['issues-heading'],
                flex  : 1,
                vdom  : {cn: [
                    {cls: ['issues-heading-title'], text: 'neomjs/neo issues'},
                    {cls: ['issues-heading-subtitle'], text: 'Loading…'}
                ]},
                reference: 'heading'
            }, {
                module    : CheckBox,
                checked   : true,
                cls       : ['issues-toggle'],
                hideLabel : true,
                listeners : {change: 'up.onContentSizedChange'},
                valueLabel: 'Content-sized rows'
            }, {
                module : Button,
                cls    : ['issues-theme-button'],
                handler: 'up.onThemeButtonClick',
                iconCls: 'fa-solid fa-moon',
                tooltip: 'Switch between the light and dark theme',
                ui     : 'ghost'
            }]
        }, {
            module          : GridContainer,
            cls             : ['issues-grid'],
            columnMenu      : true,
            contentSizedRows: true,
            flex            : 1,
            reference       : 'grid',
            rowHeight       : 44,
            searchToolbar   : {},
            store           : MainStore,
            columns         : [
                {dataField: 'id',      locked: 'start', text: '#',       width: 78,  columnMenu: false, renderer: textRenderer('issues-id')},
                {dataField: 'title',   locked: 'start', text: 'Title',   width: 270, columnMenu: false, renderer: textRenderer('issues-title'),   wrapText: true},
                {dataField: 'summary',                  text: 'Summary', flex : 1,   columnMenu: false, renderer: textRenderer('issues-summary'), wrapText: true, minWidth: 320},
                {dataField: 'type',                     text: 'Type',    width: 110, renderer: chipRenderer('type')},
                {dataField: 'area',                     text: 'Area',    width: 130, renderer: chipRenderer('area')},
                {dataField: 'author',                   text: 'Author',  width: 180, renderer: 'up.authorRenderer'},
                {dataField: 'created',                  text: 'Opened',  width: 96,  columnMenu: false, renderer: ({value}) => ({cls: ['issues-date'], text: value ? dayFormat.format(value) : ''})},
                {dataField: 'state',   locked: 'end',   text: 'State',   width: 124, renderer: chipRenderer('state')}
            ]
        }]
    }

    /**
     * Shows the author's GitHub avatar beside the login, over an initial that stays when the avatar cannot load. A
     * login that is not a plain GitHub name renders as text.
     * @param {Object} data
     * @param {String} data.value
     * @returns {Object}
     */
    authorRenderer({value}) {
        if (!/^[A-Za-z0-9-]+$/.test(value)) {
            return {text: value}
        }

        let initial = value.split('-').pop()[0].toUpperCase(),
            hue     = [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 47 % 360;

        return {
            html: `<span class="issues-author"><span class="issues-avatar" style="--issues-avatar-hue:${hue}">${initial}` +
                  `<img alt="" loading="lazy" src="https://github.com/${value}.png?size=48"></span>${value}</span>`
        }
    }

    /**
     * Wires the subtitle to the store, which loads after construction and filters through the header menus.
     */
    onConstructed() {
        super.onConstructed();

        let me    = this,
            store = me.getReference('grid').store;

        store.on({filter: me.onStoreChange, load: me.onStoreChange, scope: me});
        store.getCount() > 0 && me.onStoreChange()
    }

    /**
     * @summary Switches the grid between content-sized and fixed rows; fixed rows show one line of each title and
     * summary, cut with an ellipsis (MainContainer.scss).
     * @param {Object} data
     * @param {Boolean} data.value
     */
    onContentSizedChange({value}) {
        const grid = this.getReference('grid'),
              cls  = grid.cls.filter(item => item !== 'issues-fixed-rows');

        // One set() batch, so the row mode and the text style it needs change together
        grid.set({contentSizedRows: value, cls: value ? cls : [...cls, 'issues-fixed-rows']})
    }

    /**
     * Names the snapshot: how many issues, the days they were opened on, and how many the header menus let through.
     */
    onStoreChange() {
        let me       = this,
            store    = me.getReference('grid').store,
            filtered = store.isFiltered(),
            all      = filtered ? store.allItems.items : store.items,
            days     = all.map(record => record.created).filter(Boolean).sort((a, b) => a - b),
            heading  = me.getReference('heading'),
            count    = filtered ? `${store.getCount()} of ${all.length} issues` : `${all.length} issues`;

        heading.vdom.cn[1].text = days.length ?
            `${count} opened from ${rangeFormat.format(days[0])} to ${rangeFormat.format(days[days.length - 1])}` : count;
        heading.update()
    }

    /**
     * @param {Object} data
     * @param {Neo.button.Base} data.component
     */
    onThemeButtonClick({component}) {
        let dark = this.theme !== 'neo-theme-neo-dark';

        this.theme        = dark ? 'neo-theme-neo-dark' : 'neo-theme-neo-light';
        component.iconCls = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon'
    }
}

export default Neo.setupClass(MainContainer);
