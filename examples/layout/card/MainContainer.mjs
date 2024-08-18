import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Container             from '../../../src/container/Base.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import Toolbar               from '../../../src/toolbar/Base.mjs';

/**
 * @class Neo.examples.layout.card.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.layout.card.MainContainer',
        configItemLabelWidth: 160,
        configItemWidth     : 280,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

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
            valueLabelText: 'horizontal'
        }, {
            module        : Radio,
            checked       : layout.slideDirection === 'vertical',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioLayoutChange.bind(me, 'slideDirection', 'vertical')},
            name          : 'slideDirection',
            valueLabelText: 'vertical'
        }, {
            module        : Radio,
            checked       : layout.slideDirection === null,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioLayoutChange.bind(me, 'slideDirection', null)},
            name          : 'slideDirection',
            valueLabelText: 'null'
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'height',
            listeners : {change: me.onConfigChange.bind(me, 'height')},
            maxValue  : 300,
            minValue  : 30,
            stepSize  : 5,
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.height
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'width',
            listeners : {change: me.onConfigChange.bind(me, 'width')},
            maxValue  : 300,
            minValue  : 100,
            stepSize  : 5,
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.width
        }]
    }

    /**
     * @returns {Neo.component.Base}
     */
    createExampleComponent() {
        return Neo.create({
            module   : Container,
            height   : 300,
            width    : 400,

            items: [{
                module   : Container,
                layout   : {ntype: 'card', slideDirection: 'horizontal'},
                reference: 'card-container',

                items: [{
                    style: {backgroundColor: 'red'}
                }, {
                    style: {backgroundColor: 'blue'}
                }, {
                    style: {backgroundColor: 'green'}
                }]
            }, {
                module: Toolbar,
                flex  : 'none',
                style : {marginTop: '1em'},

                items: [{
                    disabled: true,
                    handler  : 'up.onPrevButtonClick',
                    reference: 'prev-button',
                    text     : 'Prev'
                }, '->', {
                    handler  : 'up.onNextButtonClick',
                    reference: 'next-button',
                    text     : 'Next'
                }]
            }]
        })
    }

    /**
     * @param {Object} data
     */
    onNextButtonClick(data) {
        let cardContainer = this.getItem('card-container'),
            {layout}      = cardContainer;

        layout.activeIndex++;
        data.component.disabled = layout.activeIndex === cardContainer.items.length - 1;
        this.getItem('prev-button').disabled = false
    }

    /**
     * @param {String} config
     * @param {String} value
     * @param {Object} opts
     */
    onRadioLayoutChange(config, value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            this.getItem('card-container').layout[config] = value
        }
    }

    /**
     * @param {Object} data
     */
    onPrevButtonClick(data) {
        let cardContainer = this.getItem('card-container'),
            {layout}      = cardContainer;

        layout.activeIndex--;
        data.component.disabled = layout.activeIndex === 0;
        this.getItem('next-button').disabled = false
    }
}

export default Neo.setupClass(MainContainer);
