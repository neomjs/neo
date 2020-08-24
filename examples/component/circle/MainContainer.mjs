import Button                from '../../../src/button/Base.mjs';
import Circle                from '../../../src/component/Circle.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import RangeField            from '../../../src/form/field/Range.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

        autoMount: true,
        layout   : {ntype: 'hbox', align: 'stretch'}
    }}

    createConfigurationComponents() {
        let me = this;

        return [{
            module    :  RangeField,
            labelText : 'height',
            listeners : {change: me.onConfigChange.bind(me, 'height')},
            maxValue  : 800,
            minValue  : 200,
            stepSize  : 1,
            value     : me.exampleComponent.height
        }, {
            module    :  RangeField,
            labelText : 'innerRadius',
            listeners : {change: me.onConfigChange.bind(me, 'innerRadius')},
            maxValue  : 150,
            minValue  : 30,
            stepSize  : 1,
            value     : me.exampleComponent.innerRadius
        }, {
            module   : RangeField,
            labelText: 'itemSize',
            listeners: {change: me.onConfigChange.bind(me, 'itemSize')},
            maxValue : 70,
            minValue : 20,
            stepSize : 1,
            value    : me.exampleComponent.itemSize
        }, {
            module   : RangeField,
            labelText: 'maxItems',
            listeners: {change: me.onConfigChange.bind(me, 'maxItems')},
            maxValue : 15,
            minValue : 1,
            stepSize : 1,
            value    : me.exampleComponent.maxItems
        }, {
            module    :  RangeField,
            id        : me.id + '__' + 'rotateX',
            labelText : 'rotateX',
            listeners : {change: me.onConfigChange.bind(me, 'rotateX')},
            maxValue  : 180,
            minValue  : -180,
            stepSize  : 1,
            value     : me.exampleComponent.rotateX
        }, {
            module    :  RangeField,
            id        : me.id + '__' + 'rotateY',
            labelText : 'rotateY',
            listeners : {change: me.onConfigChange.bind(me, 'rotateY')},
            maxValue  : 180,
            minValue  : -180,
            stepSize  : 1,
            value     : me.exampleComponent.rotateY
        }, {
            module    :  RangeField,
            id        : me.id + '__' + 'rotateZ',
            labelText : 'rotateZ',
            listeners : {change: me.onConfigChange.bind(me, 'rotateZ')},
            maxValue  : 360,
            minValue  : 0,
            stepSize  : 1,
            value     : me.exampleComponent.rotateY
        }, {
            module    :  RangeField,
            labelText : 'width',
            listeners : {change: me.onConfigChange.bind(me, 'width')},
            maxValue  : 800,
            minValue  : 200,
            stepSize  : 1,
            value     : me.exampleComponent.width
        }, {
            module : Button,
            handler: (() => {me.exampleComponent.expand()}),
            style  : {marginTop: '10px'},
            text   : 'Expand',
            width  : 110
        }, {
            module : Button,
            handler: (() => {me.exampleComponent.collapse()}),
            text   : 'Collapse',
            width  : 110
        }, {
            module : Button,
            text   : 'Reset Rotation',
            width  : 110,
            handler: me.onResetRotation.bind(me)
        }, {
            module : Button,
            handler: (() => {me.exampleComponent.flipCircle()}),
            text   : 'Flip',
            width  : 110
        }];
    }

    createExampleComponent() {
        return Neo.create(Circle, {
            height: 500,
            width : 500
        });
    }

    onResetRotation() {
        let pre = this.id + '__';

        Neo.getComponent(pre + 'rotateX').value = 0;
        Neo.getComponent(pre + 'rotateY').value = 0;
        Neo.getComponent(pre + 'rotateZ').value = 0;
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};