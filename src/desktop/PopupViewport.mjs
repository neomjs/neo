import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';
import Toolbar   from '../toolbar/Base.mjs';
import Viewport  from '../container/Viewport.mjs';

/**
 * @summary Hosts the live app body and its return control in the desktop's native popup.
 * @class Neo.desktop.PopupViewport
 * @extends Neo.container.Viewport
 */
class PopupViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.desktop.PopupViewport'
         * @protected
         */
        className: 'Neo.desktop.PopupViewport',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Toolbar,
            flex     : 'none',
            hidden   : true,
            reference: 'desktopPopupToolbar',
            items    : [{
                module   : Button,
                iconCls  : 'fas fa-arrow-left',
                reference: 'desktopPopupReturn',
                text     : 'Back to desktop'
            }]
        }, {
            module   : Container,
            flex     : 1,
            layout   : 'fit',
            reference: 'desktopPopupBody'
        }]
    }

    /**
     * @summary Offers the return action while this popup hosts a desktop app.
     * @param {Function|null} handler Return action for the current popup route.
     */
    setReturnHandler(handler) {
        if (this.isDestroying || this.isDestroyed) return;

        const toolbar = this.getReference('desktopPopupToolbar'),
              button  = toolbar.getReference('desktopPopupReturn');

        button.handler = handler;
        toolbar.hidden = !handler
    }
}

export default Neo.setupClass(PopupViewport);
