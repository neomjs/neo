import AiToolchain   from './parts/AiToolchain.mjs';
import AudienceDoors from './parts/AudienceDoors.mjs';
import Container     from '../../../../src/container/Base.mjs';
import Features      from './parts/Features.mjs';
import Grid          from './parts/Grid.mjs';
import HeroContainer from './parts/hero/Container.mjs';
import How           from './parts/How.mjs';
import Planning      from './parts/Planning.mjs';

/**
 * @summary Scroll-snapped home view sequencing the Hero, AudienceDoors, Engine showcase, and Agent OS stages.
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
         * @member {String} ntype='portal-home-maincontainer'
         * @protected
         */
        ntype: 'portal-home-maincontainer',
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
            HeroContainer,
            {module: AudienceDoors, reference: 'home-audience-doors'},
            {module: Planning,      reference: 'home-body-entry'},
            Grid,
            How,
            Features,
            {module: AiToolchain,   reference: 'home-agent-os'}
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

    /**
     * @summary Syncs AudienceDoors section anchor hrefs once sibling Home stage instances exist.
     */
    onConstructed() {
        super.onConstructed();
        this.getItem('home-audience-doors')?.syncSectionTargets(this)
    }

    /**
     * @summary Smoothly scrolls the home container to a referenced landing-page stage.
     * @param {String} reference
     * @returns {Promise<any>|undefined}
     */
    scrollToPart(reference) {
        const target = this.getItem(reference);

        if (target) {
            return Neo.main.DomAccess.scrollIntoView({
                behavior: 'smooth',
                block   : 'start',
                id      : target.id,
                windowId: this.windowId
            })
        }
    }
}

export default Neo.setupClass(MainContainer);
