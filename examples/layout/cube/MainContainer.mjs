import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Container             from '../../../src/container/Base.mjs';
import CubeLayout            from '../../../src/layout/Cube.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import RangeField            from '../../../src/form/field/Range.mjs';
import Toolbar               from '../../../src/toolbar/Base.mjs';

/**
 * @class Neo.examples.layout.cube.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.layout.cube.MainContainer',
        cls                 : ['examples-layout-cube-maincontainer'],
        configItemLabelWidth: 160,
        configItemWidth     : 280,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me       = this,
            {layout} = me.exampleComponent.getItem('container');

        return [{
            module        : Radio,
            checked       : layout.ntype === 'layout-cube',
            hideValueLabel: false,
            labelText     : 'layout',
            listeners     : {change: me.onRadioLayoutChange.bind(me, 'cube')},
            name          : 'layout',
            valueLabelText: 'Cube'
        }, {
            module        : Radio,
            checked       : layout.ntype === 'layout-vbox',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioLayoutChange.bind(me, 'vbox')},
            name          : 'layout',
            valueLabelText: 'VBox'
        }, {
            module   : RangeField,
            labelText: 'perspective',
            listeners: {change: me.onLayoutConfigChange.bind(me, 'perspective')},
            maxValue : 2000,
            minValue : 400,
            stepSize : 10,
            style    : {marginTop: '20px'},
            value    : layout.perspective
        }, {
            module   : RangeField,
            labelText: 'rotateX',
            listeners: {change: me.onLayoutConfigChange.bind(me, 'rotateX')},
            maxValue : 360,
            minValue : 0,
            stepSize : 1,
            style    : {marginTop: '20px'},
            value    : layout.rotateX
        }, {
            module   : RangeField,
            labelText: 'rotateY',
            listeners: {change: me.onLayoutConfigChange.bind(me, 'rotateY')},
            maxValue : 360,
            minValue : 0,
            stepSize : 1,
            value    : layout.rotateY
        }, {
            module   : RangeField,
            labelText: 'rotateZ',
            listeners: {change: me.onLayoutConfigChange.bind(me, 'rotateZ')},
            maxValue : 360,
            minValue : 0,
            stepSize : 1,
            value    : layout.rotateZ
        }, {
            module   : RangeField,
            labelText: 'sideX',
            listeners: {change: me.onLayoutConfigChange.bind(me, 'sideX')},
            maxValue : 400,
            minValue : 100,
            stepSize : 10,
            style    : {marginTop: '20px'},
            value    : layout.sideX
        }, {
            module   : RangeField,
            labelText: 'sideY',
            listeners: {change: me.onLayoutConfigChange.bind(me, 'sideY')},
            maxValue : 400,
            minValue : 100,
            stepSize : 10,
            value    : layout.sideY
        }, {
            module   : RangeField,
            labelText: 'sideZ',
            listeners: {change: me.onLayoutConfigChange.bind(me, 'sideZ')},
            maxValue : 400,
            minValue : 100,
            stepSize : 10,
            value    : layout.sideZ
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 1000,
            minValue : 300,
            stepSize : 10,
            style    : {marginTop: '20px'},
            value    : me.exampleComponent.height
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 1000,
            minValue : 300,
            stepSize : 10,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }];
    }

    /**
     * @returns {Neo.component.Base}
     */
    createExampleComponent() {
        return Neo.create({
            module: Container,
            height: 550,
            layout: {ntype: 'vbox', align: 'center', pack: 'center'},
            width : 550,

            items: [{
                module   : Container,
                reference: 'container',
                style    : {color: 'white', fontSize: '50px', margin: '50px', textAlign: 'center'},

                layout: {
                    ntype  : 'cube',
                    rotateX: 194,
                    rotateY: 213,
                    rotateZ: 162
                },

                items: [
                    {style: {backgroundColor: 'rgba(255,   0,   0, 0.5)'}, html: 'Front'},
                    {style: {backgroundColor: 'rgba(  0, 255,   0, 0.5)'}, html: 'Back'},
                    {style: {backgroundColor: 'rgba(  0,   0, 255, 0.5)'}, html: 'Left'},
                    {style: {backgroundColor: 'rgba(  0, 255, 255, 0.5)'}, html: 'Right'},
                    {style: {backgroundColor: 'rgba(255,   0, 255, 0.5)'}, html: 'Top'},
                    {style: {backgroundColor: 'rgba(255, 255,   0, 0.5)'}, html: 'Bottom'}
                ]
            }, {
                module: Toolbar,
                flex  : 'none',
                style : {marginTop: '1em'},

                itemDefaults: {
                    ntype  : 'button',
                    handler: 'up.onFaceButtonClick',
                    style  : {marginRight: '.3em'}
                },

                items: [
                    {text: 'Front'},
                    {text: 'Back'},
                    {text: 'Left'},
                    {text: 'Right'},
                    {text: 'Top'},
                    {text: 'Bottom'}
                ]
            }]
        })
    }

    /**
     * @param {Object} data
     */
    onFaceButtonClick(data) {
        this.getItem('container').layout['activeFace'] = data.component.text.toLowerCase()
    }


        /**
     * @param {String} config
     * @param {Object} opts
     */
    onLayoutConfigChange(config, opts) {
        this.getItem('container').layout[config] = opts.value
    }

    /**
     * @param {String} name
     * @param {Object} opts
     */
    onRadioLayoutChange(name, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            let layout = name;

            if (name === 'cube') {
                layout = {
                    ntype  : 'cube',
                    rotateX: 194,
                    rotateY: 213,
                    rotateZ: 162
                }
            }

            this.getItem('container').layout = layout;
        }
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
