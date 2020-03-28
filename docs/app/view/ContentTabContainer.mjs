import Container                 from '../../../src/tab/Container.mjs';
import {default as HeaderButton} from '../../../src/tab/header/Button.mjs';

/**
 * @class Docs.app.view.ContentTabContainer
 * @extends Neo.tab.Container
 */
class ContentTabContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.app.view.ContentTabContainer'
         * @private
         */
        className: 'Docs.app.view.ContentTabContainer',
        /**
         * @member {String} ntype='docs-content-tabcontainer'
         * @private
         */
        ntype: 'docs-content-tabcontainer',
        /**
         * @member {Boolean} activateInsertedTabs=true
         */
        activateInsertedTabs: true,
        /**
         * @member {Object} contentContainerDefaults={cls:[//...]}
         */
        contentContainerDefaults: {
            cls: [
                'neo-docs-tab-content-container',
                'neo-tab-content-container',
                'neo-container'
            ]
        },
        /**
         * @member {Object} headerToolbarDefaults={cls:[//...]}
         */
        headerToolbarDefaults: {
            cls: [
                'docs-tab-header-toolbar',
                'neo-tab-header-toolbar',
                'neo-toolbar'
            ]
        },
        /**
         * @member {Array} items=[//...]]
         */
        items: [{
            ntype: 'component',
            html : 'Welcome to the neoteric docs!',
            style: {padding: '20px'},

            tabButtonConfig: {
                iconCls: 'fa fa-users',
                text   : 'Welcome!'
            }
        }]
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me  = this,
            cls = me.cls;

        cls.unshift('docs-content-tabcontainer');
        me.cls = cls;
    }

    /**
     * Overriding the button click listener to allow closing tabs on icon click
     * @param {Object} config
     * @param {Number} index
     * @returns {Object} The merged config
     * @private
     * @override
     */
    getTabButtonConfig(config, index) {
        let me = this,
            defaultConfig = {
                module : HeaderButton,
                flex   : 'none',
                index  : index,
                pressed: me.activeIndex === index,

                domListeners: {
                    click: {
                        fn: function (data) {
                            let path = data.path.map(e => e.id);

                            if (path[0].indexOf('neo-tab-header-button-') === 0) {
                                me.activeIndex = Neo.getComponent(data.target.id).index;
                            } else {
                                me.removeAt(Neo.getComponent(me.tabBarId).indexOf(path[1]))
                            }
                        },
                        scope: me
                    }
                }
            };

        return {...defaultConfig, ...config};
    }
}

Neo.applyClassConfig(ContentTabContainer);

export {ContentTabContainer as default};