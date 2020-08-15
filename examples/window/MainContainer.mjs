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
            handler: me.createWindow.bind(me),
            iconCls: 'fa fa-window-maximize',
            text   : 'Create Window',
        }, '->', {
            module : Button,
            handler: MainContainer.switchTheme.bind(me),
            iconCls: 'fa fa-moon',
            text   : 'Theme Dark'
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
    static switchTheme(data) {
        let button = data.component,
            buttonText, iconCls, oldTheme, theme;

        if (button.text === 'Theme Light') {
            buttonText  = 'Theme Dark';
            iconCls     = 'fa fa-moon';
            oldTheme    = 'neo-theme-dark';
            theme       = 'neo-theme-light';
        } else {
            buttonText  = 'Theme Light';
            iconCls     = 'fa fa-sun';
            oldTheme    = 'neo-theme-light';
            theme       = 'neo-theme-dark';
        }

        Neo.main.DomAccess.setBodyCls({
            add   : [theme],
            remove: [oldTheme]
        });

        button.set({
            iconCls: iconCls,
            text   : buttonText
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};