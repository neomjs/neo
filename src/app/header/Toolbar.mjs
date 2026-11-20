import Base       from '../../toolbar/Base.mjs';
import Canvas     from './Canvas.mjs';
import Controller from './ToolbarController.mjs';

/**
 * @class Neo.app.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends Base {
    static config = {
        /**
         * @member {String} className='Neo.app.header.Toolbar'
         * @protected
         */
        className: 'Neo.app.header.Toolbar',
        /**
         * @member {String[]} cls=['neo-header-toolbar']
         * @reactive
         */
        cls: ['neo-header-toolbar'],
        /**
         * The id of the header link that stands for the open section, or `null` when none does.
         * The link renders `aria-current="page"` and the header canvas draws its highlight behind it.
         * @member {String|null} activeId_=null
         * @reactive
         */
        activeId_: null,
        /**
         * Optional overrides merged into the `header-canvas` child configuration in `onConstructed()`.
         * @member {Object|null} canvasConfig=null
         */
        canvasConfig: null,
        /**
         * @member {Neo.controller.Component} controller=Controller
         */
        controller: Controller,
        /**
         * @member {Object[]} domListeners
         */
        domListeners: [{
            click     : 'onButtonClick',
            mouseleave: 'onMouseLeave',
            mousemove : {fn: 'onMouseMove', local: true}
        }, {
            mouseenter: 'onButtonMouseEnter',
            mouseleave: 'onButtonMouseLeave',
            delegate  : '.neo-button'
        }],
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            handler: 'onButtonClick',
            ntype  : 'button',
            ui     : 'ghost'
        },
        /**
         * @member {Object} style={position: 'relative'}
         */
        style: {position: 'relative'}
    }

    /**
     * @summary Updates the active link's reactive `ariaCurrent` state and canvas highlight in one VDOM batch.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetActiveId(value, oldValue) {
        let me = this;

        if (!me.isConstructed) {
            return
        }

        let oldButton = oldValue && Neo.getComponent(oldValue),
            newButton = value    && Neo.getComponent(value),
            canvas    = me.getReference('header-canvas');

        if (me.mounted && (oldButton || newButton)) {
            me.update()
        }

        if (oldButton) {
            oldButton.ariaCurrent = null
        }

        if (newButton) {
            newButton.ariaCurrent = 'page'
        }

        if (canvas) {
            canvas.activeId = value
        }
    }

    /**
     * @summary Adds `header-canvas` and applies any construction-time `activeId` once child buttons exist.
     */
    onConstructed() {
        super.onConstructed();

        let me         = this,
            {activeId} = me;

        me.add(Neo.merge({
            module   : Canvas,
            activeId,
            listeners: {canvasReady: 'onCanvasReady', scope: me},
            reference: 'header-canvas'
        }, me.canvasConfig));

        if (activeId) {
            let button = Neo.getComponent(activeId);

            if (button) {
                button.ariaCurrent = 'page'
            }
        }
    }

    /**
     * Empty template method, override in subclasses if needed
     */
    onCanvasReady() {}
}

export default Neo.setupClass(Toolbar);
