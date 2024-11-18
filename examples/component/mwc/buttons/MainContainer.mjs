import MwcButton    from '../../../../src/component/mwc/Button.mjs';
import TabContainer from '../../../../src/tab/Container.mjs';
import Viewport     from '../../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.mwc.buttons.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.component.mwc.buttons.MainContainer',
        layout   : {ntype: 'fit'},

        items: [{
            module: TabContainer,
            height: 400,
            style : {flex: 'none', margin: '20px'},
            width : 600,

            items: [{
                ntype : 'container',
                layout: {ntype: 'vbox', align: 'start'},
                style : {margin: '1em'},

                itemDefaults: {
                    module : MwcButton,
                    handler: data => console.log('click', data.component.id),
                    style  : {marginTop: '1em'}
                },

                items: [{
                    label: 'standard',
                    style: null
                }, {
                    label   : 'outlined',
                    outlined: true
                }, {
                    label : 'raised',
                    raised: true
                }, {
                    label     : 'unelevated',
                    unelevated: true
                }, {
                    dense: true,
                    label: 'dense'
                }],

                header: {
                    iconCls: 'fa fa-home',
                    text   : 'Tab 1'
                }
            }, {
                ntype : 'container',
                layout: {ntype: 'vbox', align: 'start'},
                style : {margin: '1em'},

                itemDefaults: {
                    module : MwcButton,
                    handler: data => console.log('click', data.component.id),
                    icon   : 'code',
                    style  : {marginTop: '1em'}
                },

                items: [{
                    label: 'standard',
                    style: null
                }, {
                    label   : 'outlined',
                    outlined: true
                }, {
                    label : 'raised',
                    raised: true
                }, {
                    label     : 'unelevated',
                    unelevated: true
                }, {
                    dense: true,
                    label: 'dense'
                }],

                header: {
                    iconCls: 'fa fa-play-circle',
                    text   : 'Tab 2'
                }
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
