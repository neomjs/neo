import CheckBox              from '../../src/form/field/CheckBox.mjs';
import Carousel              from '../../src/component/Carousel.mjs';
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
            height: 800,
            width : 600
        })
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
