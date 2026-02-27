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
     * @member {Boolean} firstFiltering=true
     */
    firstFiltering = true

    /**
     * @param {Object} data
     */
    onBufferColumnRangeChange(data) {
        if (data.oldValue) {
            let value = data.value;

            if (Neo.isRecord(value)) {
                value = value.id
            }

            this.getReference('grid').body.bufferColumnRange = parseInt(value)
        }
    }

    /**
     * @param {Object} data
     */
    onBufferRowRangeChange(data) {
        if (data.oldValue) {
            let value = data.value;

            if (Neo.isRecord(value)) {
                value = value.id
            }

            this.getReference('grid').body.bufferRowRange = parseInt(value)
        }
    }

    /**
     * @param {Object} data
     */
    onDataModeChange(data) {
        if (data.value) { // Radio group: only react to the newly checked item
            this.getReference('grid').dataMode = data.component.dataMode
        }
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
    async onFilterChange(data) {
        let me    = this,
            grid  = me.getReference('grid'),
            value = data.component.getSubmitValue();

        if (data.component.name === 'countryCode' && value) {
            value = value.toUpperCase()
        }

        if (me.firstFiltering) {
            me.firstFiltering = false;
            grid.isLoading = 'Is Loading';
            await me.timeout(5)
        }

        grid.store.getFilter(data.component.name).value = value;
        grid.isLoading = false
    }

    /**
     * @param {Object} data
     */
    onGridIsScrollingChange(data) {
        this.setState('isScrolling', data.value)
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
    async onHideAutomationChange(data) {
        let me   = this,
            grid = me.getReference('grid');

        if (me.firstFiltering) {
            me.firstFiltering = false;
            grid.isLoading = 'Is Loading';
            await me.timeout(5)
        }

        grid.store.getFilter('commitRatio').value = data.value ? 90 : null;
        grid.isLoading = false
    }

    /**
     * @param {Object} data
     */
    async onHireableChange(data) {
        let me   = this,
            grid = me.getReference('grid');

        if (me.firstFiltering) {
            me.firstFiltering = false;
            grid.isLoading = 'Is Loading';
            await me.timeout(5)
        }

        grid.store.getFilter('isHireable').value = data.value ? true : null;
        grid.isLoading = false
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
    onAnimateGridVisualsChange(data) {
        this.setState('animateGridVisuals', data.value);

        Neo.main.addon.LocalStorage.updateLocalStorageItem({
            key     : 'devindexAnimateGridVisuals',
            value   : String(data.value),
            windowId: this.windowId
        })
    }

    /**
     * @param {Object} data
     */
    onSlowHeaderVisualsChange(data) {
        this.setState('slowHeaderVisuals', data.value);

        Neo.main.addon.LocalStorage.updateLocalStorageItem({
            key     : 'devindexSlowHeaderVisuals',
            value   : String(data.value),
            windowId: this.windowId
        })
    }
}

export default Neo.setupClass(MainContainerController);
