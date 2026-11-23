import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ColorField            from '../../../src/form/field/Color.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Container             from '../../../src/container/Base.mjs';
import Process               from '../../../src/component/Process.mjs';

/**
 * @class Neo.examples.component.process.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className: 'Neo.examples.component.process.MainContainer',
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : true,
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
        }]
    }

    /** @summary Returns the trip-log `Neo.container.Base` config wrapping `Neo.component.Process`. @returns {Object} */
    createExampleComponent() {
        return {
            module: Container,
            cls   : ['neo-examples-process-trip'],
            items : [{
                cls : ['neo-examples-process-heading'],
                html: '<h1>Trip log</h1>'
            }, {
                module    : Process,
                flag      : 'color-change',
                arrowColor: '#aaa',
                horizontal: true,
                iconColor : '#953499',
                items     : [{
                    iconCls: 'fa fa-plane-departure',
                    title  : 'Departure',
                    text   : 'Note the start time and the odometer reading before the trip begins.'
                }, {
                    iconCls: 'fa fa-road',
                    title  : 'On the road',
                    text   : 'Log each stop on the way.'
                }, {
                    iconCls: 'fa fa-plane-arrival',
                    title  : 'Arrival',
                    text   : 'Note the end time and the odometer reading at the destination.'
                }, {
                    iconCls: 'fa fa-square-poll-vertical',
                    title  : 'Trip report',
                    text   : 'Distance and duration follow from the two readings.'
                }]
            }]
        }
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onConfigChange(config, opts) {
        const process = this.down({flag: 'color-change'});

        process[config] = opts.value
    }
}

export default Neo.setupClass(MainContainer);
