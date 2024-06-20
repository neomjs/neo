import Component from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.list.animate.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.animate.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.list.animate.MainContainerController',
        /**
         * @member {String} sortBy='firstname'
         * @protected
         */
        sortBy: 'firstname'
    }

    /**
     * @param {Object} data
     */
    changeIsOnlineFilter(data) {
        this.getReference('list').store.getFilter('isOnline').disabled = !data.value;
    }

    /**
     * @param {Object} data
     */
    changeNameFilter(data) {
        this.getReference('list').store.getFilter('name').value = data.value;
    }

    /**
     * @param {Object} data
     */
    changeSorting(data) {
        let me              = this,
            buttonFirstName = me.getReference('firstnameButton'),
            buttonLastName  = me.getReference('lastnameButton'),
            direction       = 'ASC',
            property        = data.component.field,
            store           = me.getReference('list').store,
            sorter          = store.sorters[0],
            button;

        button = property === 'firstname' ? buttonFirstName : buttonLastName;

        if (property === me.sortBy) {
            direction = sorter.direction === 'ASC' ? 'DESC' : 'ASC';
        }

        button.iconCls = `fas fa-arrow-circle-${direction === 'ASC' ? 'up' : 'down'}`;

        button = button === buttonFirstName ? buttonLastName : buttonFirstName;
        button.iconCls = null;

        sorter.set({direction, property});

        me.sortBy = property;
    }

    /**
     * @param {Object} data
     */
    changeTransitionDuration(data) {
        this.getReference('list').getPlugin('list-animate').transitionDuration = data.value;
    }
}

Neo.setupClass(MainContainerController);

export default MainContainerController;
