import Container from '../../../src/container/Base.mjs';
import TabContainer from '../../../src/tab/Container.mjs';

/**
 * @class DevRank.view.ControlsContainer
 * @extends Neo.container.Base
 */
class ControlsContainer extends Container {
    static config = {
        /**
         * @member {String} className='DevRank.view.ControlsContainer'
         * @protected
         */
        className: 'DevRank.view.ControlsContainer',
        /**
         * @member {String[]} cls=['devrank-controls-container']
         * @reactive
         */
        cls: ['devrank-controls-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype  : 'button',
            cls    : ['controls-container-button'],
            handler: 'up.onControlsToggleButtonClick',
            iconCls: 'fas fa-bars'
        }, {
            module        : TabContainer,
            cls           : ['devrank-controls-container-content'],
            dragResortable: true,

            headerToolbar: {
                sortZoneConfig: {
                    adjustItemRectsToParent: true
                }
            },

            items: [{
                module: Container,
                header: {text: 'Filters'},
                layout: 'vbox',

                items: [{
                    ntype     : 'textfield',
                    clearable : true,
                    editable  : true,
                    labelText : 'Search User',
                    labelWidth: 90,
                    listeners : {change: 'up.onSearchFieldChange'},
                    name      : 'search',
                    style     : {marginTop: '.3em'},
                    width     : 200
                }, {
                    ntype    : 'label',
                    reference: 'count-rows-label',
                    style    : {marginTop: '1em'}
                }]
            }]
        }],
        /**
         * @member {Object} layout={ntype:'vbox'}
         * @reactive
         */
        layout: {ntype: 'fit'},
        /**
         * @member {String} tag='aside'
         * @reactive
         */
        tag: 'aside'
    }

    /**
     * @member {Boolean} firstFiltering=true
     */
    firstFiltering = true

    get grid() {
        return this.parent.getItem('grid')
    }

    /**
     * @param {Object} data
     */
    async onControlsToggleButtonClick(data) {
        let me     = this,
            button = data.component;

        button.expanded = !button.expanded;

        me.toggleCls('neo-expanded');

        await me.timeout(button.expanded ? 250 : 0);

        me.grid.toggleCls('neo-extend-margin-right');
    }

    onConstructed() {
        super.onConstructed();

        let me      = this,
            {store} = me.grid;

        store.on({
            filter: me.updateRowsLabel,
            load  : me.updateRowsLabel,
            scope : me
        })
    }

    /**
     * @param {Object} data
     */
    async onSearchFieldChange(data) {
        let me = this;

        // Simple single-field filter for now
        // We can expand this to search multiple fields if needed
        me.grid.store.getFilter('login').value = data.value;
    }

    /**
     *
     */
    updateRowsLabel() {
        let {store} = this.grid;

        if (!store.isLoading) {
            this.getItem('count-rows-label').text = 'Visible: ' + store.getCount()
        }
    }
}

export default Neo.setupClass(ControlsContainer);
