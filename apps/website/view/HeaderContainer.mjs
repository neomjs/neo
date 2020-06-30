import {default as Container} from '../../../src/container/Base.mjs';

/**
 * @class Website.view.HeaderContainer
 * @extends Neo.container.Base
 */
class HeaderContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.HeaderContainer'
         * @protected
         */
        className: 'Website.view.HeaderContainer',
        /**
         * @member {String[]} cls=['website-header-container']
         */
        cls: ['website-header-container'],
        /**
         * @member {Number} height=70
         */
        height: 120,
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            ntype: 'button'
        },
        /**
         * @member {Array} items
         */
        items: [{
            ntype    : 'component',
            minWidth : 267,
            reference: 'logo',
            style    : {margin: '10px', marginRight: '100px'},
            width    : 267,

            vdom: {
                tag: 'img',
                src: 'https://raw.githubusercontent.com/neomjs/pages/master/resources/images/apps/covid/covid_logo_dark.jpg'
            }
        }, {
            ntype: 'component',
            flex : 10
        }, {
            handler: 'onSwitchThemeButtonClick',
            iconCls: 'fa fa-sun'
        }, {
            iconCls: 'fab fa-github',
            url    : 'https://github.com/neomjs/neo'
        }, {
            iconCls: 'fab fa-facebook-f',
            url    : 'https://www.facebook.com/Neomjs-101788847886539/'
        }, {
            iconCls: 'fab fa-linkedin-in',
            url    : 'https://www.linkedin.com/company/26254666/'
        }, {
            iconCls: 'fab fa-twitter',
            style  : {marginRight: '20px'},
            url    : 'https://twitter.com/UhligTobias'
        }]
    }}
}

Neo.applyClassConfig(HeaderContainer);

export {HeaderContainer as default};