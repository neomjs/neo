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
         * @member {Array} items
         */
        items: [{
            ntype    : 'component',
            minWidth : 267,
            reference: 'logo',
            style    : {margin: '10px'},
            width    : 267,

            vdom: {
                tag: 'img',
                src: 'https://raw.githubusercontent.com/neomjs/pages/master/resources/images/apps/covid/covid_logo_dark.jpg'
            }
        }, {
            ntype: 'button',
            text : 'Light Theme'
        }, {
            ntype: 'button',
            text : 'View on GitHub'
        }, {
            ntype: 'button',
            text : 'Follow on Facebook'
        }, {
            ntype: 'button',
            text : 'Follow on LinkedIn'
        }, {
            ntype: 'button',
            style: {marginRight: '20px'},
            text : 'Follow on Twitter'
        }]
    }}
}

Neo.applyClassConfig(HeaderContainer);

export {HeaderContainer as default};