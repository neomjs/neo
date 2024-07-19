import Button    from '../../../../src/button/Base.mjs';
import Component from '../../../../src/component/Base.mjs';
import Container from '../../../../src/container/Base.mjs';

/**
 * @class Portal.view.home.FooterContainer
 * @extends Neo.container.Base
 */
class FooterContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.FooterContainer'
         * @protected
         */
        className: 'Portal.view.home.FooterContainer',
        /**
         * @member {String[]} cls=['portal-home-footer-container']
         */
        cls: ['portal-home-footer-container'],
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module: Container,
            cls   : ['portal-home-footer-section'],
            layout: {ntype: 'vbox', align: 'start'},

            itemDefaults: {
                module: Button,
                ui    : 'ghost'
            }
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            html: 'Section 1'
        }, {
            html: 'Section 2'
        }, {
            items: [{
                module: Component,
                cls   : ['neo-h2'],
                html  : 'Social Media',
                tag   : 'h2'
            }, {
                iconCls: 'fa-brands fa-linkedin',
                text   : 'LinkedIn',
                url    : 'https://www.linkedin.com/company/neo-mjs/'
            }, {
                iconCls: 'fa-brands fa-facebook',
                text   : 'Facebook',
                url    : 'https://www.facebook.com/neo.mjs'
            }, {
                iconCls: 'fa-brands fa-x-twitter',
                text   : 'X',
                url    : 'https://x.com/neomjs1'
            }]
        }],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {String} tag='footer'
         */
        tag: 'footer'
    }
}

Neo.setupClass(FooterContainer);

export default FooterContainer;
