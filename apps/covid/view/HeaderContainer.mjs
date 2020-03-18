import {default as Container} from '../../../src/container/Base.mjs';

/**
 * @class Covid.view.HeaderContainer
 * @extends Neo.container.Base
 */
class HeaderContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.HeaderContainer'
         * @private
         */
        className: 'Covid.view.HeaderContainer',
        /**
         * @member {Number} height=70
         */
        height: 70,
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         */
        layout: {ntype: 'hbox'},
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            ntype: 'component'
        },
        /**
         * @member {Array} items
         */
        items: [{
            html : 'COVID-19 neo.mjs App',
            style: {padding: '20px'},
            width: 210
        }, {
            ntype  : 'button',
            flex   : 'none',
            handler: 'onSwitchThemeButtonClick',
            height : 25,
            style  : {marginTop: '15px'},
            text   : 'Theme Light'
        }, {
            flex: 1
        }, {
            style: {padding: '20px'},
            width: 150,
            vdom : {
                cn: [{
                    tag              : 'a',
                    'aria-label'     : 'Star neomjs/neo on GitHub',
                    cls              : ['github-button'],
                    'data-show-count': 'true',
                    'data-size'      : 'large',
                    href             : 'https://github.com/neomjs/neo',
                    html             : 'Star'
                }]
            }
        }]
    }}
}

Neo.applyClassConfig(HeaderContainer);

export {HeaderContainer as default};