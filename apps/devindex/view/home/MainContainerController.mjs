import Controller from '../../../../src/controller/Component.mjs';

/**
 * @class DevIndex.view.home.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='DevIndex.view.home.MainContainerController'
         * @protected
         */
        className: 'DevIndex.view.home.MainContainerController'
    }

    /**
     * @param {Object} data
     */
    onCommitsOnlyChange(data) {
        this.getReference('grid').commitsOnly = data.value
    }

    /**
     *
     */
    onComponentConstructed() {
        let me = this;

        me.getReference('grid').body.on('select', me.onGridSelect, me);

        me.getReference('controls-tab-container').on('activeIndexChange', me.onControlsTabChange, me);

        Neo.Main.getByPath({
            path    : 'location.search',
            windowId: me.windowId
        }).then(data => {
            if (data) {
                let params  = new URLSearchParams(data),
                    country = params.get('country'),
                    field;

                if (country) {
                    field = me.getReference('country-field');

                    if (field) {
                        field.value = country
                    }
                }
            }
        })
    }

    /**
     * @param {Object} data
     */
    onControlsTabChange(data) {
        let me = this;

        if (data.value === 1 && me.selectedRecord) { // 1 = Profile Tab
            me.getReference('profile-container')?.updateRecord(me.selectedRecord)
        }
    }

    /**
     * @param {Object} data
     */
    onFilterChange(data) {
        let grid  = this.getReference('grid'),
            value = data.component.getSubmitValue();

        if (data.component.name === 'countryCode' && value) {
            value = value.toUpperCase()
        }

        grid.store.getFilter(data.component.name).value = value
    }

    /**
     * @param {Object} data
     */
    onGridSelect(data) {
        let me           = this,
            record       = data.record,
            profile      = me.getReference('profile-container'),
            tabContainer = me.getReference('controls-tab-container');

        me.selectedRecord = record;

        if (record && profile && tabContainer?.activeIndex === 1) {
            profile.updateRecord(record)
        }
    }

    /**
     * @param {Object} data
     */
    onHireableChange(data) {
        this.getReference('grid').store.getFilter('isHireable').value = data.value ? true : null
    }

    /**
     * @param {Object} data
     */
    onSelectionModelChange(data) {
        this.getReference('grid').body.selectionModel = data.component.selectionModel
    }

    /**
     * @param {Object} data
     */
    onShowAnimationsChange(data) {
        this.getReference('grid').animateVisuals = data.value
    }
}

export default Neo.setupClass(MainContainerController);
