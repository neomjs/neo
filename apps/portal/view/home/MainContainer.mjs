import AfterMath from './parts/AfterMath.mjs';
import Colors    from './parts/Colors.mjs';
import Container from '../../../../src/container/Base.mjs';
import Features  from './parts/Features.mjs';
import Helix     from './parts/Helix.mjs';
import How       from './parts/How.mjs';
import MainNeo   from './parts/MainNeo.mjs';

// import References from './parts/References.mjs';

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
         * @member {String[]} cls=['portal-home-maincontainer']
         */
        cls: ['portal-home-maincontainer'],
        /**
         * @member {Object[]} domListeners
         */
        domListeners: [{
            intersect(data) {
                let id = data.path[1].id;
                this.activePartsId = id;
                Neo.getComponent(id)?.activate?.()
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
            Features,
            Helix,
            Colors,
            How,
            // References,
            AfterMath
        ],
        /**
         * @member {Boolean} scrollable=true
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
                observe  : ['.portal-content-wrapper'],
                root     : `#${id}`,
                threshold: 1.0,
                windowId
            })
        })
    }
}

export default Neo.setupClass(MainContainer);
