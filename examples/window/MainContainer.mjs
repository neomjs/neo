import Button                 from '../../src/component/Button.mjs';
import {default as Container} from '../../src/container/Base.mjs';
import DemoWindow             from './DemoWindow.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

        autoMount: true,
        layout   : 'base',

        style: {
            margin: '20px'
        },

        items: [
            {
                ntype: 'button',

                iconCls  : 'fa fa-home',
                text     : 'Show Window',

                domListeners: {
                    click: {
                        fn: function (data) {
                            let window = Neo.create(DemoWindow, {
                                appName: this.appName
                            });

                            console.log(window);
                        }
                    }
                }
            }
        ]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};