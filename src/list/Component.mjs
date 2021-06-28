import Base from './Base.mjs';

/**
 * A base class for lists which will use component based list items
 * @class Neo.list.Component
 * @extends Neo.list.Base
 */
class Component extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.Component'
         * @protected
         */
        className: 'Neo.list.Component',
        /**
         * @member {String} ntype='component-list'
         * @protected
         */
        ntype: 'component-list',
        /**
         * @member {Neo.component.Base[]|null} items=null
         */
        items: null
    }}

    /**
     * Triggered after the appName config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        let me = this;

        super.afterSetAppName(value, oldValue);

        if (value && me.items) {
            me.items.forEach(item => {
                item.appName = value;
            });
        }
    }

    /**
     *
     */
    destroy(...args) {
        let items = this.items || [];

        items.forEach(item => {
            item.destroy();
        });

        super.destroy(...args);
    }

    /**
     *
     * @param {Number|String} id
     * @returns {String}
     */
    getComponentId(id) {
        return `${this.id}__component__${id}`;
    }
}

Neo.applyClassConfig(Component);

export {Component as default};
