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
     * @summary Observes the viewport theme so the toggle button and header bar match the active scheme from boot onward.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        let me = this;

        me.observeConfig(me.component, 'theme', () => me.syncThemeChrome());
        me.syncThemeChrome()
    }

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
     * @summary Switches the root viewport between `neo-theme-light` and `neo-theme-dark`.
     */
    onSwitchThemeButtonClick() {
        let {component} = this;

        component.theme = component.getTheme()?.includes('dark') ? 'neo-theme-light' : 'neo-theme-dark'
    }

    /**
     * @summary Aligns the header toolbar background and toggle button label/icon with the viewport's current theme.
     */
    syncThemeChrome() {
        let me            = this,
            button        = me.getReference('theme-button'),
            headerToolbar = me.getReference('headerToolbar'),
            isDark        = Boolean(me.component.getTheme()?.includes('dark')),
            style         = {...headerToolbar?.style, backgroundColor: isDark ? '#33343d' : '#f2f2f2'};

        button?.set({
            iconCls: isDark ? 'fa fa-sun' : 'fa fa-moon',
            text   : isDark ? 'Theme Light' : 'Theme Dark'
        });

        if (headerToolbar) {
            headerToolbar.style = style
        }
    }
}

export default Neo.setupClass(MainContainerController);
