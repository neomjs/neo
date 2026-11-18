import ClassSystemUtil from '../../../../src/util/ClassSystem.mjs';
import Component       from '../../../../src/component/Base.mjs';
import ExampleGroup    from '../../model/ExampleGroup.mjs';
import NeoArray        from '../../../../src/util/Array.mjs';
import Store           from '../../../../src/data/Store.mjs';

/**
 * @summary The banded index of the example groups: every group of the bound store, in its band, as a link to its page
 * with its count.
 *
 * One component in two presentations (`presentation`): `list` stands upright beside a page's cards, and `sheet` opens
 * under a page's crumb. Both render the groups store (`Portal.store.ExampleGroups`), so a group that publishes in the
 * selected build appears in each. "All examples" stands above the bands and leads to `/examples`.
 *
 * A component, not a list: the entries are links in the tab order, with no roving focus and no selection, and the link
 * of the open page carries `aria-current="page"`.
 * @class Portal.view.examples.GroupIndex
 * @extends Neo.component.Base
 */
class GroupIndex extends Component {
    /**
     * Valid values for presentation
     * @member {String[]} presentations=['list','sheet']
     * @protected
     * @static
     */
    static presentations = ['list', 'sheet']

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
         * The group whose page shows this index, marked `aria-current="page"`; null on the page of all examples,
         * which marks "All examples".
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
        bind: {store: 'stores.groups'},
        /**
         * `list` or `sheet`, see the class description.
         * @member {String} presentation_='list'
         * @reactive
         */
        presentation_: 'list',
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
     * @summary Renders the store's groups by band. A band without a published group has no section, and the line
     * under the bands explains a count in parentheses while one shows.
     */
    createEntries() {
        let me        = this,
            bands     = new Map(),
            borrowing = false;

        me.store.forEach(group => {
            bands.has(group.band) || bands.set(group.band, []);
            bands.get(group.band).push(group);
            borrowing ||= group.count === 0
        });

        me.vdom.cn = [
            {tag: 'a', 'aria-current': me.activeFamily === null ? 'page' : null, cls: ['portal-examples-group-index-all'], href: '#/examples', cn: [
                {tag: 'i', cls: ['fa', 'fa-table-cells-large'], 'aria-hidden': true},
                {tag: 'span', text: 'All examples'}
            ]},
            ...[...bands].map(([band, groups]) => ({
                tag: 'section',
                cls: ['portal-examples-group-index-band'],
                cn : [
                    {tag: 'h3', text: band},
                    {tag: 'ul', cn: groups.map(group => me.createEntry(group))}
                ]
            })),
            {tag: 'p', cls: ['portal-examples-group-index-note'], removeDom: !borrowing,
                text: 'A count in parentheses: the examples a group shows from other groups.'}
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
        return {tag: 'li', cn: [{
            tag           : 'a',
            'aria-current': group.family === this.activeFamily ? 'page' : null,
            'aria-label'  : `${group.title}, ${ExampleGroup.countLabel(group)}`,
            href          : '#' + group.route,
            cn            : [
                {tag: 'i',    cls: [...group.iconCls.split(' '), 'portal-examples-group-index-icon'], 'aria-hidden': true},
                {tag: 'span', cls: ['portal-examples-group-index-title'], text: group.title},
                {tag: 'span', cls: ['portal-examples-group-index-count'], text: ExampleGroup.countText(group)}
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
