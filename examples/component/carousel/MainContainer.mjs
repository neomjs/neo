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

    createExampleComponent() {
        return Neo.create(Carousel, {
            height: 500,
            width : 500,
            // will automatically change to the next extry every 5500 ms
            // if not set or 0, this will show arrows to navigate
            // cannot be changed after created
            autoRun: 5500,
            store  : {
                model: {
                    fields: [
                        // @formatter:off
                        {name: 'quote',      type: 'String'},
                        {name: 'publisher',  type: 'String'},
                        {name: 'date',       type: 'String'}
                        // @formatter:on
                    ]
                },
                data : [{
                    quote    : 'We love the German inspired dishes on the menu',
                    publisher: 'Trip Advisor',
                    date     : 'Dezember 2020'
                }, {
                    quote    : 'Everything about this place was excellent, from start to finish',
                    publisher: 'Trip Advisor',
                    date     : 'Dezember 2021'
                }, {
                    quote    : 'We had three courses and everything was great',
                    publisher: 'Trip Advisor',
                    date     : 'September 2020'
                }, {
                    quote    : 'Excellent Food, Wine and Service',
                    publisher: 'Best Food',
                    date     : 'August 2020'
                }]
            },
            // custom item cls
            itemCls: 'example-carousel-item',
            // each item will be created like the itemTpl structure
            itemTpl: data => [{
                cls : 'example-quote',
                html: data.quote
            }, {
                cls : 'example-details',
                html: `${data.publisher} - ${data.date}`
            }]
        });
    }
}

export default Neo.setupClass(MainContainer);
