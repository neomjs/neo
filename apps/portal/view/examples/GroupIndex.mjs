import ClassSystemUtil from '../../../../src/util/ClassSystem.mjs';
import Component       from '../../../../src/component/Base.mjs';
import ExampleGroup    from '../../model/ExampleGroup.mjs';
import NeoArray        from '../../../../src/util/Array.mjs';
import Store           from '../../../../src/data/Store.mjs';
import StringUtil      from '../../../../src/util/String.mjs';

const walkKeys = new Set(['ArrowDown', 'ArrowUp', 'End', 'Home']);

/**
 * @summary The index of the example groups: optional unbanded groups above the bands, and every banded group as a link
 * to its page with its count.
 *
 * One component in three presentations (`presentation`): `list` stands upright beside every examples route (both
 * `/examples` and each group page), `overview` sits below the Start here cards on phones, and `sheet` opens under the
 * mobile crumb on group pages. All three render the groups store (`Portal.store.ExampleGroups`), so a group that
 * publishes in the selected build appears in each.
 *
 * A component, not a list: the entries are links with no selection, and the open destination's link (or
 * `"Start here"` when on `/examples`) carries `aria-current="page"`. `list` is one Tab stop, that link (`"Start here"`
 * under a filter), and the arrow keys, Home and End walk the links through `Neo.main.addon.Navigator`. The link a walk
 * rests on asks to open (`walk`), ArrowRight asks for the cards (`enterCards`), and the controller does both.
 * @class Portal.view.examples.GroupIndex
 * @extends Neo.component.Base
 */
class GroupIndex extends Component {
    /**
     * Valid values for presentation
     * @member {String[]} presentations=['list','overview','sheet']
     * @protected
     * @static
     */
    static presentations = ['list', 'overview', 'sheet']

    static config = {
        /**
         * @member {String} className='Portal.view.examples.GroupIndex'
         * @protected
         */
        className: 'Portal.view.examples.GroupIndex',
        /**
         * @member {String} ntype='portal-examples-group-index'
         * @protected
         */
        ntype: 'portal-examples-group-index',
        /**
         * The group whose page shows this index, marked `aria-current="page"`; null on the overview.
         * @member {String|null} activeFamily_=null
         * @reactive
         */
        activeFamily_: null,
        /**
         * @member {String[]} baseCls=['portal-examples-group-index']
         */
        baseCls: ['portal-examples-group-index'],
        /**
         * @member {Object} bind
         */
        bind: {
            featuredCount  : data => data.featuredCount,
            featuredMatches: data => data.featuredMatches,
            matchCounts    : data => data.matchCounts,
            store          : 'stores.groups'
        },
        /**
         * Number of curated `featured: true` items published in the selected build (`"Start here"` on `/examples`).
         * @member {Number} featuredCount_=0
         * @reactive
         */
        featuredCount_: 0,
        /**
         * Number of curated `featured: true` items matching the active find query, or null at rest.
         * @member {Number|null} featuredMatches_=null
         * @reactive
         */
        featuredMatches_: null,
        /**
         * Optional per-group match counts (`Map<family, {home, cross, total}>`) active while filtering.
         * Null restores normal published counts across every group.
         * @member {Map|Object|null} matchCounts_=null
         * @reactive
         */
        matchCounts_: null,
        /**
         * `overview`, `list` or `sheet`, see the class description.
         * @member {String} presentation_='overview'
         * @reactive
         */
        presentation_: 'overview',
        /**
         * @member {Portal.store.ExampleGroups|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'nav', 'aria-label': 'Example groups', cn: []}
    }

    /**
     * The `Neo.main.addon.Navigator` subscription of the mounted `list` presentation.
     * @member {Object|null} navigator=null
     */
    navigator = null
    /**
     * The link a walk key's press started on, until its keyup.
     * @member {String|null} walkFrom=null
     */
    walkFrom = null
    /**
     * True from a walk's first step until focus leaves the index: later steps replace its history entry.
     * @member {Boolean} walking=false
     */
    walking = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({keydown: me.onKeyDown, keyup: me.onKeyUp, scope: me})
    }

    /**
     * @summary Subscribes the `list` presentation to `Neo.main.addon.Navigator` while it is mounted.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        this.syncKeyboardNavigation(value && this.presentation === 'list')
    }

    /**
     * @summary Marks the new open group.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetActiveFamily(value, oldValue) {
        this.store && this.createEntries()
    }

    /**
     * @summary Updates the `"Start here"` resting count when the selected build changes.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetFeaturedCount(value, oldValue) {
        this.store && this.createEntries()
    }

    /**
     * @summary Updates the `"Start here"` match count when the find filter changes.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetFeaturedMatches(value, oldValue) {
        this.store && this.createEntries()
    }

    /**
     * @summary Updates rendered match counts and zero-match group dimming when the find filter changes.
     * @param {Map|Object|null} value
     * @param {Map|Object|null} oldValue
     * @protected
     */
    afterSetMatchCounts(value, oldValue) {
        this.store && this.createEntries()
    }

