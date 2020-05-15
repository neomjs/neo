import Component           from '../../../../src/controller/Component.mjs';
import SourceViewComponent from "./SourceViewComponent.mjs";

/**
 * @class Docs.app.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.app.view.classdetails.MainContainerController'
         * @private
         */
        className: 'Docs.app.view.classdetails.MainContainerController',
        /**
         * @member {String} ntype='docs-classdetails-maincontainer-controller'
         * @private
         */
        ntype: 'docs-classdetails-maincontainer-controller'
    }}

    /**
     *
     * @param {Object} data
     */
    onHeaderClick(data) {
        let me                  = this,
            record              = me.view.structureData,
            mainContainer       = me.view.up('main-container'),
            contentTabContainer = mainContainer.down('docs-content-tabcontainer'),
            className           = (record.path ? record.path + '.' : '') + record.name;

        contentTabContainer.add({
            module       : SourceViewComponent,
            id           : className + '__source',
            structureData: record,

            tabButtonConfig: {
                iconCls: 'fa fa-code',
                text   : className
            }
        });
    }

    /**
     *
     * @param {Neo.collection.Base} store
     */
    onMutateItems(store) {
        let me            = this,
            countConfigs  = 0,
            countEvents   = 0,
            countMethods  = 0,
            countPrivates = 0,
            countStatics  = 0;

        store.items.forEach(item => {
            if (item.kind === 'function') {
                countMethods++;
            } else if (item.kind === 'member') {
                countConfigs++;
            } else {
                countEvents++;
            }

            if (item.access === 'private') {
                countPrivates++;
            }

            if (item.scope === 'static') {
                countStatics++;
            }
        });

        me.getReference('showConfigs')       .text = 'Configs ' + countConfigs;
        me.getReference('showMethods')       .text = 'Methods ' + countMethods;
        me.getReference('showEvents')        .text = 'Events '  + countEvents;
        me.getReference('showPrivateMembers').text = 'Private ' + countPrivates;
        me.getReference('showStaticMembers') .text = 'Static '  + countStatics;
    }

    /**
     *
     * @param {Object} data
     */
    onScrollIntoView(data) {
        let me     = this,
            button = Neo.getComponent(data.target.id);

        Neo.main.addon.HighlightJS.scrollIntoView({
            text   : button.reference.substr(4),
            vnodeId: me.view.vdom.id
        });
    }

    /**
     *
     * @param {Object} data
     */
    onSearchFieldChange(data) {
        this.getReference('classdetails-memberslist').filterMembersQuery = data.value;
    }

    /**
     *
     * @param {Object} data
     */
    onToggleMembers(data) {
        let button      = Neo.getComponent(data.target.id),
            memberslist = this.getReference('classdetails-memberslist');

        button.iconCls = button.checked ? 'fa fa-square' : 'fa fa-check-square';
        button.checked = !button.checked;

        memberslist[button.reference] = button.checked;
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};