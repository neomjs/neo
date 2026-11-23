import ClassSystemUtil from '../../../../src/util/ClassSystem.mjs';
import Component       from '../../../../src/component/Base.mjs';
import ExampleGroup    from '../../model/ExampleGroup.mjs';
import NeoArray        from '../../../../src/util/Array.mjs';
import Store           from '../../../../src/data/Store.mjs';

/**
 * @summary The index of the example groups: optional unbanded groups above the bands, and every banded group as a link
 * to its page with its count.
 *
 * One component in three presentations (`presentation`): `list` stands upright beside every examples route (both
 * `/examples` and each group page), `overview` sits below the Start here cards on phones, and `sheet` opens under the
 * mobile crumb on group pages. All three render the groups store (`Portal.store.ExampleGroups`), so a group that
 * publishes in the selected build appears in each.
 *
 * A component, not a list: the entries are links in the tab order, with no roving focus and no selection, and the open
 * destination's link (or `"All examples"` when on `/examples`) carries `aria-current="page"`.
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
            matchCounts: data => data.matchCounts,
            store      : 'stores.groups'
        },
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
     * @summary Marks the new open group.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetActiveFamily(value, oldValue) {
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

        me.store && me.createEntries()
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

        me.vdom.cn = [
            {
                tag           : 'a',
                id            : me.id + '__all',
                cls           : ['portal-examples-group-index-all'],
                'aria-current': !me.matchCounts && me.activeFamily === null && me.presentation !== 'overview' ? 'page' : null,
                'aria-label'  : `All examples, ${ExampleGroup.countLabel({count: published, crossCount: 0})}`,
                href          : '#/examples',
                removeDom     : me.presentation === 'overview',
                cn            : [
                    {tag: 'i',    cls: ['fa', 'fa-table-cells-large'], 'aria-hidden': true},
                    {tag: 'span', text: 'All examples'},
                    {tag: 'span', cls: ['portal-examples-group-index-count'], text: String(published)}
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
            href          : '#' + group.route,
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
}

export default Neo.setupClass(GroupIndex);
