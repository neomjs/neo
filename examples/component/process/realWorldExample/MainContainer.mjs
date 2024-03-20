import Button                from '../../../../src/button/Base.mjs';
import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import ComboBox              from '../../../../src/form/field/ComboBox.mjs';
import Component             from '../../../../src/component/Base.mjs';
import Container             from '../../../../src/container/Base.mjs';
import DisplayField          from '../../../../src/form/field/Display.mjs'
import Form                  from '../../../../src/form/Container.mjs'
import NumberField           from '../../../../src/form/field/Number.mjs'
import Process               from '../../../../src/component/Process.mjs';
import RangeField            from '../../../../src/form/field/Range.mjs'
import TextField             from '../../../../src/form/field/Text.mjs'
import Toast                 from '../../../../src/component/Toast.mjs';

/**
 * @class Neo.examples.component.process.realWorldExample.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.component.process.realWorldExample.MainContainer',
        configItemLabelWidth: 110,
        configItemWidth     : 250,
        configPanelMinWidth : 250,
        configPanelFlex     : 'none',
        layout              : {ntype: 'hbox', align: 'stretch'}
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
            module   : TextField,
            labelText: 'arrowColor',
            listeners: {change: me.onConfigChange.bind(me, 'arrowColor')}
        }, {
            module   : TextField,
            labelText: 'iconColor',
            listeners: {change: me.onConfigChange.bind(me, 'iconColor')}
        }];
    }

    createExampleComponent() {
        const me            = this,
              onRangeChange = me.onRangeChange.bind(me),
              // Wetterdaten von Berlin Tiergarten
              weatherUrl    = 'https://api.open-meteo.com/v1/forecast?latitude=52.51239766781255&longitude=13.35733940978727&current_weather=true';

        let weather = fetch(weatherUrl).then(async (response) => {
            let result        = await response.json(),
                temperature   = Math.ceil(result.current_weather.temperature),
                temperatureEl = me.down({flag: 'temperature'})

            temperatureEl.value = temperature;
        });

        return Neo.create({
            module      : Container,
            maxWidth    : 450,
            maxHeight   : '100%',
            style       : {
                overflowY: 'auto',
                margin   : '0 auto'
            },
            itemDefaults: {
                horizontal: false
            },
            items       : [{
                module: Component,
                vdom  : {
                    cn: [
                        {tag: 'img', src: './RangeHeader.jpg', width: '100%'}
                    ]
                }
            }, {
                module: Process,
                flag  : 'start-process',
                items : [{
                    iconCls: 'fa fa-plane-departure',
                    title  : 'Start Eingabe',
                    text   : 'Batterie % und Kilometerstand'
                }]
            }, {
                module   : Form,
                hasFields: true,
                layout   : {ntype: 'vbox', align: 'stretch'},
                items    : [{
                    module   : NumberField,
                    flag     : 'max-capacity',
                    labelText: 'max. Kapazität kWh',
                    minValue : 1,
                    maxValue : 500,
                    value    : 29
                }, {
                    module           : RangeField,
                    flag             : 'start-battery',
                    labelText        : 'Batterie %',
                    showResultInLabel: true,
                    minValue         : 1,
                    maxValue         : 100,
                    value            : 100,
                    listeners        : {change: onRangeChange}
                }, {
                    module   : NumberField,
                    flag     : 'start-km',
                    labelText: 'Kilometerstand',
                    minValue : 0,
                    maxValue : 500000
                }],
                listeners: {fieldFocusLeave: onRangeChange}
            }, {
                module: Process,
                flag  : 'end-process',
                items : [{
                    iconCls: 'fa fa-plane-arrival',
                    title  : 'Ankunft Eingabe',
                    text   : 'Batterie % und Kilometerstand'
                }]
            }, {
                module   : Form,
                hasFields: true,
                layout   : {ntype: 'vbox', align: 'stretch'},
                items    : [{
                    module           : RangeField,
                    flag             : 'end-battery',
                    labelText        : 'Batterie %',
                    showResultInLabel: true,
                    minValue         : 0,
                    maxValue         : 99,
                    value            : 0,
                    listeners        : {change: onRangeChange}
                }, {
                    module   : NumberField,
                    flag     : 'end-km',
                    labelText: 'Kilometerstand',
                    minValue : 0,
                    maxValue : 500000,
                }],
                listeners: {fieldFocusLeave: onRangeChange}
            }, {
                module    : Process,
                flag      : 'result-process',
                arrowColor: 'rgb(200 155 12)',
                items     : [{
                    iconCls: 'fa fa-square-poll-vertical',
                    title  : 'Ergebnisse',
                    text   : 'Errechnete Ergebnisse'
                }]
            }, {
                module   : Form,
                hasFields: true,
                layout   : {ntype: 'vbox', align: 'stretch'},
                listeners: {fieldChange: onRangeChange},
                items    : [{
                    module   : DisplayField,
                    flag     : 'result',
                    labelText: 'Rest Kilometer'
                }, {
                    module   : DisplayField,
                    flag     : 'remain-kWh',
                    labelText: 'Rest kWh'
                }, {
                    module   : DisplayField,
                    flag     : 'average-kWh',
                    labelText: 'kwH pro 100km'
                }]
            }, {
                module    : Process,
                arrowColor: 'rgb(200 155 12)',
                items     : [{
                    iconCls: 'fa fa-magnifying-glass-chart',
                    title  : 'Zusätzliche Angaben',
                    text   : 'Für die Langzeitauswertung'
                }]
            }, {
                module      : Form,
                flag        : 'additional-information',
                disabled    : true,
                layout      : {ntype: 'vbox', align: 'stretch'},
                itemDefaults: {
                    showResultInLabel: true,
                    value            : 20
                },
                items       : [{
                    module      : ComboBox,
                    displayField: 'name',
                    labelText   : 'Fahrstil',
                    value       : 'normal',

                    store: {
                        data : [
                            {style: 'sportStyle',  name: 'sport',  code: 'sportCode'},
                            {style: 'normalStyle', name: 'normal', code: 'normalCode'},
                            {style: 'ecoStyle',    name: 'eco',    code: 'ecoCode'},
                        ],
                        model: {
                            fields: [
                                {name: 'style', type: 'String'},
                                {name: 'name',  type: 'String'},
                                {name: 'code',  type: 'String'}
                            ]
                        }
                    }
                }, {
                    module   : RangeField,
                    flag     : 'highway',
                    labelText: 'Autobahn %',
                    minValue : 0,
                    maxValue : 100,
                }, {
                    module   : RangeField,
                    flag     : 'temperature',
                    labelText: 'Außen-Temp.',
                    minValue : -20,
                    maxValue : 50
                }, {
                    module : Button,
                    text   : 'Speichern und Auswerten',
                    ui     : 'secondary',
                    style  : {
                        minHeight   : '50px',
                        marginBottom: '35px'
                    },
                    handler: me.onSaveClick.bind(me)
                }],
                listeners   : {fieldChange: onRangeChange}
            }]
        });
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onConfigChange(config, opts) {
        const processes = Neo.find({ntype: 'process'});

        processes.forEach(process => {
            process[config] = opts.value;
        });
    }

    /**
     * @param {Object} data
     */
    onRangeChange(data) {
        const me                      = this,
              startBattery            = me.down({flag: 'start-battery'}).value,
              endBatteryEl            = me.down({flag: 'end-battery'}),
              endBattery              = endBatteryEl.value,
              startKm                 = me.down({flag: 'start-km'}).value,
              endKmEl                 = me.down({flag: 'end-km'}),
              endKm                   = endKmEl.value,
              additionalInformationEl = me.down({flag: 'additional-information'});

        if (startKm) {
            const startProcess = this.down({flag: 'start-process'});

            startProcess.arrowColor = '#12FE88';
        }
        if (endKm) {
            const startProcess = this.down({flag: 'end-process'});

            startProcess.arrowColor = '#12FE88';
        }

        if ((startKm && !endKm) || endKm <= startKm) {
            endKmEl.value = startKm + 5;
        }
        if (endBattery >= startBattery) {
            endBatteryEl.value = startBattery - 1;
        }

        if (startKm && endKm) {
            const resultEl      = me.down({flag: 'result'}),
                  kwpMaxEl      = me.down({flag: 'max-capacity'}),
                  remainKwhEl   = me.down({flag: 'remain-kWh'}),
                  averageKwhEl  = me.down({flag: 'average-kWh'}),
                  maxCapacityEl = me.down({flag: 'max-capacity'}),
                  batteryDiff   = startBattery - endBattery,
                  kmDiff        = endKm - startKm,
                  kWhUsed       = maxCapacityEl.value * (batteryDiff / 100),
                  resultKm      = (endBattery) * kmDiff / batteryDiff;

            additionalInformationEl.disabled = false;
            resultEl.value = Math.ceil(resultKm);
            remainKwhEl.value = Math.ceil(kwpMaxEl.value * (endBattery / 100));
            averageKwhEl.value = Math.ceil(100 * (kWhUsed / kmDiff));
        } else {
            additionalInformationEl.disabled = true;
        }
    }

    /**
     * Shows a toast
     */
    onSaveClick() {
        const averageKwh = this.down({flag: 'average-kWh'}).value;
        let msg     = `Du hast einen durchschnittlichen Verbrauch von ${averageKwh} kwh/100km.`,
            iconCls = 'fa fa-user-tie',
            title   = 'results',
            ui;

        if (averageKwh > 25) {
            msg = `Du bist seeehr sportlich unterwegs mit ${averageKwh} kWh auf 100km`;
            iconCls = 'fa fa-flag-checkered';
            ui = 'danger';
            title = 'racing';
        } else if (averageKwh < 15) {
            msg = `Du bist sehr umweltbewusst gefahren und hast nur ${averageKwh} kwh/100km verbraucht.`;
            iconCls = 'fa-brands fa-pagelines';
            ui = 'success';
            title = 'ECO';
        }

        Neo.toast({
            appName: this.appName,
            ui     : ui,
            iconCls: iconCls,
            title  : title,
            msg    : msg
        });
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
