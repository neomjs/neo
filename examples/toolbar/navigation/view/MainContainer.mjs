import Container               from '../../../../src/container/Base.mjs';
import FloatingAction          from '../../../../src/button/FloatingAction.mjs';
import MainContainerController from './MainContainerController.mjs';
import Navigation              from '../../../../src/toolbar/Navigation.mjs';
import Text                    from '../../../../src/form/field/Text.mjs';
import ThemeSwitcher           from '../../../../src/button/ThemeSwitcher.mjs';
import Viewport                from '../../../../src/container/Viewport.mjs';

/**
 * @summary Shows one route-driven workspace with a bottom navigation bar on phones and a rail on wider screens.
 * @class Neo.examples.toolbar.navigation.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.navigation.view.MainContainer'
         * @protected
         */
        className: 'Neo.examples.toolbar.navigation.view.MainContainer',
        /**
         * @member {String[]} cls=['neo-navigation-example']
         * @reactive
         */
        cls: ['neo-navigation-example'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Navigation,
            reference: 'navigation',
            items    : [{
                ariaLabel: 'Inbox',
                badgeText: '3',
                iconCls  : 'fa fa-inbox',
                route    : '/inbox',
                text     : 'Inbox'
            }, {
                iconCls: 'fa fa-calendar',
                route  : '/schedule',
                text   : 'Schedule'
            }, {
                iconCls: 'fa fa-user',
                route  : '/account',
                text   : 'Account'
            }]
        }, {
            module: Container,
            cls   : ['neo-navigation-example-main'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            tag   : 'main',
            items : [{
                module: Container,
                cls   : ['neo-navigation-example-header'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},
                tag   : 'header',
                items : [{
                    ntype: 'component',
                    cls  : ['neo-navigation-example-brand'],
                    text : 'Daybook'
                }, {
                    module: ThemeSwitcher,
                    ui    : 'secondary'
                }]
            }, {
                module      : Container,
                cls         : ['neo-navigation-example-content'],
                flex        : 1,
                itemDefaults: {
                    module      : Container,
                    cls         : ['neo-navigation-example-card'],
                    itemDefaults: {flex: 'none'},
                    layout      : {ntype: 'vbox', align: 'stretch'},
                    tag         : 'section'
                },
                layout   : {ntype: 'card', removeInactiveCards: false},
                reference: 'route-content',
                items    : [{
                    reference: 'inbox-card',
                    items    : [{ntype: 'component', tag: 'h1', text: 'Inbox'}, {
                        ntype: 'component',
                        cls  : ['neo-navigation-example-detail'],
                        tag  : 'p',
                        text : '3 unread'
                    }, {
                        ntype: 'component',
                        cls  : ['neo-navigation-example-list'],
                        tag  : 'ul',
                        html : '<li>Workshop agenda</li><li>Room confirmation</li><li>Travel update</li>'
                    }]
                }, {
                    reference: 'schedule-card',
                    items    : [{ntype: 'component', tag: 'h1', text: 'Schedule'}, {
                        module       : Text,
                        cls          : ['neo-navigation-example-draft'],
                        flex         : 'none',
                        labelPosition: 'top',
                        labelText    : 'Draft',
                        name         : 'draft',
                        reference    : 'schedule-draft'
                    }]
                }, {
                    reference: 'account-card',
                    items    : [{ntype: 'component', tag: 'h1', text: 'Account'}, {
                        ntype: 'component',
                        cls  : ['neo-navigation-example-detail'],
                        tag  : 'p',
                        text : 'Riley Morgan'
                    }]
                }]
            }, {
                module : FloatingAction,
                cls    : ['neo-navigation-example-new-draft'],
                handler: 'onNewDraft',
                iconCls: 'fa fa-plus',
                text   : 'New draft'
            }]
        }],
        /**
         * @member {Object} layout={ntype:'flexbox'}
         * @reactive
         */
        layout: {ntype: 'flexbox'}
    }
}

export default Neo.setupClass(MainContainer);
