import Base                                                           from '../core/Base.mjs';
import Observable                                                     from '../core/Observable.mjs';
import {isManagedRoutePath, normalizeRoutePathname, parseQueryParams} from '../util/Route.mjs';
import StringUtil                                                     from '../util/String.mjs';
import TouchDomEvents                                                 from './mixin/TouchDomEvents.mjs';

const globalDomEvents = [
    {name: 'change',      handler: 'onChange'},
    {name: 'click',       handler: 'onClick'},
    {name: 'contextmenu', handler: 'onContextMenu'},
    {name: 'dblclick',    handler: 'onDoubleClick'},
    {name: 'focusin',     handler: 'onFocusIn'},
    {name: 'focusout',    handler: 'onFocusOut'},
    {name: 'input',       handler: 'onChange'},
    {name: 'keydown',     handler: 'onKeyDown'},
    {name: 'keyup',       handler: 'onKeyUp'},
    {name: 'mousedown',   handler: 'onMouseDown'},
    {name: 'mouseenter',  handler: 'onMouseEnter', options: {capture: true}},
    {name: 'mouseleave',  handler: 'onMouseLeave', options: {capture: true}},
    {name: 'mouseup',     handler: 'onMouseUp'},
    {name: 'scroll',      handler: 'onScroll',     options: {capture: true}},
    {name: 'wheel',       handler: 'onWheel',      options: {passive: true}}
];

// Will get applied to the document.body in case Neo.config.hasTouchEvents === true
const touchEvents = [
    {name: 'touchcancel', handler: 'onTouchCancel'},
    {name: 'touchend',    handler: 'onTouchEnd'},
    {name: 'touchenter',  handler: 'onTouchEnter'},
    {name: 'touchleave',  handler: 'onTouchLeave'},
    {name: 'touchmove',   handler: 'onTouchMove', options: {passive: false}},
    {name: 'touchstart',  handler: 'onTouchStart'}
];

// wheel events fire very often, so we limit the targets to avoid unnecessary post messages from main to the app worker
const globalWheelTargets = [
    'neo-c-m-scrollcontainer',
    'neo-c-w-scrollcontainer',
    'neo-calendar-yearcomponent',
    'neo-circle-component',
    'neo-dateselector',
    'neo-gallery',
    'neo-helix'
];

// separated from globalWheelTargets => performance
// buffer in ms
const globalWheelTargetsBuffer = {
    'neo-c-m-scrollcontainer'   : 100,
    'neo-c-w-scrollcontainer'   : 100,
    'neo-calendar-yearcomponent': 300,
    'neo-dateselector'          : 300
};

// separated from globalWheelTargets => performance
const globalWheelTargetsKeepEvent = [
    'neo-c-m-scrollcontainer',
    'neo-c-w-scrollcontainer'
];

const lastWheelEvent = {
    date  : null,
    target: null
};

const
    disabledInputKeys         = {},
    preventClickTargets       = [],
    preventContextmenuTargets = [],
    preventDefaultKeys        = {};

/**
 * @class Neo.main.DomEvents
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 * @mixes Neo.main.mixin.TouchDomEvents
 * @singleton
 */
