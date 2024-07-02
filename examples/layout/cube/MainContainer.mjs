import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Container             from '../../../src/container/Base.mjs';
import CubeLayout            from '../../../src/layout/Cube.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import RangeField            from '../../../src/form/field/Range.mjs';
import Toolbar               from '../../../src/toolbar/Base.mjs';

/**
 * @class Neo.examples.layout.cube.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.layout.cube.MainContainer',
        configItemLabelWidth: 160,
        configItemWidth     : 280,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me       = this,
            {layout} = me.exampleComponent.getItem('container');

        return [{
            module   : RangeField,
            labelText: 'rotateX',
            listeners: {change: me.onLayoutConfigChange.bind(me, 'rotateX')},
            maxValue : 360,
            minValue : 0,
            stepSize : 1,
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
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 300,
            minValue : 30,
            stepSize : 5,
            style    : {marginTop: '20px'},
            value    : me.exampleComponent.height
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 300,
            minValue : 100,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }];
    }

    /**
     * @returns {Neo.component.Base}
     */
    createExampleComponent() {
        return Neo.create({
            module   : Container,
            height   : 300,
            width    : 400,

            items: [{
                module   : Container,
                layout   : {ntype: 'cube'},
                reference: 'container',
                style    : {color: 'white', fontSize: '50px', textAlign: 'center'},

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

                items: [{
                    text: 'Front'
                }, {
                    text: 'Back'
                }, {
                    text: 'Left'
                }, {
                    text: 'Right'
                }, {
                    text: 'Top'
                }, {
                    text: 'Bottom'
                }]
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
}

Neo.setupClass(MainContainer);

export default MainContainer;
