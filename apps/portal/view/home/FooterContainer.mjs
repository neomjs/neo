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
         * @reactive
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
            items: [{
                module: Component,
                cls   : ['neo-h2'],
                tag   : 'h2',
                text  : 'Content'
            }, {
                iconCls: 'fas fa-people-group',
                route  : '/about-us',
                text   : 'About Us'
            }, {
                iconCls: 'fas fa-book',
                route  : '/docs',
                text   : 'API Docs'
            }, {
                iconCls: 'fas fa-blog',
                route  : '/blog',
                text   : 'Blog'
            }, {
                iconCls: 'fas fa-graduation-cap',
                route  : '/learn',
                text   : 'Learn'
            }, {
                iconCls: 'fas fa-handshake-angle',
                route  : '/services',
                text   : 'Services'
            }]
        }, {
            items: [{
                module: Component,
                cls   : ['neo-h2'],
                tag   : 'h2',
                text  : 'Community'
            }, {
                iconCls: 'fa-brands fa-github',
                text   : 'Contribute',
                url    : 'https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md'
            }, {
                iconCls: 'fa-brands fa-github',
                text   : 'Code of Conduct',
                url    : 'https://github.com/neomjs/neo/blob/dev/.github/CODE_OF_CONDUCT.md'
            }, {
                iconCls: 'fa-brands fa-github',
                text   : 'Report Issues',
                url    : 'https://github.com/neomjs/neo/issues'
            }, {
                iconCls: 'fa-brands fa-slack',
                text   : 'Slack',
                url    : 'https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA'
            }, {
                iconCls: 'fa-brands fa-discord',
                text   : 'Discord',
                url    : 'https://discord.gg/6p8paPq'
            }]
        }, {
            items: [{
                module: Component,
                cls   : ['neo-h2'],
                tag   : 'h2',
                text  : 'Social Media'
            }, {
                iconCls: 'fa-brands fa-linkedin',
                text   : 'LinkedIn',
                url    : 'https://www.linkedin.com/company/neo-mjs/'
            }, {
                iconCls: 'fa-brands fa-facebook',
                text   : 'Facebook',
                url    : 'https://www.facebook.com/neo.mjs'
            }, {
                module: Component,
                cls   : ['portal-home-footer-spacer']
            }, {
                module: Component,
                cls   : ['neo-version'],
                text  : 'v10.5.3'
            }]
        }],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {String} tag='footer'
         * @reactive
         */
        tag: 'footer'
    }
}

export default Neo.setupClass(FooterContainer);
