import ComponentController from '../../../src/controller/Component.mjs';

/**
 * @class NeoApp.view.MainComponentController
 * @extends Neo.controller.Component
 */
class MainComponentController extends ComponentController {
    static config = {
        /**
         * @member {String} className='NeoApp.view.MainComponentController'
         * @protected
         */
        className: 'NeoApp.view.MainComponentController'
    }

    /**
     * @param {Object} data
     */
    onButtonClick(data) {
        let me    = this,
            table = me.getReference('table');

        switch (data.path[0].id) {
            case 'add'    : table.add();     break;
            case 'clear'  : table.clear();   break;
            case 'runlots': table.runlots(); break;
        }

        // console.log(data.path[0].id);
    }
}

Neo.setupClass(MainComponentController);

export default MainComponentController;
