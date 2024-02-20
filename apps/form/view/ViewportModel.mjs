import Component    from '../../../src/model/Component.mjs';
import SideNavStore from '../store/SideNav.mjs'

/**
 * @class Form.view.ViewportModel
 * @extends Neo.model.Component
 */
class ViewportModel extends Component {
    static config = {
        /**
         * @member {String} className='Form.view.ViewportModel'
         * @protected
         */
        className: 'Form.view.ViewportModel',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * The currently selected list item inside the SideNavList
             * @member {Number} data.activeIndex
             */
            activeIndex: 0,
            /**
             * The name of the currently selected list item record
             * @member {String} data.activeTitle
             */
            activeTitle: '',
            /**
             * The amount of non-header SideNavList items
             * @member {Number} data.maxIndex
             */
            maxIndex: 0
        },
        /**
         * @member {Object} stores
         */
        stores: {
            sideNav: {
                module  : SideNavStore,
                autoLoad: true,
                url     : '../../resources/examples/data/formSideNav.json'
            }
        }
    }

    /**
     * We are storing the local storage data into this class field
     * @member {Object} data
     */
    formData = null

    /**
     * Loading the local storage formData
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        Neo.main.addon.LocalStorage.readLocalStorageItem({
            appName: this.component.appName,
            key    : 'neo-form'
        }).then(data => {
            this.formData = JSON.parse(data.value);
        })
    }

    /**
     *
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        super.onDataPropertyChange(key, value, oldValue);

        let me = this;

        if (me.formData && key === 'activeIndex') {
            let page = me.getController().getReference('pages-container').items[value];

            if (page instanceof Neo.core.Base) {
                page.setValues(me.formData, true);
            } else {
                setTimeout(() => {
                    me.onDataPropertyChange(key, value, oldValue)
                }, 30)
            }
        }
    }
}

Neo.setupClass(ViewportModel);

export default ViewportModel;
