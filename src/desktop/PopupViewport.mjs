import Button    from '../button/Base.mjs';
import Component from '../component/Base.mjs';
import Container from '../container/Base.mjs';
import Icon      from '../component/Icon.mjs';
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
         * Loads the desktop wallpaper and app-window glass tokens into the popup document.
         * @member {String[]} additionalThemeFiles=['Neo.desktop.AppWindow','Neo.desktop.Container']
         */
        additionalThemeFiles: ['Neo.desktop.AppWindow', 'Neo.desktop.Container'],
        /**
         * @member {String[]} cls=['neo-desktop-popup-viewport']
         * @reactive
         */
        cls: ['neo-desktop-popup-viewport'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Toolbar,
            cls      : ['neo-desktop-popup-toolbar'],
            flex     : 'none',
            hidden   : true,
            reference: 'desktopPopupToolbar',
            items    : [{
                module   : Icon,
                cls      : ['neo-desktop-app-window-icon'],
                hidden   : true,
                reference: 'desktopPopupIcon'
            }, {
                module   : Component,
                cls      : ['neo-desktop-popup-title'],
                hidden   : true,
                reference: 'desktopPopupTitle'
            }, {
                module   : Component,
                flex     : 1,
                hidden   : true,
                reference: 'desktopPopupSpacer'
            }, {
                module   : Button,
                cls      : ['neo-desktop-popup-return'],
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
     * @summary Offers the return action and app identity while this popup hosts a desktop app.
     * @param {Function|null} handler Return action for the current popup route.
     * @param {Neo.desktop.model.App|Object|null} [record=null] Hosted app record for header icon and title.
     */
    setReturnHandler(handler, record=null) {
        if (this.isDestroying || this.isDestroyed) return;

        const toolbar = this.getReference('desktopPopupToolbar'),
              icon    = toolbar.getReference('desktopPopupIcon'),
              title   = toolbar.getReference('desktopPopupTitle'),
              spacer  = toolbar.getReference('desktopPopupSpacer'),
              button  = toolbar.getReference('desktopPopupReturn'),
              app     = handler ? record : null;

        icon.set({
            cellIconCls: app?.iconCls || null,
            hidden     : !app?.iconCls,
            style      : {'--desktop-app-color': app?.color || null}
        });
        title.set({
            hidden: !app?.text,
            text  : app?.text || null
        });
        spacer.hidden  = !app?.iconCls && !app?.text;
        button.handler = handler;
        toolbar.hidden = !handler
    }
}

export default Neo.setupClass(PopupViewport);
