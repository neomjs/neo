import ComboBox  from '../../../src/form/field/ComboBox.mjs';
import Container from '../../../src/container/Base.mjs';
import Radio     from '../../../src/form/field/Radio.mjs';

/**
 * @class Neo.examples.grid.bigData.ControlsContainer
 * @extends Neo.container.Base
 */
class ControlsContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.ControlsContainer'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.ControlsContainer',
        /**
         * @member {String[]} cls=['neo-examples-bigdata-controls-container']
         */
        cls: ['neo-examples-bigdata-controls-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype  : 'button',
            cls    : ['sections-container-button'],
            handler: 'up.onControlsToggleButtonClick',
            iconCls: 'fas fa-bars'
        }, {
            module: Container,

            itemDefaults: {
                module      : ComboBox,
                clearable   : false,
                displayField: 'id',
                editable    : false
            },

            items: [{
                ntype: 'component',
                html : '<a class="github-button" href="https://github.com/neomjs/neo" data-size="large" data-show-count="true" aria-label="Star neomjs/neo on GitHub">Star</a>',
                style: {marginLeft: 'auto'}
            }, {
                labelText : 'Amount Rows',
                labelWidth: 120,
                listeners : {change: 'up.onAmountRowsChange'},
                store     : ['1000', '5000', '10000', '20000', '50000'],
                style     : {marginTop: '2em'},
                value     : '1000',
                width     : 200
            }, {
                labelText : 'Amount Columns',
                labelWidth: 145,
                listeners : {change: 'up.onAmountColumnsChange'},
                store     : ['10', '25', '50', '75', '100'],
                value     : '50',
                width     : 200
            }, {
                labelText : 'Buffer Rows',
                labelWidth: 145,
                listeners : {change: 'up.onBufferRowRangeChange'},
                store     : ['0', '3', '5', '10', '25', '50'],
                value     : '5',
                width     : 200
            }, {
                labelText : 'Buffer Columns',
                labelWidth: 145,
                listeners : {change: 'up.onBufferColumnRangeChange'},
                store     : ['0', '3', '5', '10', '20'],
                value     : '3',
                width     : 200
            }, {
                module        : Radio,
                checked       : true,
                labelText     : 'Theme',
                labelWidth    : 70,
                listeners     : {change: 'up.onThemeRadioChange'},
                name          : 'theme',
                style         : {marginTop: '2em'},
                value         : 'neo-theme-dark',
                valueLabelText: 'Dark'
            }, {
                module        : Radio,
                labelText     : '',
                labelWidth    : 70,
                listeners     : {change: 'up.onThemeRadioChange'},
                name          : 'theme',
                style         : {marginTop: '.3em'},
                value         : 'neo-theme-light',
                valueLabelText: 'Light'
            }]
        }],
        /**
         * @member {Object} layout={ntype:'vbox'}
         */
        layout: {ntype: 'vbox'},
        /**
         * @member {String} tag='aside'
         */
        tag: 'aside'
    }

    get grid() {
        return this.parent.getItem('grid')
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value) {
            this.timeout(200).then(() => {
                Neo.main.DomAccess.addScript({
                    async   : true,
                    defer   : true,
                    src     : 'https://buttons.github.io/buttons.js',
                    windowId: this.windowId
                })
            })
        }
    }

    /**
     * @param {Object} data
     */
    onAmountColumnsChange(data) {
        if (data.oldValue) {
            this.grid.isLoading = 'Is Loading';
            this.grid.amountColumns = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    onAmountRowsChange(data) {
        if (data.oldValue) {
            this.grid.isLoading = 'Is Loading';
            this.grid.store.amountRows = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    onBufferColumnRangeChange(data) {
        if (data.oldValue) {
            this.grid.view.bufferColumnRange = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    onBufferRowRangeChange(data) {
        if (data.oldValue) {
            this.grid.view.bufferRowRange = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    async onControlsToggleButtonClick(data) {
        let me     = this,
            button = data.component;

        // Custom flag to track the state
        button.expanded = !button.expanded;

        me.toggleCls('neo-expanded');

        await me.timeout(button.expanded ? 250 : 0);

        me.grid.toggleCls('neo-extend-margin-right');
    }
}

export default Neo.setupClass(ControlsContainer);
