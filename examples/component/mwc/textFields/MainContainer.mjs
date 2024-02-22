import MwcTextField from '../../../../src/component/mwc/TextField.mjs';
import TabContainer from '../../../../src/tab/Container.mjs';
import Viewport     from '../../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.mwc.textFields.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.component.mwc.textFields.MainContainer',
        layout   : {ntype: 'fit'},

        items: [{
            module: TabContainer,
            height: 400,
            width : 600,
            style : {flex: 'none', margin: '20px'},

            items: [{
                ntype : 'container',
                layout: {ntype: 'vbox', align: 'start'},
                style : {margin: '1em'},

                itemDefaults: {
                    module: MwcTextField,
                    label : 'My Textfield',
                    style : {marginTop: '1em'}
                },

                items: [{

                }, {
                    icon: 'event'
                }, {
                    iconTrailing: 'delete'
                }, {
                    helper: 'Helper Text'
                }],

                tabButtonConfig: {
                    iconCls: 'fa fa-home',
                    text   : 'Filled'
                }
            }, {
                ntype : 'container',
                layout: {ntype: 'vbox', align: 'start'},
                style : {margin: '1em'},

                itemDefaults: {
                    module  : MwcTextField,
                    label   : 'My Textfield',
                    outlined: true,
                    style   : {marginTop: '1em'}
                },

                items: [{

                }, {
                    icon: 'event'
                }, {
                    iconTrailing: 'delete'
                }, {
                    helper: 'Helper Text'
                }],

                tabButtonConfig: {
                    iconCls: 'fa fa-play-circle',
                    text   : 'Outlined'
                }
            }]
        }]
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
