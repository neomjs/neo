import Button                  from '../../../src/button/Base.mjs';
import CheckBox                from '../../../src/form/field/CheckBox.mjs';
import ComboBox                from '../../../src/form/field/ComboBox.mjs';
import Component               from '../../../src/component/Base.mjs';
import FormContainer           from '../../../src/form/Container.mjs';
import MainContainerController from './MainContainerController.mjs';
import NumberField             from '../../../src/form/field/Number.mjs';
import TextField               from '../../../src/form/field/Text.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.toast.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className : 'Neo.examples.component.toast.MainContainer',
        autoMount : true,
        controller: MainContainerController,
        layout: {ntype: 'hbox', align: 'stretch'},

        items: [{
            module   : FormContainer,
            flex     : 'none',
            layout   : {ntype: 'vbox'},
            style    : {margin: '20px'},
            reference: 'form',

            itemDefaults: {
                height        : 27,
                labelPosition : 'inline',
                listeners     : {change: 'onChange'},
                maxValue      : 4000,
                style         : {marginLeft: '10px'},
                useSpinButtons: false,
                width         : 200
            },

            items: [{
                module   : TextField,
                labelText: 'msg',
                name     : 'msg',
                required : true,
                style    : {paddingBottom: '40px', marginLeft: '10px'}
            }, {
                module   : TextField,
                labelText: 'title',
                name     : 'title'
            }, {
                module   : TextField,
                labelText: 'iconCls',
                name     : 'iconCls'
            }, {
                module    : ComboBox,
                labelText : 'position = tr',
                name      : 'position',
                store     : {data: [{name: 'tl'}, {name: 'tc'}, {name: 'tr'}, {name: 'bl'}, {name: 'bc'}, {name: 'br'}]},
                valueField: 'name'
            }, {
                module   : ComboBox,
                labelText: 'slideDirection = right',
                name     : 'slideDirection',
                store    : {data: [{name: 'down'}, {name: 'up'}, {name: 'left'}, {name: 'right'}]},
                valueField: 'name'
            }, {
                module   : ComboBox,
                labelText: 'ui = info',
                name     : 'ui',
                store    : {data: [{name: 'info'}, {name: 'danger'}, {name: 'success'}]},
                valueField: 'name'
            }, {
                module   : NumberField,
                labelText: 'minHeight = 50',
                name     : 'minHeight'
            }, {
                module   : NumberField,
                labelText: 'maxWidth = 250',
                name     : 'maxWidth'
            }, {
                module   : NumberField,
                labelText: 'timeout = 3000',
                name     : 'timeout',
                maxValue : 99999
            }, {
                module       : CheckBox,
                labelPosition: 'left',
                labelText    : 'Closable',
                labelWidth   : 70,
                name         : 'closable',
                reference    : 'closable',
                style        : {padding: '8px 0 10px 9px'}
            }, {
                module   : Button,
                reference: 'creation-button',
                disabled : true,
                handler  : 'createToast',
                height   : 27,
                iconCls  : 'fa-solid fa-window-maximize',
                style    : {marginLeft: '10px'},
                text     : 'create toast'
            }]
        }, {
            module: Component,
            reference: 'output',
            cls: ['output'],
            vdom:
            {cn: [
                {tag: 'pre', cn: [
                    {tag: 'code', class: 'javascript'}
                ]}
            ]},

            itemTpl: data => {
                return [
                    {cls: 'import', html: 'import Toast from \'../../../../node_modules/neo.mjs/src/component/Toast.mjs\';'},
                    {html: 'Neo.toast({'},
                    {cls: 'tab', cn: [
                        {cls: 'grey', html: '/* mandatory */'},
                        {html: `appName: '${data.appName}',`},
                        {html: `msg: '${data.msg}',`},
                        {html: `windowId: '${data.windowId}',`},
                        {html: '/* optional */'},
                        {html: `title: '${data.title}',`, removeDom: !data.title},
                        {html: `iconCls: '${data.iconCls}',`, removeDom: !data.iconCls},
                        {html: `closable: ${data.closable},`, removeDom: !data.closable},
                        {html: `position: '${data.position}',`, removeDom: !data.position},
                        {html: `slideDirection: '${data.slideDirection}',`, removeDom: !data.slideDirection},
                        {html: `maxWidth: ${data.maxWidth},`, removeDom: !data.maxWidth},
                        {html: `minHeight: ${data.minHeight},`, removeDom: !data.minHeight},
                        {html: `ui: '${data.ui}'`, removeDom: !data.ui},
                    ]},
                    {html: '})'}
                ]
            }
        }]
    }
}

export default Neo.setupClass(MainContainer);
