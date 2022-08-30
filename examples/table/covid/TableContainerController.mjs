import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.table.covid.TableContainerController
 * @extends Neo.controller.Component
 */
class TableContainerController extends Controller {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.table.covid.TableContainerController'
         * @protected
         */
        className: 'Neo.examples.table.covid.TableContainerController'
    }}
}

Neo.applyClassConfig(TableContainerController);

export default TableContainerController;
