import Panel    from './Panel.mjs';
import Floating from '../util/Floating.mjs';

/**
 * @class Neo.container.Window
 * @extends Neo.container.Panel
 */
class Window extends Panel {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.container.Window'
         * @private
         */
        className: 'Neo.container.Window',
        /**
         * @member {String} ntype='window'
         * @private
         */
        ntype: 'window',
        /**
         * @member {Boolean} autoMount=true
         * @private
         */
        autoMount: true,
        /**
         * @member {String[]} cls=['neo-window','neo-panel','neo-container']
         * @private
         */
        cls: ['neo-window', 'neo-panel', 'neo-container'],
        /**
         * @member {Boolean} draggable_=true
         */
        draggable_: true,
        /**
         * @member {Array} mixins
         * @private
         */
        mixins: [Floating],
        /**
         * @member {Array} headers
         * @private
         */
        headers: [
            {
                dock : 'top',
                items: [
                    {
                        ntype: 'label',
                        text : 'Window Title'
                    },
                    {
                        ntype: 'component',
                        flex : 1
                    },
                    {
                        iconCls: 'fas fa-window-close',
                        text   : 'Close'
                    }
                ]
            }
        ]
    }}

    afterSetDraggable(value) {
        let me       = this,
            vdom     = me.vdom,
            vdomRoot = me.getVdomRoot();

        if (value === true) {
            vdomRoot.draggable = true;
        } else {
            delete vdomRoot.draggable;
        }

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(Window);

export {Window as default};