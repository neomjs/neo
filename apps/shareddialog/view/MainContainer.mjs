import Button                  from '../../../src/button/Base.mjs';
import Radio                   from '../../../src/form/field/Radio.mjs';
import MainContainerController from './MainContainerController.mjs';
import Toolbar                 from '../../../src/toolbar/Base.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class SharedDialog.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='SharedDialog.view.MainContainer'
         * @protected
         */
        className: 'SharedDialog.view.MainContainer',
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items :[{
                module : Button,
                flag   : 'open-dialog-button',
                handler: 'onCreateDialogButtonClick',
                iconCls: 'far fa-window-maximize',
                text   : 'Create Dialog',
            }, '->', {
                module : Button,
                handler: 'switchTheme',
                iconCls: 'fa fa-moon',
                text   : 'Theme Dark'
            }, {
                module : Button,
                handler: 'openDockedWindow',
                iconCls: 'far fa-window-restore',
                style  : {marginLeft: '1em'},
                text   : 'Open docked Window'
            }]
        }, {
            ntype : 'container',
            flex  : 'none',
            layout: 'hbox',

            style: {
                height     : '72px',
                marginRight: '1em',
                marginTop  : '1em'
            },

            items : [{
                ntype: 'component',
                flex : 1
            }, {
                ntype: 'container',
                flex : 'none',

                itemDefaults: {
                    module        : Radio,
                    hideValueLabel: false,
                    labelText     : '',
                    labelWidth    : 50,
                    name          : 'dockedPosition',

                    listeners: {
                        change: 'onDockedPositionChange'
                    }
                },

                items: [{
                    labelText     : 'Dock',
                    valueLabelText: 'Top',
                    value         : 'top'
                }, {
                    checked       : true,
                    valueLabelText: 'Right',
                    value         : 'right'
                }, {
                    valueLabelText: 'Bottom',
                    value         : 'bottom'
                }, {
                    valueLabelText: 'Left',
                    value         : 'left'
                }]
            }]
        }, {
            ntype: 'component',
            flex : 1,
            html : '#1',

            style: {
                alignItems    : 'center',
                color         : '#bbb',
                display       : 'flex',
                fontSize      : '200px',
                justifyContent: 'center',
                marginBottom  : '88px',
                userSelect    : 'none'
            }
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'}
    }
}

export default Neo.setupClass(MainContainer);
