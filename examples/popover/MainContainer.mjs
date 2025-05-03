import Component             from '../../src/component/Base.mjs';
import ConfigurationViewport from '../ConfigurationViewport.mjs';
import PopoverPlugin         from '../../src/plugin/Popover.mjs';
import Button                from '../../src/button/Base.mjs';

/**
 * @class Neo.examples.popover.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.popover.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 100,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'},
        cls                 : ['examples-container-accordion']
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
                module : Button,
                width  : 200,
                text   : 'Click Me',
                plugins: [{
                    module: PopoverPlugin,
                    align : 'bc-tc',
                    items : [{
                        ntype  : 'panel',
                        headers: [{
                            dock: 'top',
                            html: 'HEADER'
                        }],
                        items  : [{
                            html: 'This is a comment about the button'
                        }]
                    }]
                }]
            }]
        })
    }
}

export default Neo.setupClass(MainContainer);
