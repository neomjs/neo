import AiToolchain from './parts/AiToolchain.mjs';
import Colors      from './parts/Colors.mjs';
import Container   from '../../../../src/container/Base.mjs';
import Features    from './parts/Features.mjs';
import Helix       from './parts/Helix.mjs';
import How         from './parts/How.mjs';
import MainNeo     from './parts/MainNeo.mjs';

/**
 * @class Portal.view.home.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.MainContainer'
         * @protected
         */
        className: 'Portal.view.home.MainContainer',
        /**
         * @member {String[]} cls=['portal-home-maincontainer', 'portal-shared-background']
         * @reactive
         */
        cls: ['portal-home-maincontainer', 'portal-shared-background'],
        /**
         * @member {Object[]} domListeners
         */
        domListeners: [{
            intersect(data) {
                let id = data.path[0].id;
                this.activePartsId = id;

                this.items.forEach(item => {
                    item[item.id === id ? 'activate' : 'deactivate']?.()
                })
            },
            scroll(event) {
                if (event.target.cls.includes('portal-home-maincontainer')) {
                    this.toggleCls('hide-sidebar', event.scrollTop > 80)
                }
            }
        }],
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            flex: 'none'
        },
        /**
         * @member {Object[]} items
         */
        items: [
            {ntype: 'component', cls: ['portal-home-progress']},
            MainNeo,
            Colors,
            Helix,
            How,
            Features,
            AiToolchain
        ],
        /**
         * @member {Boolean} scrollable=true
         * @reactive
         */
        scrollable: true
    }

    /**
     * Internal flag containing the id of the currently visible parts item
     * @member {String|null} activePartsId=null
     */
    activePartsId = null

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me             = this,
            {id, windowId} = me;

        value && me.timeout(50).then(() => {
            Neo.main.addon.IntersectionObserver.register({
                callback : 'isVisible',
                id,
                observe  : ['.portal-home-content-view'],
                root     : `#${id}`,
                threshold: .6,
                windowId
            })
        })
    }
}

export default Neo.setupClass(MainContainer);