    /**
     * @summary Swaps the presentation class and renders the entries for it.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetPresentation(value, oldValue) {
        let me  = this,
            cls = me.cls;

        NeoArray.remove(cls, `portal-examples-group-index-${oldValue}`);
        NeoArray.add(cls, `portal-examples-group-index-${value}`);
        me.cls = cls;

        me.mounted && me.syncKeyboardNavigation(value === 'list');
        me.store   && me.createEntries()
    }

    /**
     * @summary Renders the entries of a new store, and again on each of its loads.
     * @param {Portal.store.ExampleGroups|null} value
     * @param {Portal.store.ExampleGroups|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this;

        oldValue?.un('load', me.createEntries, me);

        if (value) {
            value.on('load', me.createEntries, me);
            me.createEntries()
        }
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetPresentation(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'presentation')
    }

    /**
     * @param {Object|Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store|null}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        return ClassSystemUtil.beforeSetInstance(value, Store)
    }

    /**
     * @summary Renders optional unbanded groups above the bands, then every banded group in its section. A band without
     * a published group has no section. While a group borrows and no filter is on, one line under the list gives the
     * published total, since a borrowed example counts in every group that shows it.
     */
    createEntries() {
        let me        = this,
            bands     = new Map(),
            borrowing = false,
            published = 0,
            unbanded  = [];

        me.store.forEach(group => {
            // each example counts once at home: the overview's headline sums the same figure
            published += group.count;
            borrowing ||= group.crossCount > 0;

            if (group.band) {
                bands.has(group.band) || bands.set(group.band, []);
                bands.get(group.band).push(group)
            } else {
                unbanded.push(group)
            }
        });

        const isFiltering = Boolean(me.matchCounts),
              startCount  = isFiltering ? (me.featuredMatches ?? 0) : me.featuredCount,
              startAria   = isFiltering
                  ? `Start here, ${startCount === 1 ? '1 matching example' : `${startCount} matching examples`}`
                  : `Start here, ${ExampleGroup.countLabel({count: startCount, crossCount: 0})}`,
              startCls    = ['portal-examples-group-index-all', ...(isFiltering && startCount === 0 ? ['portal-examples-group-index-zero'] : [])];

        me.vdom.cn = [
            {
                tag           : 'a',
                id            : me.id + '__all',
                cls           : startCls,
                'aria-current': !isFiltering && me.activeFamily === null && me.presentation !== 'overview' ? 'page' : null,
                'aria-label'  : startAria,
                href          : StringUtil.toRouteHref('/examples'),
                removeDom     : me.presentation === 'overview',
                tabIndex      : me.getTabIndex(null),
                cn            : [
                    {tag: 'i',    cls: ['fa', 'fa-table-cells-large'], 'aria-hidden': true},
                    {tag: 'span', text: 'Start here'},
                    {tag: 'span', cls: ['portal-examples-group-index-count'], text: String(startCount)}
                ]
            },
            {tag: 'ul', cls: ['portal-examples-group-index-top'], removeDom: unbanded.length === 0, cn: unbanded.map(group => me.createEntry(group))},
            ...[...bands].map(([band, groups]) => ({
                tag: 'section',
                cls: ['portal-examples-group-index-band', 'portal-examples-group-index-band-' + band.toLowerCase().replaceAll(' ', '-')],
                cn : [
                    {tag: 'h3', text: band},
                    {tag: 'ul', cn: groups.map(group => me.createEntry(group))}
                ]
            })),
            {tag: 'p', cls: ['portal-examples-group-index-note'], removeDom: !borrowing || !!me.matchCounts,
                text: `${published} examples in all. Some appear in more than one group.`}
        ];

        me.update()
    }

    /**
     * @summary One group's entry: a link to its page with its icon, title and count. The count reads as words to
     * assistive technology (`aria-label`), the screen shows its figure.
     * @param {Portal.model.ExampleGroup} group
     * @returns {Object}
     */
    createEntry(group) {
        const me     = this,
              counts = me.matchCounts instanceof Map ? me.matchCounts.get(group.family) : me.matchCounts?.[group.family];
        let countText, ariaLabel, liCls;

        if (me.matchCounts) {
            const total = counts?.total || 0;

            // as without a filter, a group's number is what its page shows: its own matches and the borrowed ones
            countText = String(total);
            ariaLabel = `${group.title}, ${total === 1 ? '1 matching example' : `${total} matching examples`}`;
            liCls     = total === 0 ? ['portal-examples-group-index-zero'] : null
        } else {
            countText = ExampleGroup.countText(group);
            ariaLabel = `${group.title}, ${ExampleGroup.countLabel(group)}`
        }

        return {tag: 'li', ...(liCls ? {cls: liCls} : {}), cn: [{
            tag           : 'a',
            id            : me.id + '__' + group.family,
            'aria-current': !me.matchCounts && group.family === me.activeFamily ? 'page' : null,
            'aria-label'  : ariaLabel,
            href          : StringUtil.toRouteHref(group.route),
            tabIndex      : me.getTabIndex(group.family),
            cn            : [
                {tag: 'i',    cls: [...group.iconCls.split(' '), 'portal-examples-group-index-icon'], 'aria-hidden': true},
                {tag: 'span', cls: ['portal-examples-group-index-title'], text: group.title},
                {tag: 'span', cls: ['portal-examples-group-index-count'], text: countText}
            ]
        }]}
    }

