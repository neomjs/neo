import ComponentController from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.calendar.basic.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.calendar.basic.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.calendar.basic.MainContainerController'
    }

    /**
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me            = this,
            button        = data.component,
            component     = me.component,
            headerToolbar = me.getReference('headerToolbar'),
            buttonText, headerColor, iconCls, style, theme;

        if (button.text === 'Theme Light') {
            buttonText  = 'Theme Dark';
            headerColor = '#f2f2f2';
            iconCls     = 'fa fa-moon';
            theme       = 'neo-theme-light'
        } else {
            buttonText  = 'Theme Light';
            headerColor = '#33343d';
            iconCls     = 'fa fa-sun';
            theme       = 'neo-theme-dark'
        }

        component.theme = theme;

        button.set({
            iconCls,
            text: buttonText
        });

        style = headerToolbar.style || {};
        style.backgroundColor = headerColor;
        headerToolbar.style = style
    }
}

export default Neo.setupClass(MainContainerController);
