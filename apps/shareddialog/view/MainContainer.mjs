import Button                  from '../../../src/button/Base.mjs';
import Radio                   from '../../../src/form/field/Radio.mjs';
import MainContainerController from './MainContainerController.mjs';
import Toolbar                 from '../../../src/container/Toolbar.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class SharedDialog.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'SharedDialog.view.MainContainer',
        ntype    : 'main-container',

        autoMount : true,
        controller: MainContainerController,
        layout    : {ntype: 'vbox', align: 'stretch'},
        style     : {padding: '20px'},

        /**
         * Custom config which gets passed to the dialog
         * Either a dom node id, 'document.body' or null
         * @member {String|null} boundaryContainerId='document.body'
         */
        boundaryContainerId: 'document.body',
        /**
         * Custom config
         * @member {Neo.dialog.Base|null} dialog=null
         */
        dialog: null,
        /**
         * @member {Array} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items :[{
                module : Button,
                handler: 'createDialog',
                iconCls: 'fa fa-window-maximize',
                text   : 'Create Dialog',
            }, '->', {
                module : Button,
                handler: 'switchTheme',
                iconCls: 'fa fa-moon',
                text   : 'Theme Dark'
            }, {
                module : Button,
                handler: 'openDockedWindow',
                iconCls: 'fa fa-window-restore',
                style  : {marginLeft: '1em'},
                text   : 'Open docked Window'
            }]
        }, {
            ntype : 'container',
            flex  : 'none',
            layout: 'hbox',

            style: {
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
                    name          : 'dockedPosition'
                },

                items: [{
                    labelText     : 'Dock',
                    valueLabelText: 'Top'
                }, {
                    checked       : true,
                    valueLabelText: 'Right'
                }, {
                    valueLabelText: 'Bottom'
                }, {
                    valueLabelText: 'Left'
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
                userSelect    : 'none'
            }
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};