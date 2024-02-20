import Container   from '../../../src/container/Base.mjs';
import Button      from '../../../src/button/Base.mjs';
import SearchField from '../../../src/form/field/Search.mjs';

/**
 * @class Docs.view.HeaderContainer
 * @extends Neo.container.Base
 */
class HeaderContainer extends Container {
    static config = {
        /**
         * @member {String} className='Docs.view.HeaderContainer'
         * @protected
         */
        className: 'Docs.view.HeaderContainer',
        /**
         * @member {String} ntype='header-container'
         * @protected
         */
        ntype: 'neo-docs-header-container',
        /**
         * @member {String[]} baseCls=['neo-docs-header-container']
         */
        baseCls: ['neo-docs-header-container'],
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
    }
}

Neo.setupClass(HeaderContainer);

export default HeaderContainer;
