import ComponentController from '../../../src/controller/Component.mjs';
import MainContainer       from './MainContainer.mjs';

/**
 * @summary Answers the strip's "+" with a new closable tab, which the container activates on insert.
 * @class Neo.examples.tab.browser.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.tab.browser.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.tab.browser.MainContainerController'
    }

    /**
     * The number the next new tab carries in its title
     * @member {Number} newTabCount=0
     */
    newTabCount = 0

    /**
     * @param {Object} data
     * @param {String} data.action
     * @param {Neo.tab.Container} data.tabContainer
     */
    onHeaderAction({action, tabContainer}) {
        if (action === 'add-tab') {
            let me = this;

            me.newTabCount++;

            tabContainer.add(MainContainer.createPage(
                `New tab ${me.newTabCount}`,
                'about:blank',
                'Opened at runtime: drag it along the strip, or close it with its ×.'
            ))
        }
    }
}

export default Neo.setupClass(MainContainerController);
