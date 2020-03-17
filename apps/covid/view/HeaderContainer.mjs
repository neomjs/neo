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
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            ntype: 'component',
            style: {padding: '20px'}
        },
        /**
         * @member {Array} items
         */
        items: [{
            html: 'COVID-19 neo.mjs App'
        }, {
            flex: 1
        }, {
            vdom: {
                cn: [{
                    tag              : 'a',
                    'aria-label'     : 'Star neomjs/neo on GitHub',
                    cls              : ['github-button'],
                    'data-show-count': 'true',
                    'data-size'      : 'large',
                    href             : 'https://github.com/neomjs/neo',
                    html             : 'Star'
                }]
            },
            width: 150
        }]
    }}
}

Neo.applyClassConfig(HeaderContainer);

export {HeaderContainer as default};