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
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me       = this,
            button   = data.component,
            view     = me.view,
            buttonText, cls, iconCls, theme;

        if (button.text === 'Theme Light') {
            buttonText = 'Theme Dark';
            iconCls    = 'fa fa-moon';
            theme      = 'neo-theme-light';
        } else {
            buttonText = 'Theme Light';
            iconCls    = 'fa fa-sun';
            theme      = 'neo-theme-dark';
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
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};