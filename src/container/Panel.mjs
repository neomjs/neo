import Container from './Base.mjs';
import Toolbar   from '../toolbar/Base.mjs';

/**
 * An extended Container supporting multiple docked header toolbars
 * @class Neo.container.Panel
 * @extends Neo.container.Base
 */
class Panel extends Container {
    static config = {
        /**
         * @member {String} className='Neo.container.Panel'
         * @protected
         */
        className: 'Neo.container.Panel',
        /**
         * @member {String} ntype='panel'
         * @protected
         */
        ntype: 'panel',
        /**
         * @member {String[]} baseCls=['neo-panel','neo-container']
         */
        baseCls: ['neo-panel', 'neo-container'],
        /**
         * @member {Object} containerConfig=null
         */
        containerConfig: null,
        /**
         * @member {Object} headerDefaults=null
         */
        headerDefaults: null,
        /**
         * @member {Array} headers=null
         */
        headers: null,
        /**
         * @member {Object} items={ntype: 'vbox', align: 'stretch'}
         */
        _layout: {
            ntype: 'vbox',
            align: 'stretch'
        },
        /**
         * @member {Boolean} verticalHeadersFirst=false
         */
        verticalHeadersFirst: false
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (me.hasHeaders() && me.verticalHeadersFirst === true) {
            me.layout = {
                ntype: 'hbox',
                align: 'stretch'
            };
        }
    }

    /**
     * @param {Object} header the header config
     * @returns {Object}
     */
    static createHeaderConfig(header) {
        if (Neo.typeOf(header) === 'NeoInstance') {
            return header;
        }

        let config = {
            flex: '0 1 auto'
        };

        if (!header.module && !header.ntype) {
            config.cls   = ['neo-panel-header-toolbar', 'neo-toolbar'];
            config.ntype = 'toolbar';
        }

        if (header.text) {
            config.items = [{
                ntype: 'label',
                cls  : ['neo-panel-header-text', 'neo-label'],
                text : header.text
            }];

            delete header.text;
        }

        // assuming all labels inside a Panel Header are meant to be titles -> look the same way
        if (Array.isArray(header.items)) {
            header.items.forEach(item => {
                if (item.ntype === 'label') {
                    item.cls = ['neo-panel-header-text', 'neo-label'];
                }
            });
        }

        return {...config, ...header};
    }

    /**
     *
     */
    createItems() {
        let me              = this,
            containerConfig = me.containerConfig;

        if (!me.hasHeaders()) {
            containerConfig && me.set(containerConfig);
            super.createItems();
        } else {
            let hf                   = me.verticalHeadersFirst === false,
                headers              = me.headers || [],
                bottomHeaders        = headers.filter(header => {return header.dock === (hf ?'bottom': 'right')}),
                leftHeaders          = headers.filter(header => {return header.dock === (hf ?'left'  : 'top')}),
                rightHeaders         = headers.filter(header => {return header.dock === (hf ?'right' : 'bottom')}),
                topHeaders           = headers.filter(header => {return header.dock === (hf ?'top'   : 'left')}),
                hasHorizontalHeaders = bottomHeaders.length > 0 || topHeaders  .length > 0,
                hasVerticalHeaders   = leftHeaders  .length > 0 || rightHeaders.length > 0,
                items                = me.items,
                horizontalItems      = [],
                verticalItems        = [],
                config;

            topHeaders.forEach(header => {
                verticalItems.push(Panel.createHeaderConfig(header));
            });

            if (hasVerticalHeaders && (hf && hasHorizontalHeaders || !hf && hasHorizontalHeaders)) {
                leftHeaders.forEach(header => {
                    horizontalItems.push(Panel.createHeaderConfig(header));
                });

                config = {
                    ntype       : 'container',
                    flex        : 1,
                    items,
                    itemDefaults: me.itemDefaults,
                    ...containerConfig
                };

                horizontalItems.push({...me.headerDefaults, ...config});

                rightHeaders.forEach(header => {
                    horizontalItems.push(Panel.createHeaderConfig(header));
                });

                verticalItems.push({
                    ntype : 'container',
                    items : horizontalItems,
                    layout: {
                        ntype: (hf ? 'hbox' : 'vbox'),
                        align: 'stretch'
                    }
                });
            } else {
                config = {
                    ntype       : 'container',
                    flex        : 1,
                    items,
                    itemDefaults: me.itemDefaults,
                    ...containerConfig
                };

                verticalItems.push({...me.headerDefaults, ...config});
            }

            bottomHeaders.forEach(header => {
                verticalItems.push(Panel.createHeaderConfig(header));
            });

            me.items = verticalItems;

            me.itemDefaults = null;

            super.createItems();
        }
    }

    /**
     * @returns {Boolean}
     */
    hasHeaders() {
        return Array.isArray(this.headers) && this.headers.length > 0;
    }
}

Neo.setupClass(Panel);

export default Panel;
