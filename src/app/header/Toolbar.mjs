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
     * Triggered after the activeId config got changed. The open section is told to assistive technology
     * through `aria-current="page"` on its link, and to the sighted through the canvas highlight.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetActiveId(value, oldValue) {
        let me = this;

        me.setAriaCurrent(oldValue, false);
        me.setAriaCurrent(value,    true);

        let canvas = me.getReference('header-canvas');

        if (canvas) {
            canvas.activeId = value
        }
    }

    /**
     * Adds or removes `aria-current="page"` on the root of the link with the given id.
     * @param {String|null} id
     * @param {Boolean} current
     * @protected
     */
    setAriaCurrent(id, current) {
        let button = id && Neo.getComponent(id);

        if (button) {
            let vdomRoot = button.getVdomRoot();

            if (current) {
                vdomRoot['aria-current'] = 'page'
            } else {
                delete vdomRoot['aria-current']
            }

            button.update()
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        this.add({
            module   : Canvas,
            listeners: {canvasReady: 'onCanvasReady', scope: this},
            reference: 'header-canvas'
        })
    }

    /**
     * Empty template method, override in subclasses if needed
     */
    onCanvasReady() {}
}

export default Neo.setupClass(Toolbar);
