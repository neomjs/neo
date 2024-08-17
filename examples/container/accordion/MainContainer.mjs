import Accordion             from '../../../src/container/Accordion.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Container             from '../../../src/container/Base.mjs';

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
        return [{
            ntype: 'component',
            html : '<u><b>TOP ACCORDION</b></u>',
            style: {marginTop: '10px'},
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
        }]
    }

    createExampleComponent() {
        return Neo.create({
            module: Container,
            items : [{
                module: Accordion,

                title           : 'TOP',
                maxExpandedItems: 2,
                initialOpen     : [0, 1],

                height: 550,
                style : {
                    backgroundColor: 'grey',
                    padding        : '15px'
                },

                items: [{
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
            }, {
                module: Accordion,

                title           : 'bottom',
                maxExpandedItems: 1,
                initialOpen     : [0],

                height: 550,
                style : {
                    backgroundColor: 'darkgrey',
                    padding        : '15px'
                },

                items: [{
                    iconCls: 'fa fa-1',
                    title  : 'Define Content',
                    items  : [{
                        ntype: 'component',
                        html : 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa. Fusce posuere, magna sed pulvinar ultricies, purus lectus malesuada libero, sit amet commodo magna eros quis urna.'
                    }]
                }, {
                    iconCls: 'fa-2',
                    title  : 'Mark Best Fit',
                    items  : [{
                        html: 'Nunc viverra imperdiet enim. Fusce est. Vivamus a tellus.'
                    }]
                }, {
                    iconCls: 'fa-3',
                    title  : 'Create Invoice',
                    items  : [{
                        html: 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Proin pharetra nonummy pede. Mauris et orci.'
                    }]
                }]
            }]
        })
    }
}

export default Neo.setupClass(MainContainer);
