import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Process               from '../../../src/component/Process.mjs';
import Container             from '../../../src/container/Base.mjs';
import CheckBox              from "../../../src/form/field/CheckBox.mjs";
import ColorField             from "../../../src/form/field/Color.mjs"

/**
 * @class Neo.examples.component.process.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.component.process.MainContainer',
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : false,
            value    : 5,
            labelText: 'horizontal',
            listeners: {change: me.onConfigChange.bind(me, 'horizontal')}
        }, {
            module   : ColorField,
            clearable : false,
            labelText: 'arrowColor',
            value: '#aaa',
            listeners: {change: me.onConfigChange.bind(me, 'arrowColor')}
        }, {
            module   : ColorField,
            clearable : false,
            labelText: 'iconColor',
            value: '#953499',
            listeners: {change: me.onConfigChange.bind(me, 'iconColor')}
        }];
    }

    createExampleComponent() {
        return Neo.create({
            module: Container,
            style: {
                overflow: 'auto',
                maxHeight: '100%'
            },
            items : [{
                html: '<h1>Configurable</h1>',
                style: {textAlign: 'center'}
            }, {
                module    : Process,
                flag      : 'color-change',
                arrowColor: '#aaa',
                horizontal: false,
                iconColor : '#953499',
                items     : [{
                    iconCls: 'fa fa-plane-departure',
                    title  : 'Start Eingabe',
                    text   : 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa. Fusce posuere, magna sed pulvinar ultricies, purus lectus malesuada libero, sit amet commodo magna eros quis urna.'
                }, {
                    iconCls: 'fa fa-road',
                    title  : 'Zwischenstand',
                    text   : 'Nunc viverra imperdiet enim. Fusce est. Vivamus a tellus.'
                }, {
                    iconCls: 'fa fa-plane-arrival',
                    title  : 'Endstand vor dem Aufladen',
                    text   : 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Proin pharetra nonummy pede. Mauris et orci.'
                }, {
                    iconCls: 'fa fa-square-poll-vertical',
                    title  : 'Ausgabe',
                    text   : 'Suspendisse dui purus, scelerisque at, vulputate vitae, pretium mattis, nunc. Mauris eget neque at sem venenatis eleifend. Ut nonummy.'
                }]
            }]
        });
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onConfigChange(config, opts) {
        const process = this.down({flag: 'color-change'});

        process[config] = opts.value;
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
