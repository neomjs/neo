import {default as Container}   from '../../../src/container/Base.mjs';
import Button                   from '../../../src/component/Button.mjs';
import {default as SearchField} from '../../../src/form/field/Search.mjs';

/**
 * @class Docs.app.view.HeaderContainer
 * @extends Neo.container.Base
 */
class HeaderContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.app.view.HeaderContainer'
         * @private
         */
        className: 'Docs.app.view.HeaderContainer',
        /**
         * @member {String} ntype='header-container'
         * @private
         */
        ntype: 'neo-docs-header-container',
        /**
         * @member {String[]} cls=['neo-docs-header-container']
         */
        cls: ['neo-docs-header-container'],
        /**
         * @member {Number} height=55
         */
        height: 55,
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Array} items=[//...]
         */
        items: [{
            module         : SearchField,
            listeners      : {change: 'onNavigationSearchFieldChange'},
            placeholderText: 'Filter Navigation',
            style          : {padding: '10px'},
            width          : 240
        }, {
            module      : Button,
            domListeners: {click: 'onSwitchThemeButtonClick'},
            flex        : 'none',
            height      : 27,
            reference   : 'theme-button',
            style       : {marginTop: '5px'},
            text        : 'Theme Dark'
        }, {
            module      : Button,
            domListeners: {click: 'onSwitchSourceViewThemeButtonClick'},
            flex        : 'none',
            height      : 27,
            reference   : 'source-view-theme-button',
            style       : {marginLeft: '10px', marginTop: '5px'},
            text        : 'Source View Theme Dark'
        }, {
            ntype: 'component',
            flex : 1
        }, {
            ntype: 'component',
            cls  : ['neo-logo-text'],
            html : 'neo.mjs docs',
            width: 210
        }]
    }}
}

Neo.applyClassConfig(HeaderContainer);

export {HeaderContainer as default};