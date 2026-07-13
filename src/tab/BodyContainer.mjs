import Container from '../container/Base.mjs';

/**
 * @class Neo.tab.BodyContainer
 * @extends Neo.container.Base
 */
class BodyContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.tab.BodyContainer'
         * @protected
         */
        className: 'Neo.tab.BodyContainer',
        /**
         * @member {String[]} baseCls=['neo-tab-body-container','neo-container']
         * @protected
         */
        baseCls: ['neo-tab-body-container', 'neo-container']
    }

    /**
     * When adding an existing tab into a different container, it will get automatically from the closest parent.
     * In this case, we also want to remove the tab.header.Button from the tab.header.Toolbar.
     * Use case: SharedCovid.view.MainContainerController
     * @param {Neo.component.Base} component
     * @param {Boolean} [destroyItem=true]
     * @param {Boolean} [silent=false]
     * @param {Boolean} [keepMounted=false]
     * @returns {Neo.component.Base|null}
     */
    remove(component, destroyItem, silent, keepMounted) {
        if (component?.isTab) {
            return this.parent.remove(component, destroyItem, silent, keepMounted)
        } else {
            return super.remove(component, destroyItem, silent, keepMounted)
        }
    }
}

export default Neo.setupClass(BodyContainer);
