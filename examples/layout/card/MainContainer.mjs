import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Container             from '../../../src/container/Base.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import TextField             from '../../../src/form/field/Text.mjs';
import Toolbar               from '../../../src/toolbar/Base.mjs';

/**
 * @summary A three-step setup wizard on the card layout: one card per step, Back and Next move between them, and
 * the inspector picks the direction the cards slide in. The last step reads what the first two took.
 * @class Neo.examples.layout.card.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.layout.card.MainContainer'
         * @protected
         */
        className: 'Neo.examples.layout.card.MainContainer',
        /**
         * @member {String[]} cls=['examples-card-wizard']
         * @reactive
         */
        cls: ['examples-card-wizard'],
        /**
         * @member {String} componentName='Card layout'
         */
        componentName: 'Card layout',
        /**
         * @member {Number} configItemLabelWidth=160
         */
        configItemLabelWidth: 160,
        /**
         * @member {Number} configItemWidth=280
         */
        configItemWidth: 280,
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me       = this,
            {layout} = me.exampleComponent.getItem('card-container');

        return [{
            module        : Radio,
            checked       : layout.slideDirection === 'horizontal',
            hideValueLabel: false,
            labelText     : 'slideDirection',
            listeners     : {change: me.onRadioLayoutChange.bind(me, 'slideDirection', 'horizontal')},
            name          : 'slideDirection',
            valueLabel    : 'horizontal'
        }, {
            module        : Radio,
            checked       : layout.slideDirection === 'vertical',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioLayoutChange.bind(me, 'slideDirection', 'vertical')},
            name          : 'slideDirection',
            valueLabel    : 'vertical'
        }, {
            module        : Radio,
            checked       : layout.slideDirection === null,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioLayoutChange.bind(me, 'slideDirection', null)},
            name          : 'slideDirection',
            valueLabel    : 'null'
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 600,
            minValue : 240,
            stepSize : 10,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.height
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 600,
            minValue : 260,
            stepSize : 10,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }]
    }

    /**
     * @summary Returns the three-step setup wizard `Neo.container.Base` config using `layout-card`.
     * @returns {Object}
     */
    createExampleComponent() {
        const step = (no, title, items) => ({
            module: Container,
            cls   : ['card-wizard-step'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [
                {ntype: 'component', cls: ['card-wizard-count'], flex: 'none', html: `Step ${no} of 3`},
                {ntype: 'component', cls: ['card-wizard-title'], flex: 'none', html: title},
                ...items
            ]
        });

        return {
            module: Container,
            cls   : ['card-wizard'],
            height: 240,
            layout: {ntype: 'vbox', align: 'stretch'},
            width : 320,

            items: [{
                module   : Container,
                layout   : {ntype: 'card', slideDirection: 'horizontal'},
                reference: 'card-container',

                items: [
                    step(1, 'Name your workspace', [{
                        module       : TextField,
                        flex         : 'none',
                        labelPosition: 'top',
                        labelText    : 'Workspace',
                        reference    : 'workspace-name',
                        value        : 'Lighthouse Studio'
                    }]),
                    step(2, 'Invite your team', [{
                        module       : TextField,
                        flex         : 'none',
                        labelPosition: 'top',
                        labelText    : 'Email',
                        reference    : 'invite-email',
                        value        : 'ana@example.com'
                    }]),
                    step(3, 'You are set', [{
                        ntype    : 'component',
                        cls      : ['card-wizard-summary'],
                        flex     : 'none',
                        reference: 'summary'
                    }])
                ]
            }, {
                module: Toolbar,
                cls   : ['card-wizard-buttons'],
                flex  : 'none',

                items: [{
                    disabled : true,
                    handler  : 'up.onPrevButtonClick',
                    reference: 'prev-button',
                    text     : 'Back'
                }, '->', {
                    handler  : 'up.onNextButtonClick',
                    reference: 'next-button',
                    text     : 'Next'
                }]
            }]
        }
    }

    /**
     * @summary Shows a step: the buttons follow it, and the last step reads what the first two took.
     * @param {Number} index
     */
    goTo(index) {
        let me            = this,
            cardContainer = me.getItem('card-container'),
            last          = cardContainer.items.length - 1;

        if (index === last) {
            me.getItem('summary').text =
                `${me.getItem('workspace-name').value} is ready, and an invite goes to ${me.getItem('invite-email').value}.`
        }

        cardContainer.layout.activeIndex = index;
        me.getItem('prev-button').disabled = index === 0;
        me.getItem('next-button').disabled = index === last
    }

    /**
     * @param {Object} data
     */
    onNextButtonClick(data) {
        this.goTo(this.getItem('card-container').layout.activeIndex + 1)
    }

    /**
     * @param {Object} data
     */
    onPrevButtonClick(data) {
        this.goTo(this.getItem('card-container').layout.activeIndex - 1)
    }

    /**
     * @param {String} config
     * @param {String} value
     * @param {Object} opts
     */
    onRadioLayoutChange(config, value, opts) {
        if (opts.value === true) { // only the check of a radio, not its uncheck
            this.getItem('card-container').layout[config] = value
        }
    }
}

export default Neo.setupClass(MainContainer);
