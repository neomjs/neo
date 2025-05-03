import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Container             from '../../../src/container/Base.mjs';
import ColorField            from '../../../src/form/field/Color.mjs';
import TextField             from '../../../src/form/field/Text.mjs';
import Timer                 from '../../../src/component/Timer.mjs';

/**
 * @class Neo.examples.component.timer.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className: 'Neo.examples.component.timer.MainContainer',
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : TextField,
            labelText: 'dimensions',
            listeners: {change: me.onConfigChange.bind(me, 'dimensions')},
            value    : '8rem'
        }, {
            module   : ColorField,
            clearable: false,
            labelText: 'colorStart',
            listeners: {change: me.onConfigChange.bind(me, 'colorStart')},
            value    : '#8a9b0f'
        }, {
            module   : ColorField,
            clearable: false,
            labelText: 'colorEnd',
            listeners: {change: me.onConfigChange.bind(me, 'colorEnd')},
            value    : '#940a3d'
        }]
    }

    createExampleComponent() {
        return Neo.create({
            module: Container,
            style : {
                overflow : 'auto',
                maxHeight: '100%'
            },
            items : [{
                html: '<h1>Configurable</h1>',
                style: {textAlign: 'center'}
            }, {
                module    : Timer,
                duration  : '20s',
                flag      : 'timer-component',
                dimensions: '8rem'
            }]
        })
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onConfigChange(config, opts) {
        const timer = this.down({flag: 'timer-component'});

        timer[config] = opts.value
    }
}

export default Neo.setupClass(MainContainer);
