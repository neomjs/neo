import HeaderToolbarController from './HeaderToolbarController.mjs';
import Toolbar                 from '../../../src/container/Toolbar.mjs';

/**
 * @class RealWorld2.view.HeaderToolbar
 * @extends Neo.container.Toolbar
 */
class HeaderToolbar extends Toolbar {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.HeaderToolbar'
         * @protected
         */
        className: 'RealWorld2.view.HeaderToolbar',
        /**
         * @member {String[]} cls=['rw2-header-toolbar', 'neo-toolbar']
         */
        cls: ['rw2-header-toolbar', 'neo-toolbar'],
        /**
         * @member {Neo.controller.Component} controller=HeaderToolbarController
         */
        controller: HeaderToolbarController,
        /**
         * @member {Number} height=56
         */
        height: 56,
        /**
         * @member {Number} minHeight=56
         */
        minHeight: 56,
        /**
         * @member {Array} items
         */
        items: [{
            text   : 'conduit',
            handler: 'onHomeButtonClick'
        }, '->', {
            iconCls: 'fa fa-home',
            text   : 'Home',
            handler: 'onHomeButtonClick'
        }, {
            iconCls: 'fa fa-sign-in-alt',
            text   : 'Login',
            handler: 'onLoginButtonClick'
        }, {
            iconCls: 'fa fa-dna',
            text   : 'Helix',
            handler: 'onHelixButtonClick'
        }, {
            iconCls: 'fa fa-images',
            text   : 'Gallery',
            handler: 'onGalleryButtonClick'
        }, {
            iconCls: 'fa fa-edit',
            text   : 'New Article',
            handler: 'onNewArticleButtonClick'
        }, {
            iconCls: 'fa fa-user-cog',
            text   : 'Settings',
            handler: 'onSettingsButtonClick'
        }, {
            text   : 'Profile',
            handler: 'onProfileButtonClick'
        }]
    }}
}

Neo.applyClassConfig(HeaderToolbar);

export {HeaderToolbar as default};