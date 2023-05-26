import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Accordion             from '../../../src/container/Accordion.mjs';

/**
 * @class Neo.examples.button.base.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.button.base.MainContainer',
        configItemLabelWidth: 160,
        configItemWidth     : 280,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            ntype: 'component',
            html : '<b>maxExpandedItems:</b> 2',
            style: {marginTop: '10px'},
        }, {
            ntype: 'component',
            html : '<b>initialOpen:</b> [0, 1]',
            style: {marginTop: '10px'},
        }];
    }

    createExampleComponent() {
        return Neo.create({
            module: Accordion,

            maxExpandedItems: 2,
            initialOpen     : [0, 1],

            height: 550,
            style : {
                backgroundColor: 'grey',
                padding        : '15px'
            },
            items : [{
                iconCls: 'fa fa-dice-one',
                title  : 'First Headerbar',
                items  : [{
                    ntype: 'component',
                    html : 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa. Fusce posuere, magna sed pulvinar ultricies, purus lectus malesuada libero, sit amet commodo magna eros quis urna.'
                }]
            }, {
                iconCls: 'fa-dice-two',
                title  : 'Second Headerbar',
                items  : [{
                    html: 'Nunc viverra imperdiet enim. Fusce est. Vivamus a tellus.'
                }]
            }, {
                iconCls: 'fa-dice-three',
                title  : 'Third Headerbar',
                items  : [{
                    html: 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Proin pharetra nonummy pede. Mauris et orci.'
                }]
            }]
        });
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
