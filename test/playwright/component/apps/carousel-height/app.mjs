import Carousel from '../../../../../src/component/Carousel.mjs';
import Model    from '../../../../../src/data/Model.mjs';
import Store    from '../../../../../src/data/Store.mjs';
import Viewport from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Fixture for the Carousel height contract.
 *
 * Three carousels side by side: one configured 200 px high, one 800 px high and one without a height,
 * which falls back to the stylesheet's 14rem. Each shows three records, so the navigation bar renders
 * and one slide sits centered.
 * @class Neo.test.playwright.CarouselHeightModel
 * @extends Neo.data.Model
 */
class CarouselHeightModel extends Model {
    static config = {
        className: 'Neo.test.playwright.CarouselHeightModel',
        fields   : [
            {name: 'id',    type: 'Integer'},
            {name: 'quote', type: 'String'}
        ]
    }
}

CarouselHeightModel = Neo.setupClass(CarouselHeightModel);

/**
 * @class Neo.test.playwright.CarouselHeightStore
 * @extends Neo.data.Store
 */
class CarouselHeightStore extends Store {
    static config = {
        className  : 'Neo.test.playwright.CarouselHeightStore',
        keyProperty: 'id',
        model      : CarouselHeightModel,
        data       : [
            {id: 1, quote: 'First slide'},
            {id: 2, quote: 'Second slide'},
            {id: 3, quote: 'Third slide'}
        ]
    }
}

CarouselHeightStore = Neo.setupClass(CarouselHeightStore);

/**
 * @param {String} id
 * @param {Number} [height]
 * @returns {Object}
 */
const carousel = (id, height) => ({
    module : Carousel,
    id,
    height,
    itemTpl: record => [{text: record.quote}],
    store  : CarouselHeightStore,
    width  : 300
});

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: {ntype: 'hbox', align: 'start'},
        items : [
            carousel('carousel-200', 200),
            carousel('carousel-800', 800),
            carousel('carousel-default')
        ]
    },
    name: 'Test.Playwright.CarouselHeight'
});
