import ConfigurationViewport from '../ConfigurationViewport.mjs';
import RangeField            from '../../src/form/field/Range.mjs';
import SiteMapComponent      from '../../src/sitemap/Component.mjs';

const portal = 'https://neomjs.com';

/**
 * @class Neo.examples.sitemap.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className    : 'Neo.examples.sitemap.MainContainer',
        cls          : ['sitemap-example'],
        componentName: 'Sitemap',
        layout       : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : RangeField,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 800,
            minValue : 160,
            stepSize : 1,
            value    : me.exampleComponent.height
        }, {
            module   : RangeField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 800,
            minValue : 224,
            stepSize : 1,
            value    : me.exampleComponent.width
        }]
    }

    /**
     * @summary Returns the `Neo.sitemap.Component` config showing the Portal's learning and examples routes.
     * @returns {Object}
     */
    createExampleComponent() {
        return {
            module: SiteMapComponent,
            height: 200,
            width : 460,
            store : {
                data: [
                    {id: 1, column: 0, name: 'Learn',        level: 0, action: `${portal}/learn`, actionType: 'url'},
                    {id: 2, column: 0, name: 'Setup',        level: 1, action: `${portal}/learn/gettingstarted/Setup`, actionType: 'url'},
                    {id: 3, column: 0, name: 'Architecture', level: 1, action: `${portal}/learn/benefits/ArchitectureOverview`, actionType: 'url'},
                    {id: 4, column: 1, name: 'Examples',     level: 0, action: `${portal}/examples`, actionType: 'url'},
                    {id: 5, column: 1, name: 'Grid',         level: 1, action: `${portal}/examples/grid`, actionType: 'url'},
                    {id: 6, column: 1, name: 'Big Data',     level: 1, action: `${portal}/examples/grid/bigData/index.html`, actionType: 'url'}
                ]
            }
        }
    }
}

export default Neo.setupClass(MainContainer);
