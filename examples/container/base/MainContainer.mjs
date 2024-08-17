import Button    from '../../../src/button/Base.mjs';
import Container from '../../../src/container/Base.mjs';

/**
 * @class Neo.examples.container.base.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        className: 'Neo.examples.container.base.MainContainer',
        autoMount: true,
        layout   : 'vbox',

        items: [{
            ntype  : 'button',
            iconCls: 'fa fa-home',
            text   : 'Hello',
            width  : 200
        }, {
            ntype  : 'button',
            iconCls: 'fa fa-user',
            text   : 'World'
        }, {
            ntype : 'container',
            layout: {
                ntype: 'hbox',
                align: 'stretch'
            },
            items : [{
                ntype  : 'button',
                iconCls: 'fa fa-home',
                style  : {color: 'red'},
                text   : 'Hello2',
                width  : 200
            }, {
                ntype    : 'button',
                flex     : 1,
                iconCls  : 'fa fa-user',
                iconColor: 'red',
                text     : 'World2'
            }]
        }, {
            ntype: 'container',

            layout: {
                ntype: 'vbox',
                align: 'start'
            },

            style: {
                marginTop: '30px'
            },

            items: [{
                ntype       : 'button',
                iconCls     : 'fa fa-home',
                iconPosition: 'right',
                text        : 'Right'
            }, {
                ntype       : 'button',
                flex        : 1,
                iconCls     : 'fa fa-user',
                iconPosition: 'top',
                text        : 'Top'
            }, {
                ntype       : 'button',
                flex        : 1,
                iconCls     : 'fa fa-play-circle',
                iconPosition: 'bottom',
                text        : 'Bottom'
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
