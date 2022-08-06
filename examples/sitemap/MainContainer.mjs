import ConfigurationViewport from '../ConfigurationViewport.mjs';
import RangeField            from '../../src/form/field/Range.mjs';
import SiteMapContainer      from '../../src/sitemap/Container.mjs';

/**
 * @class Neo.examples.sitemap.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className: 'Neo.examples.sitemap.MainContainer',
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
            labelText : 'width',
            listeners : {change: me.onConfigChange.bind(me, 'width')},
            maxValue  : 800,
            minValue  : 200,
            stepSize  : 1,
            value     : me.exampleComponent.width
        }]
    }

    createExampleComponent() {
        return Neo.create(SiteMapContainer, {
            height: 600,
            width : 800,

            groupStore: {
                data: [
                    {id: 1, name: 'Group 1', column: 0},
                    {id: 2, name: 'Group 2', column: 1}
                ]
            },

            itemStore: {
                data: [
                    {id: 1, groupId: 1, name: 'Item 1', level: 0},
                    {id: 2, groupId: 1, name: 'Item 2', level: 0},
                    {id: 3, groupId: 1, name: 'Item 3', level: 1},
                    {id: 4, groupId: 1, name: 'Item 4', level: 1},
                    {id: 5, groupId: 2, name: 'Item 1', level: 0},
                    {id: 6, groupId: 2, name: 'Item 2', level: 0},
                    {id: 7, groupId: 2, name: 'Item 3', level: 1},
                    {id: 8, groupId: 2, name: 'Item 4', level: 1}
                ]
            }
        })
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
