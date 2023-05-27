import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Process               from '../../../src/component/Process.mjs';
import Container             from '../../../src/container/Base.mjs';
import CheckBox              from "../../../src/form/field/CheckBox.mjs";
import TextField from "../../../src/form/field/Text.mjs"

/**
 * @class Neo.examples.container.accordion.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.container.accordion.MainContainer',
        configItemLabelWidth: 150,
        configItemWidth     : 280,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : true,
            labelText: 'horizontal',
            listeners: {change: me.onConfigChange.bind(me, 'horizontal')}
        }, {
            // arrowColor_, iconColor
            module: TextField,
            labelText: 'arrowColor',
            listeners: {change: me.onConfigChange.bind(me, 'arrowColor')}
        }, {
            ntype: 'component',
            html : '<b>maxExpandedItems:</b> 2',
            style: {marginTop: '10px'},
        }, {
            ntype: 'component',
            html : '<b>initialOpen:</b> [0, 1]',
            style: {marginTop: '10px'},
        }, {
            ntype: 'component',
            html : '<u><b>BOTTOM ACCORDION</b></u>',
            style: {marginTop: '10px'},
        }, {
            ntype: 'component',
            html : '<b>maxExpandedItems:</b> 1',
            style: {marginTop: '10px'},
        }, {
            ntype: 'component',
            html : '<b>initialOpen:</b> [0]',
            style: {marginTop: '10px'},
        }];
    }

    createExampleComponent() {
        return Neo.create({
            module: Container,
            items : [{
                module: Process,

                horizontal: true,
                items: [{
                    iconCls: 'fa fa-plane-departure',
                    header: 'Start Eingabe',
                    text: 'Eingabe KM|Start und Rest %',
                    calc: 'KM|Start Batt|End Batt|BattUsed|Capacity-kWh|kWh Used|km/kWh|km left|km gesamt|Temperatur|Humidity|Autobahn|'
                }, {
                    iconCls: 'fa fa-road',
                    header: 'Zwischenstand',
                    text: 'Eingabe KM|Fahrt und Rest %'
                }, {
                    iconCls: 'fa fa-plane-arrival',
                    header: 'Endstand vor dem Aufladen',
                    text: 'Eingabe KM|Fahrt und Rest %'
                }, {
                    iconCls: 'fa fa-bars-progress',
                    header: 'Aufladen',
                    text: 'Rest %'
                }, {
                    iconCls: 'fa fa-square-poll-vertical',
                    header: 'Ausgabe',
                    text: 'Rest Reichweite|Echte km/kWh|Echte kWh pro 100 km'
                }]
            }]
        });
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onConfigChange(config, opts) {
        const process = this.down('process');

        process[config] = opts.value;
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
