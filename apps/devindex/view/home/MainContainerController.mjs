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

        // Setup Grid Listeners
        let grid = me.getReference('grid');
        if (grid) {
            grid.on('select', me.onGridSelect, me);
        }

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
    onGridSelect(data) {
        let me           = this,
            record       = data.record,
            controls     = me.getReference('controls'),
            profile      = controls?.down({reference: 'profile-container'}),
            tabContainer = controls?.down({reference: 'controls-tab-container'});

        if (record && profile) {
            profile.updateRecord(record);

            if (tabContainer) {
                tabContainer.activeIndex = 1; // Switch to Profile Tab
            }

            if (controls && !controls.cls.includes('neo-expanded')) {
                controls.addCls('neo-expanded');
            }
        }
    }
}

export default Neo.setupClass(MainContainerController);
