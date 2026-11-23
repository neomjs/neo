import Accordion             from '../../../src/container/Accordion.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';

/**
 * @summary An online shop's help center on `Neo.container.Accordion`: four questions, one answer open at a time.
 * The inspector's `maxExpandedItems` lets more answers stay open; lowering it closes the ones opened first.
 * @class Neo.examples.container.accordion.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.container.accordion.MainContainer'
         * @protected
         */
        className: 'Neo.examples.container.accordion.MainContainer',
        /**
         * @member {String[]} cls=['examples-help-center']
         * @reactive
         */
        cls: ['examples-help-center'],
        /**
         * @member {String} componentName='Accordion'
         */
        componentName: 'Accordion',
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
        let me                 = this,
            {exampleComponent} = me;

        return [{
            module   : NumberField,
            clearable: true,
            labelText: 'maxExpandedItems',
            listeners: {change: me.onConfigChange.bind(me, 'maxExpandedItems')},
            maxValue : 4,
            minValue : 0,
            stepSize : 1,
            value    : exampleComponent.maxExpandedItems
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 800,
            minValue : 240,
            stepSize : 10,
            style    : {marginTop: '10px'},
            value    : exampleComponent.height
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 800,
            minValue : 240,
            stepSize : 10,
            style    : {marginTop: '10px'},
            value    : exampleComponent.width
        }]
    }

    /**
     * @summary Returns the help-center `Neo.container.Accordion` config for the workbench stage.
     * @returns {Object}
     */
    createExampleComponent() {
        const answer = html => [{ntype: 'component', cls: ['help-center-answer'], html}];

        return {
            module          : Accordion,
            cls             : ['help-center'],
            height          : 420,
            initialOpen     : [0],
            maxExpandedItems: 1,
            title           : 'Help center',
            width           : 320,

            items: [{
                iconCls: 'fa fa-truck',
                title  : 'Where is my order?',
                items  : answer('Orders leave us within two working days. The email with your tracking link arrives the day the parcel ships.')
            }, {
                iconCls: 'fa fa-rotate-left',
                title  : 'How do I return an item?',
                items  : answer('Send it back within 30 days, unused and in its box. Print the label from your order page; the refund follows within five days of its arrival.')
            }, {
                iconCls: 'fa fa-credit-card',
                title  : 'Which payments do you take?',
                items  : answer('Cards, PayPal and bank transfer. A transfer holds the order until the money arrives.')
            }, {
                iconCls: 'fa fa-shield-halved',
                title  : 'Is there a warranty?',
                items  : answer('Two years on everything we sell, three on our own furniture.')
            }]
        }
    }
}

export default Neo.setupClass(MainContainer);
