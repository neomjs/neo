import Button                  from '../../src/button/Base.mjs';
import CheckBox                from '../../src/form/field/CheckBox.mjs';
import Component               from '../../src/component/Base.mjs';
import FormContainer           from '../../src/form/Container.mjs';
import MainContainerController from './MainContainerController.mjs';
import NumberField             from '../../src/form/field/Number.mjs';
import SelectField             from '../../src/form/field/Select.mjs';
import TextField               from '../../src/form/field/Text.mjs';
import Viewport                from '../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.toast.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className : 'Neo.examples.toast.MainContainer',
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
                width         : 150
            },

            items: [{
                module   : TextField,
                labelText: 'msg',
                name     : 'msg',
                required : true,
                style    : {paddingBottom: '40px', marginLeft: '10px'}
            }, {
                module   : TextField,
                labelText: 'tile',
                name     : 'title'
            }, {
                module   : TextField,
                labelText: 'iconCls',
                name     : 'iconCls'
            }, {
                module   : SelectField,
                labelText: 'position',
                name     : 'position',
                store    : {data: [{name: 'tl'}, {name: 'tc'}, {name: 'tr'}, {name: 'bl'}, {name: 'bc'}, {name: 'br'}]}
            }, {
                module   : SelectField,
                labelText: 'slideDirection',
                name     : 'slideDirection',
                store    : {data: [{name: 'down'}, {name: 'up'}, {name: 'left'}, {name: 'right'}]}
            }, {
                module   : SelectField,
                labelText: 'ui',
                name     : 'ui',
                store    : {data: [{name: 'info'}, {name: 'danger'}, {name: 'success'}]}
            }, {
                module   : NumberField,
                labelText: 'minHeight',
                name     : 'minHeight'
            }, {
                module   : NumberField,
                labelText: 'maxWidth',
                name     : 'maxWidth'
            }, {
                module    : CheckBox,
                labelText : 'Closable',
                labelWidth: 70,
                name      : 'closable',
                reference : 'closable',
                style     : {padding: '8px 0 10px 9px'}
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
                    {cls: 'import', innerHTML: 'import Toast from \'../../../../node_modules/neo.mjs/src/dialog/Toast.mjs\';'},
                    {innerHTML: 'Neo.toast({'},
                    {cls: 'tab', cn: [
                        {cls: 'grey', innerHTML: '/* mandatory */'},
                        {innerHTML: `appName: '${data.appName}',`},
                        {innerHTML: `msg: '${data.msg}',`},
                        {innerHTML: '/* optional */'},
                        {innerHTML: `title: '${data.title}',`, removeDom: !data.title},
                        {innerHTML: `iconCls: '${data.iconCls}',`, removeDom: !data.iconCls},
                        {innerHTML: `closable: ${data.closable},`, removeDom: !data.closable},
                        {innerHTML: `position: '${data.position}',`, removeDom: !data.position},
                        {innerHTML: `slideDirection: '${data.slideDirection}',`, removeDom: !data.slideDirection},
                        {innerHTML: `maxWidth: ${data.maxWidth},`, removeDom: !data.maxWidth},
                        {innerHTML: `minHeight: ${data.minHeight},`, removeDom: !data.minHeight},
                        {innerHTML: `ui: '${data.ui}'`, removeDom: !data.ui},
                    ]},
                    {innerHTML: '})'}
                ]
            }
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
