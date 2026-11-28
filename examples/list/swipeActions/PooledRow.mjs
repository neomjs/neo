import Button    from '../../../src/button/Base.mjs';
import Container from '../../../src/container/Base.mjs';
import Label     from '../../../src/component/Label.mjs';

/**
 * @summary Presents one recycled record with a native row menu and revealed Archive button.
 * @class Neo.examples.list.swipeActions.PooledRow
 * @extends Neo.container.Base
 */
class PooledRow extends Container {
    static config = {
        /** @member {String} className='Neo.examples.list.swipeActions.PooledRow' */
        className: 'Neo.examples.list.swipeActions.PooledRow',
        /**
         * @member {String[]} cls=['neo-swipe-example-row']
         */
        cls: ['neo-swipe-example-row'],
        /** @member {Object[]} items The trailing action and the row foreground. */
        items: [{
            module   : Button,
            cls      : ['neo-swipe-example-archive'],
            handler  : 'up.archiveVisible',
            hidden   : true,
            reference: 'reveal',
            text     : 'Archive',
            ui       : 'primary'
        }, {
            module   : Container,
            cls      : ['neo-swipe-example-front'],
            layout   : {ntype: 'hbox', align: 'center'},
            reference: 'front',
            items    : [{
                module   : Label,
                flex     : 1,
                reference: 'title'
            }, {
                module   : Button,
                flex     : 'none',
                handler  : 'up.captureMenuBinding',
                reference: 'actions',
                text     : 'Actions',
                ui       : 'secondary'
            }]
        }],
        /**
         * The currently mounted Store record for this reusable component.
         * @member {Neo.data.Record|null} record_=null
         * @reactive
         */
        record_: null
    }

    /** @member {Object|null} menuBinding=null */
    menuBinding = null

    /**
     * @summary Clears the old presentation when the slot represents another record.
     * @param {Neo.data.Record|null} value
     * @param {Neo.data.Record|null} oldValue
     */
    afterSetRecord(value, oldValue) {
        if (this.isConstructed) {
            this.syncRecord()
        }
    }

    /** @summary Installs the ordinary Button menu and binds the initial record. */
    onConstructed() {
        super.onConstructed();

        this.getReference('actions').menu = {
            focusOnMount: true,
            itemRole    : 'menuitem',
            role        : 'menu',
            items       : [{
                text   : 'Archive',
                handler: () => {
                    const binding = this.menuBinding;
                    this.menuBinding = null;
                    this.getSwipePlugin().commit(binding)
                }
            }]
        };
        this.syncRecord()
    }

    /**
     * @summary Captures the row binding before its menu can move outside the list DOM.
     * @param {Object} data
     */
    captureMenuBinding(data) {
        this.menuBinding = this.getSwipePlugin().getBinding(data)
    }

    /**
     * @summary Sends the revealed button's own native path through the same validated action.
     * @param {Object} data
     */
    archiveVisible(data) {
        const plugin = this.getSwipePlugin();

        plugin.commit(plugin.getBinding(data))
    }

    /**
     * @summary Resolves the list's action owner.
     * @returns {Neo.list.plugin.SwipeActions}
     * @protected
     */
    getSwipePlugin() {
        return this.parent.getPlugin('plugin-list-swipe-actions')
    }

    /**
     * @summary Shows the accessible trailing control only while this record is revealed.
     * @param {Number} distance
     */
    setReveal(distance) {
        this.getReference('front').style = {transform: `translateX(${-distance}px)`};
        this.getReference('reveal').hidden = distance === 0
    }

    /** @summary Resets slot-owned display state before painting its new record. */
    syncRecord() {
        const {menuList} = this.getReference('actions');

        if (menuList) {
            menuList.hidden = true
        }

        this.menuBinding = null;
        this.setReveal(0);
        this.getReference('title').text = this.record?.title || ''
    }
}

export default Neo.setupClass(PooledRow);
