import {default as Component}    from '../../src/component/Base.mjs';
import {default as TabContainer} from '../../src/tab/Container.mjs';
import Viewport                  from '../../src/container/Viewport.mjs';

/**
 * @class Covid.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Covid.MainContainer',
        ntype    : 'main-container',

        autoMount: true,
        layout   : {ntype: 'vbox', align: 'stretch'},

        items: [{
            ntype : 'component', // todo: HeaderComponent,
            height: 70,
            html  : 'COVID-19 neo.mjs App',
            style : {padding: '20px'}
        }, {
            module: TabContainer,
            flex  : 1,
            style : {margin: '20px'},

            itemDefaults: {
                module: Component,
                cls   : ['neo-examples-tab-component'],
                style : {padding: '20px'},
            },

            items: [{
                tabButtonConfig: {
                    iconCls: 'fa fa-home',
                    text   : 'Tab 1'
                },
                vdom: {innerHTML: 'Welcome to your new Neo App.'}
            }, {
                tabButtonConfig: {
                    iconCls: 'fa fa-play-circle',
                    text   : 'Tab 2'
                },
                vdom: {innerHTML: 'Have fun creating something awesome!'}
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};