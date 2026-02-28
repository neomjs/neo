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
