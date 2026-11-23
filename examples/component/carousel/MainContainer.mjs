import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import Carousel              from '../../../src/component/Carousel.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import RangeField            from '../../../src/form/field/Range.mjs';

/**
 * @class Neo.examples.component.carousel.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className: 'Neo.examples.component.carousel.MainContainer',
        layout   : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.autoRun,
            labelText: 'autoRun',
            listeners: {change: me.onConfigChange.bind(me, 'autoRun')}
        }, {
            module   : RangeField,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 800,
            minValue : 200,
            stepSize : 1,
            value    : me.exampleComponent.height
        }, {
            module   : RangeField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 800,
            minValue : 200,
            stepSize : 1,
            value    : me.exampleComponent.width
        }];
    }

    /** @summary Returns the `Neo.component.Carousel` config with portrait store and template. @returns {Object} */
    createExampleComponent() {
        return {
            module: Carousel,
            // 320 px wide, so the carousel fits its stage on a phone as well
            height: 400,
            width : 320,
            // will automatically change to the next entry every 4000 ms
            // if not set or 0, this will show arrows to navigate
            // cannot be changed after created
            autoRun: 4000,
            cls    : ['example-carousel'],
            // the portraits list/animate and the gallery show
            store  : {
                autoLoad: true,
                model   : {
                    fields: [
                        // @formatter:off
                        {name: 'firstname', type: 'String'},
                        {name: 'id',        type: 'Integer'},
                        {name: 'image',     type: 'String'},
                        {name: 'lastname',  type: 'String'}
                        // @formatter:on
                    ]
                },
                url: '../../resources/examples/data/circles/group1.json'
            },
            // custom item cls
            itemCls: 'example-carousel-item',
            // each item will be created like the itemTpl structure
            itemTpl: data => [{
                tag: 'img',
                alt: '',
                src: `${Neo.config.resourcesPath}examples/${data.image}`
            }, {
                cls : 'example-carousel-caption',
                text: `${data.firstname} ${data.lastname}`
            }]
        }
    }
}

export default Neo.setupClass(MainContainer);
