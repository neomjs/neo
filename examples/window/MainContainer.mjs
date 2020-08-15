import Button     from '../../src/component/Button.mjs';
import Toolbar    from '../../src/container/Toolbar.mjs';
import DemoWindow from './DemoWindow.mjs';

/**
 * @class Window.MainContainer
 * @extends Neo.container.Toolbar
 */
class MainContainer extends Toolbar {
    static getConfig() {return {
        className: 'Window.MainContainer',
        ntype    : 'main-container',

        autoMount: true,
        layout   : 'base',
        style    : {margin: '20px'}
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.items = [{
            module : Button,
            handler: me.createWindow,
            iconCls: 'fa fa-window-maximize',
            text   : 'Create Window',
        }, '->', {
            module : Button,
            handler: me.switchTheme,
            iconCls: 'fa fa-moon',
            text   : 'Dark Theme'
        }];
    }

    /**
     *
     * @param {Object} data
     */
    createWindow(data) {
        Neo.create(DemoWindow, {
            appName: this.appName
        });
    }

    /**
     *
     * @param {Object} data
     */
    switchTheme(data) {
        console.log('switchTheme', data);
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};