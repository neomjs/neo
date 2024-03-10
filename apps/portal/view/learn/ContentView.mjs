import Component from '../../../../src/component/Base.mjs';

/**
 * @class Portal.view.learn.ContentView
 * @extends Neo.component.Base
 */
class ContentView extends Component {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.ContentView'
         * @protected
         */
        className: 'Portal.view.learn.ContentView',
        /**
         * @member {String[]} baseCls=['learn-content']
         * @protected
         */
        baseCls: ['learn-content']
    }

    /**
     * @member {Object} record=null
     */
    record = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            click    : me.onClick,
            intersect: 'onIntersect', // view controller
            scope    : me
        })
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        value && setTimeout(() => {
            Neo.main.addon.IntersectionObserver.register({
                callback: 'findTopmostItem',
                id      : me.id,
                root    : `#${me.parentId}`,
                windowId: me.windowId
            })
        }, 50)
    }

    /**
     * @param {Object} data
     */
    onClick(data) {
        let me = this,
            record = me.record;

        if (data.altKey && data.shiftKey && !data.metaKey) {
            me.fire('edit', { component: me, record })
        }
        // Command/windows shift click = refresh
        else if (!data.altKey && data.shiftKey && data.metaKey) {
            me.fire('refresh', { component: me, record })
        }
    }
}

Neo.setupClass(ContentView);

export default ContentView;
