import ConfigurationViewport from '../ConfigurationViewport.mjs';
import RangeField            from '../../src/form/field/Range.mjs';
import SiteMapComponent      from '../../src/sitemap/Component.mjs';

/**
 * @class Neo.examples.sitemap.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className: 'Neo.examples.sitemap.MainContainer',
        layout   : {ntype: 'hbox', align: 'stretch'}
    }

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
        return Neo.create(SiteMapComponent, {
            height: 600,
            width : 800,

            myHandler(record) {
                console.log('myHandler', record);
            },

            store: {
                data: [
                    {id:  1, column: 0, name: 'Group 1', level: 0},
                    {id:  2, column: 0, name: 'Item 1',  level: 1, action: 'item1'},
                    {id:  3, column: 0, name: 'Item 2',  level: 1, action: 'item2'},
                    {id:  4, column: 0, name: 'Item 3',  level: 2, action: 'https://github.com/neomjs/neo', actionType: 'url'},
                    {id:  5, column: 0, name: 'Item 4',  level: 2, disabled: true},
                    {id:  6, column: 1, name: 'Group 2', level: 0},
                    {id:  7, column: 1, name: 'Item 1',  level: 1, action: 'myHandler', actionType: 'handler'},
                    {id:  8, column: 1, name: 'Item 2',  level: 1, hidden: true},
                    {id:  9, column: 1, name: 'Item 3',  level: 1},
                    {id: 10, column: 1, name: 'Item 4',  level: 2}
                ]
            }
        })
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
