import {default as ComponentController} from '../../../src/controller/Component.mjs';
import NeoArray                         from '../../../src/util/Array.mjs';

/**
 * @class CalendarBasic.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='CalendarBasic.MainContainerController'
         * @protected
         */
        className: 'CalendarBasic.MainContainerController'
    }}

    /**
     *
     * @return {Neo.calendar.view.TimeAxisComponent}
     */
    getWeeklyTimeAxis() {
        return this.getReference('calendar').weekComponent.timeAxis;
    }

    /**
     *
     * @param {Object} data
     */
    onIntervalFieldChange(data) {
        this.getWeeklyTimeAxis().interval = data.value;
    }

    /**
     *
     * @param {Object} data
     */
    onRowHeightFieldChange(data) {
        this.getWeeklyTimeAxis().rowHeight = data.value;
    }

    /**
     *
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me            = this,
            button        = data.component,
            headerToolbar = me.getReference('headerToolbar'),
            view          = me.view,
            buttonText, cls, headerColor, iconCls, theme;

        if (button.text === 'Theme Light') {
            buttonText  = 'Theme Dark';
            headerColor = '#f2f2f2';
            iconCls     = 'fa fa-moon';
            theme       = 'neo-theme-light';
        } else {
            buttonText  = 'Theme Light';
            headerColor = '#33343d';
            iconCls     = 'fa fa-sun';
            theme       = 'neo-theme-dark';
        }

        cls = [...view.cls];

        view.cls.forEach(item => {
            if (item.includes('neo-theme')) {
                NeoArray.remove(cls, item);
            }
        });

        NeoArray.add(cls, theme);
        view.cls = cls;

        button.set({
            iconCls: iconCls,
            text   : buttonText
        });

        let style = headerToolbar.style || {};
        style.backgroundColor = headerColor;
        headerToolbar.style = style;
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};