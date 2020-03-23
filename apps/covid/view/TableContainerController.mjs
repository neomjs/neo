import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.TableContainerController
 * @extends Neo.controller.Component
 */
class TableContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.TableContainerController'
         * @private
         */
        className: 'Covid.view.TableContainerController',
        /**
         * @member {Neo.table.Container|null} table_=null
         * @private
         */
        table_: null
    }}

    /**
     * Triggered when accessing the table config
     * @param {Neo.table.Container|null} value
     * @private
     */
    beforeGetTabley(value) {
        if (!value) {
            this._table = value = this.getReference('table');
        }

        return value;
    }

    /**
     * {Object} data
     */
    onCollapseButtonClick(data) {
        const panel  = this.getReference('controls-panel'),
              expand = panel.width === 40;

        panel.width = expand ? 250 : 40;

        data.component.text = expand ? 'X' : '+';
    }
}

Neo.applyClassConfig(TableContainerController);

export {TableContainerController as default};