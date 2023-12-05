import Component from '../component/Base.mjs';

/**
 * @class Neo.tab.Strip
 * @extends Neo.component.Base
 */
class Strip extends Component {
    static config = {
        /**
         * @member {String} className='Neo.tab.Strip'
         * @protected
         */
        className: 'Neo.tab.Strip',
        /**
         * @member {String} ntype='tab-strip'
         * @protected
         */
        ntype: 'tab-strip',
        /**
         * @member {String[]} baseCls=['neo-tab-strip']
         */
        baseCls: ['neo-tab-strip'],
        /**
         * @member {String|null} tabContainerId=null
         */
        tabContainerId: null,
        /**
         * @member {Boolean} useActiveTabIndicator_=true
         */
        useActiveTabIndicator_: true,
        /**
         * @member {Object} _vdom={cn: [{cls: 'neo-active-tab-indicator'}]}
         */
        _vdom:
        {cn: [
            {cls: ['neo-active-tab-indicator']}
        ]}
    }

    /**
     * Triggered after the useActiveTabIndicator config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseActiveTabIndicator(value, oldValue) {
        this.vdom.cn[0].removeDom = !value;
        this.update()
    }

    /**
     * Gets the DomRect of the active tab, then moves the indicator
     * @param {Object|null} opts
     * @param {Number} opts.oldValue
     * @param {Number} opts.value
     */
    getActiveTabRectThenMove(opts) {
        let me           = this,
            ids          = [me.id],
            tabContainer = me.getTabContainer();

        // We do not need a movement, in case there is no oldValue
        if (me.useActiveTabIndicator && me.vnode && Neo.isNumber(opts?.oldValue)) {
            ids.push(tabContainer.getTabAtIndex(opts.value).id, tabContainer.getTabAtIndex(opts.oldValue).id);

            me.getDomRect(ids).then(data => {
                me.moveActiveIndicator(data)
            })
        }
    }

    /**
     *
     */
    getTabContainer() {
        return Neo.getComponent(this.tabContainerId)
    }

    /**
     * Can either contain the new target rect or the new and old one
     * @param {Object[]} rects
     * @param {Number} rects[0].bottom
     * @param {Number} rects[0].height
     * @param {Number} rects[0].left
     * @param {Number} rects[0].right
     * @param {Number} rects[0].top
     * @param {Number} rects[0].width
     * @param {Number} rects[0].x
     * @param {Number} rects[0].y
     */
    moveActiveIndicator(rects) {
        let me           = this,
            tabStripRect = rects.shift(),
            rect         = rects[1] || rects[0],
            activeTabIndicator, tabContainer;

        if (me.useActiveTabIndicator) {
            activeTabIndicator = me.vdom.cn[0];
            tabContainer       = me.getTabContainer();

            switch (tabContainer.tabBarPosition) {
                case 'bottom':
                case 'top':
                    activeTabIndicator.style = {
                        height: null,
                        left  : `${rect.left - tabStripRect.left}px`,
                        top   : null,
                        width : `${rect.width}px`
                    };
                    break
                case 'left':
                case 'right':
                    activeTabIndicator.style = {
                        height: `${rect.height}px`,
                        left  : null,
                        top   : `${rect.top - tabStripRect.top}px`,
                        width : null
                    };
                    break
            }

            // in case there is a dynamic change (oldValue), call this method again
            if (rects[1]) {
                activeTabIndicator.style.opacity = 0;
                me.update();

                setTimeout(() => {
                    me.moveActiveIndicator([tabStripRect, rects[0]])
                }, 50)
            } else {
                activeTabIndicator.style.opacity = 1;
                me.update();

                setTimeout(() => {
                    activeTabIndicator.style.opacity = 0;
                    me.update()
                }, 300)
            }
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getTabContainer().on({
            activeIndexChange: me.getActiveTabRectThenMove,
            scope            : me
        });
    }
}

Neo.applyClassConfig(Strip);

export default Strip;
