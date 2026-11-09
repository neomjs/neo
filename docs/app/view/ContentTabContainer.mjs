import Container from '../../../src/tab/Container.mjs';

/**
 * @class Docs.view.ContentTabContainer
 * @extends Neo.tab.Container
 */
class ContentTabContainer extends Container {
    static config = {
        /**
         * @member {String} className='Docs.view.ContentTabContainer'
         * @protected
         */
        className: 'Docs.view.ContentTabContainer',
        /**
         * @member {String} ntype='docs-content-tabcontainer'
         * @protected
         */
        ntype: 'docs-content-tabcontainer',
        /**
         * @member {Boolean} activateInsertedTabs=true
         */
        activateInsertedTabs: true,
        /**
         * @member {Object} contentContainer
         */
        contentContainer: {
            cls: ['neo-docs-tab-content-container']
        },
        /**
         * @member {Object} headerToolbar
         */
        headerToolbar: {
            cls: ['docs-tab-header-toolbar']
        },
        /**
         * @member {Array} items=[//...]]
         * @reactive
         */
        items: [{
            ntype: 'component',
            html : 'Welcome to the neo.mjs docs!',
            style: {padding: '20px'},

            header: {
                iconCls: 'fa fa-users',
                text   : 'Welcome!'
            }
        }],
        /**
         * @member {Boolean} sortable=true
         * @reactive
         */
        sortable: true
    }

    /**
     *
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me  = this,
            cls = me.cls;

        cls.unshift('docs-content-tabcontainer');
        me.cls = cls
    }

    /**
     * @summary Opts Docs cards into the generic close interaction while preserving each header's own configuration.
     * @param {Object} config
     * @param {Number} index
     * @returns {Object} The merged config
     * @protected
     * @override
     */
    getTabButtonConfig(config, index) {
        return super.getTabButtonConfig({closable: true, ...config}, index)
    }
}

export default Neo.setupClass(ContentTabContainer);
