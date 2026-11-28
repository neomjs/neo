import HashHistory              from '../util/HashHistory.mjs';
import {normalizeRoutePathname} from '../util/Route.mjs';
import Toolbar                  from './Base.mjs';

/**
 * @summary Renders one set of destination links as a compact bottom bar or a wide navigation rail.
 *
 * Button routes and badges belong to the items. This toolbar follows its window's history and marks the matching
 * link with `aria-current="page"`. An app places it after its content at compact widths and beside it at wide
 * widths. The app owns the destination views and their state.
 * @class Neo.toolbar.Navigation
 * @extends Neo.toolbar.Base
 */
class Navigation extends Toolbar {
    static config = {
        /**
         * @member {String} className='Neo.toolbar.Navigation'
         * @protected
         */
        className: 'Neo.toolbar.Navigation',
        /**
         * @member {String} ntype='navigation-toolbar'
         * @protected
         */
        ntype: 'navigation-toolbar',
        /**
         * The navigation landmark's accessible name.
         * @member {String|null} ariaLabel_='Destinations'
         * @reactive
         */
        ariaLabel_: 'Destinations',
        /**
         * @member {String[]} baseCls=['neo-toolbar-navigation','neo-toolbar']
         */
        baseCls: ['neo-toolbar-navigation', 'neo-toolbar'],
        /**
         * @member {Object} itemDefaults
         * @reactive
         */
        itemDefaults: {
            ntype       : 'button',
            flex        : 'var(--neo-navigation-toolbar-item-flex)',
            iconPosition: 'top',
            ui          : 'tertiary'
        },
        /**
         * @member {Boolean} keyboardNavigation=true
         */
        keyboardNavigation: true,
        /**
         * The CSS controls the direction in the owning document.
         * @member {Object} layout
         * @reactive
         */
        layout: {ntype: 'flexbox', align: 'stretch', direction: null},
        /**
         * @member {String} role='navigation'
         */
        role: 'navigation',
        /**
         * @member {String} tag='nav'
         * @reactive
         */
        tag: 'nav'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.on('insert', this.syncCurrentDestination, this);
        HashHistory.on('change', this.onRouteChange, this)
    }

    /**
     * @summary Projects the accessible name on the native navigation element.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAriaLabel(value, oldValue) {
        this.changeVdomRootKey('aria-label', value)
    }

    /**
     * @summary Refreshes the current destination if the bar moves to another window.
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        this.isConstructed && this.syncCurrentDestination()
    }

    /**
     * @summary Creates the toolbar items, then projects the initial route even when it was resolved before mount.
     * @protected
     */
    createItems() {
        super.createItems();
        this.syncCurrentDestination()
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        HashHistory.un('change', this.onRouteChange, this);
        super.destroy(...args)
    }

    /**
     * @summary Uses the native links as focus stops. Navigation never writes an active descendant onto the landmark.
     * @returns {Object}
     * @protected
     */
    getNavigatorConfig() {
        const config = super.getNavigatorConfig();

        return {...config, focusOnly: true, selector: `${config.selector}:not([aria-disabled="true"])`}
    }

    /**
     * @summary Reads a destination the same way as the owning window's hash or pathname router.
     * @param {String|null|undefined} route
     * @returns {String|null}
     * @protected
     */
    getRouteKey(route) {
        if (typeof route !== 'string' || !route) return null;

        const config = Neo.windowConfigs?.[this.windowId] || Neo.config,
              path   = route.replace(/^#/, '');

        return config.routerMode === 'pathname' ? normalizeRoutePathname(path.split(/[?#]/, 1)[0]) : path || null
    }

    /**
     * @summary Updates the marker only for this bar's owning browser window.
     * @param {Object} entry
     * @protected
     */
    onRouteChange(entry) {
        if (entry?.windowId === this.windowId) {
            this.syncCurrentDestination()
        }
    }

    /**
     * @summary Marks the first matching destination. An unrelated route clears the current marker.
     * @protected
     */
    syncCurrentDestination() {
        const me           = this,
              {windowId}   = me,
              route        = windowId != null ? me.getRouteKey(HashHistory.first(windowId)?.hashString) : null,
              destinations = me.items.filter(item => item?.route && 'ariaCurrent' in item),
              current      = route && destinations.find(item => me.getRouteKey(item.route) === route);

        destinations.forEach(item => {item.ariaCurrent = item === current ? 'page' : null})
    }
}

export default Neo.setupClass(Navigation);
