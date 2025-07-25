import Base           from '../core/Base.mjs';
import Observable     from '../core/Observable.mjs';
import StringUtil     from '../util/String.mjs';
import TouchDomEvents from './mixin/TouchDomEvents.mjs';

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
    {name: 'wheel',       handler: 'onWheel',      options: {passive: false}}
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
    preventContextmenuTargets = [];

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
                'registerPreventDefaultTargets',
                'unregisterDisabledInputChars'
            ]
        }
    }

    /**
     *
     * @member {Object} touch
     */
    lastTouch = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        document.addEventListener('DOMContentLoaded',  me.onDomContentLoaded .bind(me));
        document.addEventListener('selectionchange',   me.onSelectionChange  .bind(me));
        window  .addEventListener('orientationchange', me.onOrientationChange.bind(me));
        window  .addEventListener('hashchange',        me.onHashChange       .bind(me));

        if (Neo.config.useSharedWorkers) {
            window.addEventListener('beforeunload', me.onBeforeUnload.bind(me))
        }
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
                targetNode.addEventListener(event.name, me[event.handler].bind(me))
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
     * Local domEvent listener
     * @param {Event} event
     */
    domEventListener(event) {
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
                event.preventDefault();
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
            path = event.path;
        }

        const result = {
            path     : path.map(e => this.getTargetData(e)),
            target   : this.getTargetData(event.target),
            timeStamp: event.timeStamp,
            type     : event.type,
            data     : {...event.target.dataset}
        };

        if (event.relatedTarget) {
            result.relatedTarget = this.getTargetData(event.relatedTarget)
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
     * @param {MouseEvent} event
     * @returns {Object}
     */
    getMouseEventData(event) {
        let {altKey, clientX, clientY, ctrlKey, detail, metaKey, offsetX, offsetY, pageX, pageY, screenX, screenY, shiftKey} = event;

        return {
            ...this.getEventData(event),
            altKey,
            clientX,
            clientY,
            ctrlKey,
            detail,
            metaKey,
            offsetX,
            offsetY,
            pageX,
            pageY,
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
     * @param {Object[]} path
     * @param {HTMLElement} target
     * @returns {Object[]}
     */
    getSelectionPath(path, target) {
        if (target.parentNode && target.id.split('__').length > 1) {
            path = this.getSelectionPath(path, target.parentNode);
        }

        path.push(this.getTargetData(target));

        return path
    }

    /**
     * @param {HTMLElement} node
     * @returns {Object}
     */
    getTargetData(node) {
        let r    = node.getBoundingClientRect?.(),
            rect = r && this.parseDomRect(r) || {};

        return {
            aria             : this.geAriaAttributes(node),
            checked          : node.checked,
            childElementCount: node.childElementCount,
            clientHeight     : node.clientHeight,
            clientLeft       : node.clientLeft,
            clientTop        : node.clientTop,
            clientWidth      : node.clientWidth,
            cls              : node.classList ? [...node.classList] : [],
            data             : {...node.dataset},
            draggable        : node.draggable,
            hidden           : node.hidden,
            id               : Neo.config.useDomIds ? node.id : node.dataset?.['neoId'],
            inert            : node.inert,
            isConnected      : node.isConnected,
            isContentEditable: node.isContentEditable,
            nodeType         : node.nodeType,
            offsetHeight     : node.offsetHeight,
            offsetLeft       : node.offsetLeft,
            offsetTop        : node.offsetTop,
            offsetWidth      : node.offsetWidth,
            rect,
            role             : node.role,
            scrollHeight     : node.scrollHeight,
            scrollLeft       : node.scrollLeft,
            scrollTop        : node.scrollTop,
            scrollWidth      : node.scrollWidth,
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
     * Only in use if Neo.config.useSharedWorkers = true
     * @param {Object} event
     */
    onBeforeUnload(event) {
        let {Manager} = Neo.worker;

        Manager.appNames.forEach(appName => {
            Manager.broadcast({action: 'disconnect', appName, windowId: Manager.windowId})
        })
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

        me.sendMessageToApp(me.getMouseEventData(event));

        me.testPathInclusion(event, preventClickTargets) && event.preventDefault()
    }

    /**
     * @param {MouseEvent} event
     */
    onContextMenu(event) {
        let me = this;

        me.sendMessageToApp(me.getMouseEventData(event));

        if (event.ctrlKey || me.testPathInclusion(event, preventContextmenuTargets)) {
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
     * @param {FocusEvent} event
     */
    onFocusOut(event) {
        this.sendMessageToApp(this.getEventData(event))
    }

    /**
     *
     */
    onHashChange() {
        let {Manager}  = Neo.worker,
            hashString = location.hash.substring(1);

        Manager.sendMessage('app', {
            action: 'hashChange',
            data  : {
                appNames: Manager.appNames,
                hash    : this.parseHash(hashString),
                hashString,
                windowId: Manager.windowId
            }
        })
    }

    /**
     * @param {KeyboardEvent} event
     */
    onKeyDown(event) {
        let me        = this,
            {target}  = event,
            {tagName} = target,
            isInput   = tagName === 'INPUT' || tagName === 'TEXTAREA';

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

            if (
                !isInput &&
                ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key) &&
                me.testPathInclusion(event, ['neo-selection'], true)
            ) {
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
        this.sendMessageToApp(this.getMouseEventData(event))
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseEnter(event) {
        let me       = this,
            appEvent = {...me.getMouseEventData(event), fromElementId: event.fromElement?.id || null, toElementId: event.toElement?.id || null};

        me.sendMessageToApp(appEvent);
        me.fire('mouseEnter', appEvent)
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseLeave(event) {
        let me       = this,
            appEvent = {...me.getMouseEventData(event), fromElementId: event.fromElement?.id || null, toElementId: event.toElement?.id || null};

        me.sendMessageToApp(appEvent);
        me.fire('mouseLeave', appEvent)
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseUp(event) {
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
    onWheel(event) {
        let target        = this.testPathInclusion(event, globalWheelTargets),
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
                let {deltaX, deltaY, deltaZ} = event;

                this.sendMessageToApp({
                    ...this.getEventData(event),
                    clientHeight: target.node.clientHeight,
                    clientWidth : target.node.clientWidth,
                    deltaX,
                    deltaY,
                    deltaZ,
                    scrollLeft  : target.node.scrollLeft,
                    scrollTop   : target.node.scrollTop
                })
            }

            if (!globalWheelTargetsKeepEvent.includes(targetCls)) {
                event.preventDefault()
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
     * Example for Array values: "categories[]=test1&categories[]=test2"
     * @param {String} str
     * @returns {Object}
     */
    parseHash(str) {
        if (str === '') {
            return {}
        }

        let pieces = str.split('&'),
            data   = {},
            i, key, parts, value;

        for (i = 0; i < pieces.length; i++) {
            parts = pieces[i].split('=');

            if (parts.length < 2) {
                parts.push('')
            }

            key   = decodeURIComponent(parts[0]);
            value = decodeURIComponent(parts[1]);

            if (key.indexOf('[]') !== -1) {
                key = key.substring(0, key.indexOf('[]'));

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
}

export default Neo.setupClass(DomEvents);