    /**
     * @summary Stops listening to the bound store.
     */
    destroy() {
        this.store?.un('load', this.createEntries, this);
        super.destroy()
    }

    /**
     * @summary Focuses the link that holds the Tab stop: the way back from the cards.
     */
    focusTabStop() {
        this.focus(this.id + '__' + (this.getTabStop() || 'all'))
    }

    /**
     * @param {String} id The DOM id of an event's target
     * @returns {String|undefined} The route of the link `id` names, undefined for anything else
     */
    getLinkRoute(id) {
        let me     = this,
            prefix = me.id + '__',
            family = id?.startsWith(prefix) && id.slice(prefix.length);

        return family === 'all' ? '/examples' : family ? me.store?.get(family)?.route : undefined
    }

    /**
     * @summary -1 takes a `list` link out of the tab order unless it holds the Tab stop.
     * @param {String|null} family null for `"Start here"`
     * @returns {Number|null}
     */
    getTabIndex(family) {
        return this.presentation === 'list' && family !== this.getTabStop() ? -1 : null
    }

    /**
     * @returns {String|null} The open group, whose link holds the Tab stop, or null for `"Start here"`
     */
    getTabStop() {
        let me = this;

        return !me.matchCounts && me.activeFamily && me.store?.get(me.activeFamily) ? me.activeFamily : null
    }

    /**
     * @summary A walk ends when focus leaves the index.
     * @param {Object} data
     */
    onFocusLeave(data) {
        super.onFocusLeave(data);

        this.walkFrom = null;
        this.walking  = false
    }

    /**
     * @summary Notes the link a walk key's press starts on, and ArrowRight on a `list` link fires `enterCards`.
     * @param {Object} data
     */
    onKeyDown(data) {
        let me    = this,
            route = me.presentation === 'list' && me.getLinkRoute(data.target?.id);

        if (route && walkKeys.has(data.key)) {
            // A held key repeats its keydown: the first one names where the press started
            me.walkFrom ??= data.target.id
        } else if (route && data.key === 'ArrowRight') {
            /**
             * @event enterCards
             * @param {Object} data {replace, route}: the link's destination, replacing the walk's entry during a walk
             */
            me.fire('enterCards', {replace: me.walking, route})
        }
    }

    /**
     * @summary A key that moved focus to another `list` link fires `walk`, so its destination opens as a click on it
     * would. Read on keyup, so a held key opens only the link it rests on, and focus arriving by Tab opens nothing.
     * @param {Object} data
     */
    onKeyUp(data) {
        let me   = this,
            from = me.walkFrom,
            route;

        if (me.presentation === 'list' && walkKeys.has(data.key)) {
            me.walkFrom = null;
            route       = me.getLinkRoute(data.target?.id);

            if (route && data.target.id !== from) {
                /**
                 * @event walk
                 * @param {Object} data {replace, route}: a walk's first step adds a history entry, later steps replace it
                 */
                me.fire('walk', {replace: me.walking, route});
                me.walking = true
            }
        }
    }

    /**
     * @summary Moves focus to the open destination's Tab stop after a route change the index did not initiate, leaving
     * focus outside the index or an active key press untouched.
     */
    syncFocus() {
        let me = this;

        if (me.presentation !== 'list' || me.walkFrom) {
            return
        }

        me.walking = false;

        if (me.containsFocus && me.navigator) {
            Neo.main.addon.Navigator?.navigateTo({
                data      : me.navigator,
                fromTarget: me.id,
                target    : `${me.id}__${me.getTabStop() || 'all'}`,
                windowId  : me.windowId
            })
        }
    }

    /**
     * @summary Subscribes the links to `Neo.main.addon.Navigator`, which only moves focus: the links render their own
     * Tab stop.
     * @param {Boolean} active
     * @protected
     */
    syncKeyboardNavigation(active) {
        let me = this;

        if (active && !me.navigator) {
            me.navigator = {
                appName  : me.appName,
                focusOnly: true,
                id       : me.id,
                selector : `[${Neo.config.useDomIds ? 'id' : 'data-neo-id'}="${me.id}"] a[href]`,
                windowId : me.windowId
            };

            Neo.main.addon.Navigator.subscribe(me.navigator)
        } else if (!active && me.navigator) {
            Neo.main.addon.Navigator.unsubscribe(me.navigator);
            me.navigator = null
        }
    }
}

export default Neo.setupClass(GroupIndex);
