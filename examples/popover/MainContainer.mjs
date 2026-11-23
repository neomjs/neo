import Component             from '../../src/component/Base.mjs';
import ConfigurationViewport from '../ConfigurationViewport.mjs';
import PopoverPlugin         from '../../src/plugin/Popover.mjs';
import Button                from '../../src/button/Base.mjs';
import Radio                 from '../../src/form/field/Radio.mjs';

/**
 * @class Neo.examples.popover.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.popover.MainContainer',
        autoMount           : true,
        componentName       : 'Popover',
        configItemLabelWidth: 100,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'},
        cls                 : ['examples-container-accordion']
    }

    /**
     * One radio per side the popover can open on
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me = this;

        return PopoverPlugin.alignValues.filter(Boolean).map((align, index) => ({
            module        : Radio,
            checked       : align === 'bc-tc',
            hideValueLabel: false,
            labelText     : index === 0 ? 'align' : '',
            listeners     : {change: me.onAlignChange.bind(me, align)},
            name          : 'popoverAlign',
            valueLabel    : align
        }))
    }

    /**
     * @returns {*}
     */
    createExampleComponent() {
        return Neo.ntype({
            ntype : 'container',
            height: '30%',
            layout: {ntype: 'vbox', align: 'center', pack: 'center'},
            items : [{
                module: Component,
                height: 10
            }, {
                module   : Button,
                reference: 'popover-owner',
                width    : 200,
                text     : 'Click Me',
                plugins  : [{
                    module: PopoverPlugin,
                    align : 'bc-tc',
                    items : [{
                        ntype  : 'panel',
                        headers: [{
                            dock: 'top',
                            html: 'Popover'
                        }],
                        items  : [{
                            html : 'Anchored to the button that opened it.',
                            style: {maxWidth: '14em', padding: '.75em 1em'}
                        }]
                    }]
                }]
            }]
        })
    }

    /**
     * @param {String} align
     * @param {Object} opts
     */
    onAlignChange(align, opts) {
        if (opts.value) {
            this.exampleComponent.down({reference: 'popover-owner'}).getPlugin('popover').align = align
        }
    }
}

export default Neo.setupClass(MainContainer);
