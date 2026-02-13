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
}

export default Neo.setupClass(MainContainerController);
