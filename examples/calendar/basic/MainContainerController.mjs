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
     * True while the viewport is at most a phone's width
     * @member {Boolean|null} phone=null
     * @protected
     */
    phone = null

    /**
     * @summary At a phone's width the day view leads and the side panel folds away; wider, the week and the panel return.
     * @param {Object} data The viewport's resize event
     */
    onResize(data) {
        let me    = this,
            phone = data.borderBoxSize.inlineSize <= 640;

        if (data.id === me.component.id && phone !== me.phone) {
            me.phone = phone;
            me.getReference('calendar').set({activeView: phone ? 'day' : 'week', sideBarExpanded: !phone})
        }
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
