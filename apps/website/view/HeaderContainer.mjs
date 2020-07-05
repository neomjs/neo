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
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Array} items
         */
        items: [{
            ntype    : 'component',
            reference: 'logo',

            vdom: {
                cn: [{
                    cls  : ['neo-full-size', 'neo-logo']
                }, {
                    cls: ['neo-relative'],
                    cn : [{
                        cls: ['neo-absolute', 'neo-item-bottom-position'],
                        cn : [{
                            cls : ['neo-title'],
                            html: 'neo.mjs'
                        }, {
                            cls: ['neo-inner-content'],
                            cn : [{
                                cls : ['neo-inner-details'],
                                html: 'Create multithreaded Web Apps'
                            }]
                        }]
                    }]
                }]
            }
        }, {
            ntype : 'container',
            cls   : ['website-header-buttons'],
            layout: {ntype: 'hbox', align: 'stretch'},

            itemDefaults: {
                ntype: 'button'
            },

            items: [{
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
                url    : 'https://twitter.com/UhligTobias'
            }]
        }]
    }}

    constructor(config) {
        super(config);

        this.style = {
            backgroundColor: '#2b2b2b',
            backgroundImage: `url('https://raw.githubusercontent.com/neomjs/pages/master/resources/website/neo-background.png')`
        };
    }
}

Neo.applyClassConfig(HeaderContainer);

export {HeaderContainer as default};