class DomEvents extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.main.DomEvents'
         * @protected
         */
        className: 'Neo.main.DomEvents',
        /**
         * todo: conditional dynamic import once the build processes can handle it
         * @member {Array} mixins=[TouchDomEvents]
         */
        mixins: [TouchDomEvents],
        /**
         * @member {boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'addDomListener',
                'registerDisabledInputChars',
                'registerPreventDefaultKeys',
                'registerPreventDefaultTargets',
                'unregisterDisabledInputChars',
                'unregisterPreventDefaultKeys'
            ]
        }
    }

    /**
     * @member {Object|null} lastMouseMoveData=null
     */
    lastMouseMoveData = null
    /**
     *
     * @member {Object} touch
     */
    lastTouch = null
    /**
     * @member {Number|null} mouseMoveReqId=null
     */
    mouseMoveReqId = null

    /**
     * @member {Boolean} #departed=false Whether this window already told the SharedWorkers it leaves
     */
    #departed = false
    /**
     * Native font subscription owned by this document.
     * @member {Object|null} #fontEvents=null
     */
    #fontEvents = null
    /**
     * @member {String} #lastFragment=''
     */
    #lastFragment = ''
    /**
     * The route the App worker last received, in `'pathname'` mode
     * @member {String|null} #lastRoute=null
     */
    #lastRoute = null

    /**
     * @summary Registers main-thread DOM and native font events.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        document.addEventListener('DOMContentLoaded',  me.onDomContentLoaded .bind(me));
        document.addEventListener('selectionchange',   me.onSelectionChange  .bind(me));
        document.addEventListener('visibilitychange',  me.onVisibilitychange .bind(me));
        window  .addEventListener('orientationchange', me.onOrientationChange.bind(me));
        window  .addEventListener('hashchange',        me.onHashChange       .bind(me));
        window  .addEventListener('blur',              me.onWindowBlur       .bind(me));
        window  .addEventListener('focus',             me.onWindowFocus      .bind(me));

        if (Neo.config.useSharedWorkers) {
            window.addEventListener('beforeunload', me.onBeforeUnload.bind(me));
            window.addEventListener('pagehide',     me.onPageHide    .bind(me))
        }

        // The History API fires no hashchange: Back and Forward report a 'pathname' route as popstate. A #/… URL
        // from hash mode becomes its path before any worker reads the route.
        if (Neo.config.routerMode === 'pathname') {
            window.addEventListener('popstate', me.sendRoute.bind(me));
            me.upgradeHashRoute(true);
            me.#lastRoute    = me.getRouteKey();
            me.#lastFragment = location.hash?.length > 1 ? location.hash.substring(1) : ''
        }

        // Unsupported browsers keep the measurements made with their currently available fonts.
        const fonts = document.fonts;

        if (typeof fonts?.addEventListener === 'function' && typeof fonts.removeEventListener === 'function') {
            const listener = me.onFontChange.bind(me);

            me.#fontEvents = {fonts, listener};
            fonts.addEventListener('loadingdone',  listener);
            fonts.addEventListener('loadingerror', listener)
        }
    }

    /**
     * @summary Releases the native font listeners with their main-thread owner.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        if (me.#fontEvents) {
            const {fonts, listener} = me.#fontEvents;

            fonts.removeEventListener('loadingdone',  listener);
            fonts.removeEventListener('loadingerror', listener);
            me.#fontEvents = null
        }

        super.destroy(...args)
    }

    /**
     * @param {Object} data
     */
    addDomListener(data) {
        let me       = this,
            i        = 0,
            len      = data.events.length,
            failedId = null,
            event, id, targetNode;

        for (; i < len; i++) {
            event = data.events[i];

            if (!me[event.handler]) {
                me[event.handler] = Neo.emptyFn
            }

            id = event.vnodeId || data.vnodeId;

            if (id === 'document.body') {
                targetNode = document.body
            } else if (Neo.config.useDomIds) {
                targetNode = document.getElementById(id)
            } else {
                targetNode = document.querySelector(`[data-neo-id='${id}']`)
            }

            if (targetNode) {
                targetNode.addEventListener(event.name, me[event.handler].bind(me), event.options)
            } else {
                failedId = id
            }
        }

        if (failedId && Neo.config.environment === 'development') {
            console.warn('DomEvents:addDomListener() => target node not found:', failedId)
        }

        Neo.worker.Manager.sendMessage(data.origin, {
            action : 'reply',
            data,
            replyId: data.id,
            success: !failedId
        })
    }

    /**
     *
     */
    addGlobalDomListeners() {
        let me = this;

        [...globalDomEvents].concat(Neo.config.hasTouchEvents ? touchEvents : []).forEach(event => {
            document.body.addEventListener(event.name, me[event.handler].bind(me), event.options)
        });
    }

    /**
     * @summary Forwards local DOM events to the App Worker unless an active `Clipboard` addon registration owns the gesture.
     * @param {Event} event
     */
    domEventListener(event) {
        if (
            (event.type === 'copy' || event.type === 'cut' || event.type === 'paste') &&
            Neo.main.addon?.Clipboard?.claimsEvent?.(event)
        ) {
            return
        }

        let me       = this,
            {target} = event,

            config = {
                action   : 'domEvent',
                eventName: event.type,

                data: {
                    ...me.getEventData(event),
                    id   : target.id,
                    value: target.value
                }
            };

        switch (event.type) {
            case 'mousemove':
                Object.assign(config.data, me.getMouseEventData(event));
                break
            default:
                if (event.cancelable) {
                    event.preventDefault()
                }
                break
        }

        Neo.worker.Manager.sendMessage('app', config)
    }

    /**
     *
     * @param {HTMLElement} node
     * @returns {Object}
     */
    geAriaAttributes(node) {
        let ariaAttributes = {},
            {attributes}   = node,
            i              = 0,
            len            = attributes?.length || 0,
            attribute;

        for (; i < len; i++) {
            attribute = attributes[i];

            if (attribute.name.startsWith('aria-')) {
                ariaAttributes[attribute.name.substring(5)] = attribute.value
            }
        }

        return ariaAttributes
    }

    /**
     * Returns the distance between two points
     * @param  {Number} x1 The X position of the first point
     * @param  {Number} y1 The Y position of the first point
     * @param  {Number} x2 The X position of the second point
     * @param  {Number} y2 The Y position of the second point
     * @returns {Number}
     */
    getDistance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    }

    /**
     * @param {Event} event
     * @returns {Object}
     */
    getEventData(event) {
        let path = event.composedPath();

        if (path.length < 1) {
            // our draggable implementation will generate paths, so we do need to check for them
            path = event.path || [];
        }

        const result = {
            path     : path.map(e => this.getTargetData(e, event.type, false)),
            target   : this.getTargetData(event.target, event.type, true),
            timeStamp: event.timeStamp,
            type     : event.type,
        };

        if (event.relatedTarget) {
            result.relatedTarget = this.getTargetData(event.relatedTarget, event.type, false)
        }

        return result
    }

    /**
     * @param {KeyboardEvent} event
     * @returns {Object}
     */
    getKeyboardEventData(event) {
        let {altKey, code, ctrlKey, key, keyCode, metaKey, shiftKey} = event;

        return {
            ...this.getEventData(event),
            altKey,
            code,
            ctrlKey,
            key,
            keyCode,
            metaKey,
            shiftKey
        }
    }

    /**
     * `pointerType` names the pointer behind a `PointerEvent` (`'mouse'`, `'pen'` or `'touch'`), as a click is in
     * current Chromium. A `MouseEvent` (a dblclick, a mousedown, a click in a browser that dispatches one) leaves it
     * `undefined`: no signal, which a consumer answers from the device (`Neo.config.hasTouchEvents`), never as a mouse.
     * @param {MouseEvent|PointerEvent} event
     * @returns {Object}
     */
    getMouseEventData(event) {
        let {altKey, button, buttons, clientX, clientY, ctrlKey, detail, metaKey, offsetX, offsetY, pageX, pageY, pointerType, screenX, screenY, shiftKey} = event;

        return {
            ...this.getEventData(event),
            altKey,
            button,
            buttons,
            clientX,
            clientY,
            ctrlKey,
            detail,
            metaKey,
            offsetX,
            offsetY,
            pageX,
            pageY,
            pointerType,
            screenX,
            screenY,
            shiftKey
        }
    }

    /**
     * @param {Element} element
     * @returns {Element[]}
     */
    getPathFromElement(element) {
        let path = [];

        if (element) {
            path.push(element);

            while (element.parentNode) {
                path.push(element.parentNode);
                element = element.parentNode
            }
        }

        return path
    }

    /**
     * @summary The current route: the hash in `'hash'` mode. In `'pathname'` mode, the path after
     * `Neo.config.routerBasePath`, with the root normalized to `'/'`. The page's search stays out of the route in
     * both modes, so a campaign query leaves a controller's route match alone.
     * @returns {String}
     */
    getRoute() {
        let {routerBasePath, routerMode} = Neo.config;

        if (routerMode !== 'pathname') {
            return location.hash.substring(1)
        }

        return normalizeRoutePathname(location.pathname, routerBasePath)
    }

    /**
     * @summary The current route in the shape a worker receives as `Neo.config.hash`.
     * @param {Number|String} windowId
     * @returns {Object|null} null without a route
     */
    getRouteConfig(windowId) {
        let me         = this,
            hashString = me.getRoute();

        if (!hashString) {
            return null
        }

        if (Neo.config.routerMode !== 'pathname') {
            return {
                hash: me.parseHash(hashString),
                hashString,
                windowId
            }
        }

        const
            fragment = location.hash?.length > 1 ? location.hash.substring(1) : undefined,
            search   = location.search?.startsWith('?') ? location.search.substring(1) : (location.search || ''),
            query    = parseQueryParams(search);

        return {
            ...(fragment ? {fragment} : {}),
            hash: me.parseQueryValues(query),
            hashString,
            query,
            search,
            windowId
        }
    }

    /**
     * @summary Returns the deduplication key (`pathname + '?' + search`) for `'pathname'` mode transitions.
     * @returns {String}
     */
    getRouteKey() {
        const search = location.search?.startsWith('?') ? location.search.substring(1) : (location.search || '');

        return `${this.getRoute()}?${search}`
    }

    /**
     * @param {Object[]} path
     * @param {HTMLElement} target
     * @param {String} [eventName]
     * @returns {Object[]}
     */
    getSelectionPath(path, target, eventName) {
        if (target.parentNode && target.id.split('__').length > 1) {
            path = this.getSelectionPath(path, target.parentNode, eventName);
        }

        path.push(this.getTargetData(target, eventName, false));

        return path
    }

    /**
     * @param {HTMLElement} node
     * @param {String} [eventName]
     * @param {Boolean} [isTarget=true]
     * @returns {Object}
     */
    getTargetData(node, eventName, isTarget=true) {
        // Fast path: eliminate layout thrashing on continuous events.
        // We skip bounding rect and layout dimensions for scroll & wheel.
        let skipLayout = eventName === 'scroll' || eventName === 'wheel',
            r          = !skipLayout && node.getBoundingClientRect?.(),
            rect       = r && this.parseDomRect(r) || undefined;

        return {
            aria             : this.geAriaAttributes(node),
            checked          : node.checked,
            childElementCount: node.childElementCount,
            clientHeight     : skipLayout ? undefined : node.clientHeight,
            clientLeft       : node.clientLeft,
            clientTop        : node.clientTop,
            clientWidth      : skipLayout ? undefined : node.clientWidth,
            cls              : node.classList ? [...node.classList] : [],
            data             : {...node.dataset},
            draggable        : node.draggable,
            hidden           : node.hidden,
            id               : Neo.config.useDomIds ? node.id : node.dataset?.['neoId'],
            inert            : node.inert,
            isConnected      : node.isConnected,
            isContentEditable: node.isContentEditable,
            nodeType         : node.nodeType,
            offsetHeight     : skipLayout ? undefined : node.offsetHeight,
            offsetLeft       : node.offsetLeft,
            offsetTop        : node.offsetTop,
            offsetWidth      : skipLayout ? undefined : node.offsetWidth,
            rect,
            role             : node.role,
            scrollHeight     : skipLayout ? undefined : node.scrollHeight,
            scrollLeft       : skipLayout && !isTarget ? undefined : node.scrollLeft,
            scrollTop        : skipLayout && !isTarget ? undefined : node.scrollTop,
            scrollWidth      : skipLayout ? undefined : node.scrollWidth,
            style            : node.style?.cssText,
            tabIndex         : node.getAttribute?.('tabindex') ? node.tabIndex : null,
            tagName          : node.tagName?.toLowerCase()
        }
    }

    /**
     * Returns the first touch event found in touches or changedTouches of a TouchEvent
     * @param {TouchEvent} event
     * @returns {Touch}
     */
    getTouchCoords(event) {
        let {touches, changedTouches} = event;
        return touches?.[0] || changedTouches?.[0]
    }

    /**
     * @summary Intercepts unmodified primary clicks on internal links in `'pathname'` mode so routes move through the
     * History API without reloading the document or workers, while preserving modified clicks, `target`, `download`,
     * static assets, and `Neo.config.routerIgnorePaths`. For managed anchors, the anchor's `href` is the route.
     * @param {MouseEvent} event
     * @returns {Boolean} true when the click was handled and its default browser navigation must be prevented
     */
    handlePathnameLinkClick(event) {
        if (
            Neo.config.routerMode !== 'pathname' ||
            event.defaultPrevented ||
            (event.button ?? 0) !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        ) {
            return false
        }

        let me      = this,
            path    = event.composedPath ? event.composedPath() : me.getPathFromElement(event.target),
            anchor  = path.find(node => node?.tagName === 'A' && node.hasAttribute('href')),
            rawHref = anchor?.getAttribute('href'),
            rel, target, url;

        if (!anchor || !rawHref || anchor.hasAttribute('download')) {
            return false
        }

        target = anchor.getAttribute('target') || anchor.target;
        rel    = anchor.getAttribute('rel');

        if (target && target.toLowerCase() !== '_self' || rel && /\bexternal\b/i.test(rel)) {
            return false
        }

        if (rawHref.startsWith('#/')) {
            me.setRoute(rawHref);
            return true
        }

        let {origin} = location,
            base     = document.baseURI || `${origin}${location.pathname}${location.search}`;

        try {
            url = new URL(anchor.href || rawHref, base)
        } catch {
            return false
        }

        if (rawHref.startsWith('#')) {
            if (url.pathname !== location.pathname || url.search !== location.search) {
                if (rawHref.length > 1 && location.hash !== rawHref) {
                    location.hash = rawHref
                }

                if (rawHref.length > 1) {
                    try {
                        document.getElementById(decodeURIComponent(rawHref.substring(1)))?.scrollIntoView()
                    } catch {
                        // Malformed URI component in fragment stays non-fatal
                    }
                }

                return true
            }

            return false
        }

        if (url.protocol !== 'http:' && url.protocol !== 'https:' || url.origin !== origin) {
            return false
        }

        if (!me.isManagedRoutePath(url.pathname)) {
            return false
        }

        const routePath = normalizeRoutePathname(url.pathname, Neo.config.routerBasePath);

        me.setRoute(routePath + url.search + url.hash);
        return true
    }

    /**
     * @summary Checks whether a same-origin URL pathname belongs to the `'pathname'` router rather than a static file
     * or an excluded prefix/pattern in `Neo.config.routerIgnorePaths`.
     * @param {String} pathname
     * @returns {Boolean}
     */
    isManagedRoutePath(pathname) {
        let {routerBasePath = '', routerIgnorePaths = []} = Neo.config;

        return isManagedRoutePath(pathname, routerIgnorePaths, routerBasePath)
    }

    /**
     * Only in use if Neo.config.useSharedWorkers = true. Disconnects each app this window knows of; a window that knows
     * none yet — it unloads before its first `registerAppName` arrives, while the workers already hold its port —
     * disconnects as a whole.
     * @param {Object} event
     */
    onBeforeUnload(event) {
        let {Manager}            = Neo.worker,
            {appNames, windowId} = Manager;

        if (this.#departed) return;
        this.#departed = true;

        if (appNames.length) {
            appNames.forEach(appName => {
                Manager.broadcast({action: 'disconnect', appName, windowId})
            })
        } else {
            Manager.broadcast({action: 'disconnect', windowId})
        }
    }

    /**
     * @param {InputEvent} event
     */
    onChange(event) {
        let me       = this,
            {target} = event,

            data = {
                ...me.getEventData(event),
                valid: target.checkValidity?.(),
                value: target.value
            };

        // input and change events can pass a FileList for input type file
        if (target.files) {
            data.files = target.files
        }

        me.sendMessageToApp(data)
    }

    /**
     * @param {MouseEvent} event
     */
    onClick(event) {
        let me = this;

        me.flushPendingMouseMove();
        me.sendMessageToApp(me.getMouseEventData(event));

        if (me.testPathInclusion(event, preventClickTargets) || me.handlePathnameLinkClick(event)) {
            event.preventDefault()
        }
    }

    /**
     * @param {MouseEvent} event
     */
    onContextMenu(event) {
        let me = this;

        me.flushPendingMouseMove();
        me.sendMessageToApp(me.getMouseEventData(event));

        if (event.ctrlKey || !event.target?.closest?.('.neo-form-field, input, textarea, [contenteditable="true"]') &&
            me.testPathInclusion(event, preventContextmenuTargets)) {
            event.preventDefault()
        }
    }

    /**
     *
     */
    onDomContentLoaded() {
        this.addGlobalDomListeners();
        this.fire('domContentLoaded')
    }

    /**
     * @param {MouseEvent} event
     */
    onDoubleClick(event) {
        let me = this;

        me.flushPendingMouseMove();
        me.sendMessageToApp(me.getMouseEventData(event));

        me.testPathInclusion(event, preventClickTargets) && event.preventDefault()
    }

    /**
     * @param {FocusEvent} event
     */
    onFocusIn(event) {
        this.sendMessageToApp(this.getEventData(event))
    }

    /**
     * A focusout raised while `Neo.main.DeltaUpdates` removes a node carries that node's id as
     * `removedNodeId`, so the app worker can tell the leave of a removed mount from a leave to elsewhere.
     * @param {FocusEvent} event
     */
    onFocusOut(event) {
        let data             = this.getEventData(event),
            {removingNodeId} = Neo.main.DeltaUpdates;

        if (removingNodeId) {
            data.removedNodeId = removingNodeId
        }

        this.sendMessageToApp(data)
    }

    /**
     * @summary Forwards settled iframe focus after an instance-owned task deferral.
     * Focus crossing into a nested document is invisible to the focus events this document forwards:
     * the element losing focus fires `focusout` with no `relatedTarget`, the `<iframe>` element that
     * now holds it fires no `focusin`, and only the window's `blur` says anything happened. Without a
     * `focusin` the app worker's focus manager reads the `focusout` as a leave after its gap — a
     * click into an iframe INSIDE a focus-holding subtree looks like leaving it. This forwards the
     * frame element as the focus target, so the worker sees a move to the component that hosts the
     * frame. `activeElement` settles after `blur`, hence the deferral; a blur that leaves the
     * document altogether (another window) has no iframe at the active element and forwards nothing.
     */
    onWindowBlur() {
        let me = this;

        me.timeout(0).then(() => {
            let node = document.activeElement,
                path = [];

            if (node?.tagName !== 'IFRAME') {
                return
            }

            for (let current = node; current; current = current.parentNode) {
                path.push(current)
            }

            me.sendMessageToApp(me.getEventData({
                composedPath: () => path,
                target      : node,
                timeStamp   : performance.now(),
                type        : 'focusin'
            }))
        })
    }

    /**
     * Tells the App Worker that this window regained focus, e.g. a user coming back from another application
     */
    onWindowFocus() {
        Neo.worker.Manager.sendMessage('app', {
            action: 'windowFocus',
            data  : {windowId: Neo.worker.Manager.windowId}
        })
    }

    /**
     * @summary Forwards a hash change to the App worker. In `'pathname'` mode a `#/…` link or bookmark upgrades
     * into the path first, while in-page `#fragment` transitions forward `fragment` (or its removal) on the route.
     */
    onHashChange() {
        let me = this;

        if (Neo.config.routerMode === 'pathname') {
            me.upgradeHashRoute()
        }

        me.sendRoute()
    }

    /**
     * @summary Preserves native input defaults, including an open select's focused option, inside selection regions.
     * @param {KeyboardEvent} event
     */
    onKeyDown(event) {
        let me        = this,
            {target}  = event,
            {tagName} = target,
            isInput   = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || !!target.closest?.('select');

        if (isInput && disabledInputKeys[target.id]?.includes(event.key)) {
            event.preventDefault()
        } else {
            me.sendMessageToApp(me.getKeyboardEventData(event));

            if (
                isInput &&
                event.key === 'Tab' &&
                me.testPathInclusion(event, ['neo-grid-editor', 'neo-table-editor'], true)
            ) {
                event.preventDefault()
            }

            // A picker field opens its own picker on Alt+ArrowDown; a date or time input would open the browser's too
            if (isInput && event.altKey && event.key === 'ArrowDown' && me.testPathInclusion(event, ['neo-pickerfield'])) {
                event.preventDefault()
            }

            // A key the App Worker handles for this exact node: it still gets the event, only the default is gone.
            // The worker cannot cancel a default after the fact, so it registers the node before the key arrives.
            // When the target is `document.body`, callers register against `'document.body'` because body often has no id.
            const preventId = target === document.body ? (target.id || 'document.body') : target.id;

            if (preventDefaultKeys[preventId]?.includes(event.key)) {
                event.preventDefault()
            }

            // A grid editor sits in grid.View's scroll area, and a key its input does not consume scrolls the View,
            // recycling the pooled row the editor is embodied in. PageUp/PageDown never move a single-line caret;
            // Home/End scroll under macOS key bindings and move the caret everywhere else. Bindings follow the host
            // OS, which `navigator.platform` reports even where the user agent is emulated.
            if (
                tagName === 'INPUT' &&
                (['PageDown', 'PageUp'].includes(event.key) || ['End', 'Home'].includes(event.key) && /Mac/.test(navigator.platform)) &&
                me.testPathInclusion(event, ['neo-grid-editor'])
            ) {
                event.preventDefault()
            }

            // Arrows drive roving / efficiency focus within a neo-selection region and may not scroll the
            // page. The app still receives the keydown (sendMessageToApp above) — this only suppresses the
            // browser's scroll default. Space is intentionally NOT suppressed here: native interactive
            // targets (buttons, selects, links, contenteditable) own Enter/Space activation.
            if (
                !isInput &&
                ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key) &&
                me.testPathInclusion(event, ['neo-selection', 'neo-accordion-header'], true)
            ) {
                event.preventDefault()
            }

            // A menu item, accordion header or role-button trigger/nav-button is not a native <button>: Space activates it, like Enter, and scrolls nothing
            if (!isInput && event.key === ' ' && me.testPathInclusion(event, ['neo-menu-list', 'neo-accordion-header', 'neo-field-trigger', 'neo-nav-button'])) {
                event.preventDefault()
            }
        }
    }

    /**
     * @param {KeyboardEvent} event
     */
    onKeyUp(event) {
        this.sendMessageToApp(this.getKeyboardEventData(event))
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseDown(event) {
        this.flushPendingMouseMove();
        this.sendMessageToApp(this.getMouseEventData(event))
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseEnter(event) {
        let me       = this,
            appEvent = {...me.getMouseEventData(event), fromElementId: event.fromElement?.id || null, toElementId: event.toElement?.id || null};

        me.flushPendingMouseMove();
        me.sendMessageToApp(appEvent);
        me.fire('mouseEnter', appEvent)
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseLeave(event) {
        let me       = this,
            appEvent = {...me.getMouseEventData(event), fromElementId: event.fromElement?.id || null, toElementId: event.toElement?.id || null};

        me.flushPendingMouseMove();
        me.sendMessageToApp(appEvent);
        me.fire('mouseLeave', appEvent)
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseMove(event) {
        let me = this;

        me.lastMouseMoveData = me.getMouseEventData(event);

        if (!me.mouseMoveReqId) {
            me.mouseMoveReqId = requestAnimationFrame(me.flushMouseMove.bind(me))
        }
    }

    /**
     *
     */
    flushMouseMove() {
        let me = this;

        if (me.lastMouseMoveData) {
            me.sendMessageToApp(me.lastMouseMoveData);
            me.lastMouseMoveData = null
        }

        me.mouseMoveReqId = null
    }

    /**
     * Sends a coalesced move that is still waiting for its frame, ahead of the mouse event that calls this. Without
     * it a press overtakes the move and reaches the app worker as press-then-move, so a consumer deriving movement
     * from the last reported position (a canvas's mouse state) reads the whole jump as a held button's movement.
     * Call it only on the path that sends: an event the main thread keeps has no order to restore, and flushing for
     * it would spend the frame's one move.
     */
    flushPendingMouseMove() {
        let me = this;

        if (me.mouseMoveReqId) {
            cancelAnimationFrame(me.mouseMoveReqId);
            me.flushMouseMove()
        }
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseUp(event) {
        this.flushPendingMouseMove();
        this.sendMessageToApp(this.getMouseEventData(event))
    }

    /**
     * @param {Event} event
     */
    onOrientationChange(event) {
        let {orientation} = screen,
            {angle, type} = orientation,
            layout        = angle === 0 || angle === 180 ? 'portrait' : 'landscape';

        Neo.worker.Manager.sendMessage('app', {
            action: 'orientationChange',
            data  : {angle, layout, type}
        })
    }

    /**
     * Only in use if Neo.config.useSharedWorkers = true. A close can skip `beforeunload` (an automation's target
     * close fires only `pagehide` and `unload`), so the window departs here too, unless it enters the bfcache.
     * @param {PageTransitionEvent} event
     */
    onPageHide(event) {
        event.persisted || this.onBeforeUnload(event)
    }

    /**
     * @param {Event} event
     */
    onScroll(event) {
        let me = this,
            {firstTouch, lastTouch} = me,
            {clientHeight, clientWidth, scrollLeft, scrollTop} = event.target,
            data;

        event.preventDefault();

        data = {
            ...me.getEventData(event),
            clientHeight,
            clientWidth,
            scrollLeft,
            scrollTop
        };

        if (firstTouch) {
            data.touches = {
                firstTouch: {clientX: firstTouch.clientX, clientY: firstTouch.clientY},
                lastTouch : {clientX: lastTouch .clientX, clientY: lastTouch .clientY}
            }
        }

        me.sendMessageToApp(data)
    }

    /**
     * @param {Event} event
     */
    onSelectionChange(event) {
        let me       = this,
            {target} = event,
            element  = target.type ? target : target.activeElement,
            path, targetData;

        if (target.tagName === 'BODY') {
            return
        }

        path       = me.getSelectionPath([], element);
        targetData = me.getTargetData(element);

        me.sendMessageToApp({
            path,
            selection: {direction: element.selectionDirection, end: element.selectionEnd, start: element.selectionStart},
            target   : targetData,
            timeStamp: event.timeStamp,
            type     : 'selectionchange'
        })
    }

    /**
     * @param {Event} event
     */
    onVisibilitychange(event) {
        Neo.worker.Manager.sendMessage('app', {
            action: 'visibilityChange',
            data  : {
                hidden         : document.hidden,
                visibilityState: document.visibilityState,
                windowId       : Neo.worker.Manager.windowId
            }
        })
    }

    /**
     * @summary Announces a completed or failed font load in this document's current window.
     * @protected
     */
    onFontChange() {
        const binding = this.#fontEvents;

        if (binding && !this.isDestroyed) {
            Neo.worker.Manager.sendMessage('app', {
                action: 'fontChange',
                data  : {windowId: Neo.worker.Manager.windowId}
            })
        }
    }

    /**
     * A wheel listener a component mounted on its own node (`wheel: {local: true}`) fires with that node as the
     * `currentTarget`. The global target list does not know such a node, so the node itself is the target; the body
     * listener has no local target.
     * @param {WheelEvent} event
     * @returns {Object|Boolean} `{cls: null, node}` for a local listener, otherwise false
     */
    getLocalWheelTarget(event) {
        let node = event.currentTarget;

        return node && node !== document.body ? {cls: null, node} : false
    }

    /**
     * Wheel events reach the app worker for the global target list, and for any node a component listens on
     * locally (`getLocalWheelTarget`); everything else stays on the main thread.
     * @param {WheelEvent} event
     */
    onWheel(event) {
        let target        = this.testPathInclusion(event, globalWheelTargets) || this.getLocalWheelTarget(event),
            preventUpdate = false,
            targetCls;

        if (target) {
            targetCls = target.cls;

            if (globalWheelTargetsBuffer[target.cls]) {
                let date = new Date();

                if (lastWheelEvent.date && lastWheelEvent.target === targetCls && date - lastWheelEvent.date < globalWheelTargetsBuffer[targetCls]) {
                    preventUpdate = true
                } else {
                    Object.assign(lastWheelEvent, {
                        date,
                        target: targetCls
                    })
                }
            }

            if (!preventUpdate) {
                // A wheel event is a mouse event: the mouse serializer carries the pointer position, the held
                // buttons and the modifiers (a zooming consumer zooms towards the pointer, tells the trackpad
                // pinch — ctrl + wheel on macOS — from a scroll, and keeps a drag's buttons through a wheel tick);
                // the deltas and the target's scroll geometry ride beside them.
                let {deltaMode, deltaX, deltaY, deltaZ} = event;

                this.flushPendingMouseMove();
                this.sendMessageToApp({
                    ...this.getMouseEventData(event),
                    clientHeight: target.node.clientHeight,
                    clientWidth : target.node.clientWidth,
                    deltaMode,
                    deltaX,
                    deltaY,
                    deltaZ,
                    scrollLeft  : target.node.scrollLeft,
                    scrollTop   : target.node.scrollTop
                })
            }

            if (!globalWheelTargetsKeepEvent.includes(targetCls)) {
                if (event.currentTarget !== document.body) {
                    event.preventDefault();
                    event.stopPropagation()
                }
            }
        }
    }

    /**
     * DOMRects are not spreadable => {...DOMRect} => {}
     * @param {DOMRect} rect
     * @returns {Object}
     */
    parseDomRect(rect) {
        let {bottom, height, left, right, top, width, x, y} = rect;

        return {bottom, height, left, right, top, width, x, y}
    }

    /**
     * @summary Parses `&`-delimited hash tokens into typed values and `key[]` arrays, skipping malformed URI entries.
     * @param {String} str
     * @returns {Object}
     */
    parseHash(str) {
        if (str === '') {
            return {}
        }

        let pieces = str.split('&'),
            data   = {},
            eqIndex, i, key, value;

        for (i = 0; i < pieces.length; i++) {
            eqIndex = pieces[i].indexOf('=');

            try {
                if (eqIndex === -1) {
                    key   = decodeURIComponent(pieces[i]);
                    value = ''
                } else {
                    key   = decodeURIComponent(pieces[i].slice(0, eqIndex));
                    value = decodeURIComponent(pieces[i].slice(eqIndex + 1))
                }
            } catch {
                continue
            }

            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                continue
            }

            if (key.indexOf('[]') !== -1) {
                key = key.substring(0, key.indexOf('[]'));

                if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                    continue
                }

                if (typeof data[key] === 'undefined') {
                    data[key] = [];
                }

                data[key].push(this.parseValue(value))
            } else {
                data[key] = this.parseValue(value)
            }
        }

        return data
    }

    /**
     * @summary Converts parsed query string entries into typed scalar or array values matching `parseHash`.
     * @param {Object} query
     * @returns {Object}
     * @protected
     */
    parseQueryValues(query) {
        const result = {};

        for (const [key, value] of Object.entries(query)) {
            result[key] = Array.isArray(value)
                ? value.map(item => this.parseValue(item))
                : this.parseValue(value)
        }

        return result
    }

    /**
     * used by parseHash to convert tokens into boolean or number types if needed
     * @param {String} value
     * @returns {Boolean|Number|String}
     * @protected
     */
    parseValue(value) {
        if (value == parseInt(value)) {
            value = parseInt(value)
        } else if (value === 'false') {
            value = false
        } else if (value === 'true') {
            value = true
        }

        return value
    }

    /**
     * @param {Object} data
     * @param {String[]} data.chars
     * @param {String} data.id
     */
    registerDisabledInputChars(data) {
        disabledInputKeys[data.id] = data.chars
    }

    /**
     * Cancels the browser default of `keys` while the node `id` is the keydown target. Unlike
     * {@link #registerDisabledInputChars} the event is still delivered to the App Worker, and the node need not be
     * an input: this is for a key the worker handles itself on a focusable container, where letting the default
     * through as well — Tab leaving the component, say — would undo what the handler does.
     * @param {Object} data
     * @param {String} data.id
     * @param {String[]} data.keys `KeyboardEvent.key` values
     */
    registerPreventDefaultKeys(data) {
        preventDefaultKeys[data.id] = data.keys
    }

    /**
     * @param {Object} data
     * @param {Array|String} data.cls
     * @param {String} data.name
     */
    registerPreventDefaultTargets(data) {
        let preventArray;

        if (!Array.isArray(data.cls)) {
            data.cls = [data.cls];
        }

        switch (data.name) {
            case 'click':
                preventArray = preventClickTargets;
                break;
            case 'contextmenu':
                preventArray = preventContextmenuTargets;
                break;
        }

        data.cls.forEach(cls => {
            !preventArray.includes(cls) && preventArray.push(cls)
        })
    }

    /**
     * Sends the parsed event data to the app worker
     * @param {Object} data
     * @protected
     */
    sendMessageToApp(data) {
        Neo.worker.Manager.sendMessage('app', {
            action   : 'domEvent',
            eventName: data.type,
            data
        })
    }

    /**
     * @summary Sends the current route to the App worker. In `'pathname'` mode, deduplicates routes on
     * `pathname + '?' + search` and emits `fragmentChange` when only `#fragment` changes on the same route.
     */
    sendRoute() {
        let me         = this,
            {Manager}  = Neo.worker,
            hashString = me.getRoute();

        if (Neo.config.routerMode === 'pathname') {
            const
                currentFragment = location.hash?.length > 1 ? location.hash.substring(1) : '',
                fragment        = currentFragment || undefined,
                routeKey        = me.getRouteKey();

            if (routeKey === me.#lastRoute) {
                if (currentFragment !== me.#lastFragment) {
                    me.#lastFragment = currentFragment;

                    Manager.sendMessage('app', {
                        action: 'fragmentChange',
                        data  : {
                            appNames: Manager.appNames,
                            ...(fragment ? {fragment} : {}),
                            hashString,
                            windowId: Manager.windowId
                        }
                    })
                }
                return
            }

            me.#lastRoute    = routeKey;
            me.#lastFragment = currentFragment;

            const
                search = location.search?.startsWith('?') ? location.search.substring(1) : (location.search || ''),
                query  = parseQueryParams(search);

            Manager.sendMessage('app', {
                action: 'hashChange',
                data  : {
                    appNames: Manager.appNames,
                    ...(fragment ? {fragment} : {}),
                    hash    : me.parseQueryValues(query),
                    hashString,
                    query,
                    search,
                    windowId: Manager.windowId
                }
            });
            return
        }

        Manager.sendMessage('app', {
            action: 'hashChange',
            data  : {
                appNames: Manager.appNames,
                hash    : me.parseHash(hashString),
                hashString,
                windowId: Manager.windowId
            }
        })
    }

    /**
     * @summary Moves the route. `'hash'` mode assigns or replaces the hash; `'pathname'` mode pushes or replaces the path.
     * @param {String} route
     * @param {Boolean} [replace=false]
     */
    setRoute(route, replace=false) {
        let me = this;

        if (Neo.config.routerMode !== 'pathname') {
            if (replace) {
                const
                    cleanHash = route ? `#${route.replace(/^#/, '')}` : '',
                    nextUrl   = `${location.pathname}${location.search}${cleanHash}`;

                if (`${location.pathname}${location.search}${location.hash}` !== nextUrl) {
                    history.replaceState(history.state, '', nextUrl);
                    me.sendRoute()
                }
                return
            }

            location.hash = route;
            return
        }

        let [, path = '', query = '', anchor = ''] = route.replace(/^#/, '').match(/^([^?#]*)(?:\?([^#]*))?(#.*)?$/) || [],
            currentAnchor = location.hash?.length > 1 ? location.hash : '',
            currentSearch = location.search && location.search !== '?' ? location.search : '',
            currentKey, nextKey, nextUrl;

        // 'home' and '/home' are one route, and '' and '/' the root: one history entry each
        path       = ('/' + path.replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
        currentKey = me.getRoute() + currentSearch + currentAnchor;
        nextKey    = path + (query ? `?${query}` : '') + (anchor.length > 1 ? anchor : '');
        nextUrl    = Neo.config.routerBasePath + nextKey;

        if (nextKey !== currentKey) {
            history[replace ? 'replaceState' : 'pushState'](replace ? history.state : null, '', nextUrl);
            me.sendRoute()
        }
    }

    /**
     * hello <foo>world thorsten! 3 < 4 and 5 > 3
     * @param {String} value
     * @returns {String}
     */
    stripHtml(value) {
        let doc = new DOMParser().parseFromString(value, 'text/html');

        return doc.body.textContent || ''
    }

    /**
     * @param {Object} event
     * @param {Object} targetArray
     * @param {Object} testSubstring=false
     * @returns {Object|Boolean} target cls & node if found, false otherwise
     */
    testPathInclusion(event, targetArray, testSubstring=false) {
        let countTargets = targetArray.length,
            path         = event.path || event.composedPath(),
            i            = 0,
            len          = path.length,
            j, node;

        for (; i < len; i++) {
            node = path[i];

            for (j = 0; j < countTargets; j++) {
                if (
                    testSubstring && node.classList?.value?.includes(targetArray[j]) ||
                    node.classList?.contains(targetArray[j])
                ) {
                    return {cls: targetArray[j], node}
                }
            }
        }

        return false
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    unregisterDisabledInputChars(data) {
        delete disabledInputKeys[data.id]
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    unregisterPreventDefaultKeys(data) {
        delete preventDefaultKeys[data.id]
    }

    /**
     * @summary In `'pathname'` mode, moves a `#/…` route (a hash-mode link or bookmark) into the path, replacing the
     * current history entry. The URL is composed in order: the route's path, its query and the page's search, then
     * the route's own anchor (`#/learn/Intro#section`) as the fragment.
     * @param {Boolean} [keepSearch=false] true keeps the page's search, as a bookmark from hash mode carries it;
     * a link names a whole route
     * @returns {Boolean} true if the hash was a route
     */
    upgradeHashRoute(keepSearch=false) {
        let {hash, search} = location,
            [, route, query = '', anchor = ''] = hash.match(/^#(\/[^?#]*)(?:\?([^#]*))?(#.*)?$/) || [];

        if (Neo.config.routerMode !== 'pathname' || !route) {
            return false
        }

        route = route.replace(/\/+$/, '') || '/';
        query = [query, keepSearch ? search.substring(1) : ''].filter(Boolean).join('&');

        history.replaceState(history.state, '', Neo.config.routerBasePath + route + (query && `?${query}`) + anchor);
        return true
    }
}

export default Neo.setupClass(DomEvents);
