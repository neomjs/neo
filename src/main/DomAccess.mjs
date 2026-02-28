import Base       from '../core/Base.mjs';
import DomUtils   from './DomUtils.mjs';
import Rectangle  from '../util/Rectangle.mjs';
import StringUtil from '../util/String.mjs';

const
    doPreventDefault = e => e.preventDefault(),
    filterTabbable   = e => !e.classList.contains('neo-focus-trap') && DomUtils.isTabbable(e) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
    lengthRE         = /^\d+\w+$/,

    capturePassive = {
        capture: true,
        passive: true
    },

    fontSizeProps = [
        'font-family',
        'font-kerning',
        'font-size',
        'font-size-adjust',
        'font-stretch',
        'font-style',
        'font-weight',
        'letter-spacing',
        'line-height',
        'text-decoration',
        'text-transform',
        'word-break'
    ],

    modifierKeys = {
        Shift   : 1,
        Alt     : 1,
        Meta    : 1,
        Control : 1
    };

/**
 * @class Neo.main.DomAccess
 * @extends Neo.core.Base
 * @singleton
 */
class DomAccess extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.main.DomAccess'
         * @protected
         */
        className: 'Neo.main.DomAccess',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'addScript',
                'align',
                'applyBodyCls',
                'blur',
                'execCommand',
                'focus',
                'getAttributes',
                'getBoundingClientRect',
                'getComputedStyle',
                'getOffscreenCanvas',
                'getScrollingDimensions',
                'measure',
                'monitorAutoGrow',
                'monitorAutoGrowHandler',
                'scrollBy',
                'scrollIntoView',
                'scrollTo',
                'scrollToTableRow',
                'selectNode',
                'setBodyCls',
                'setStyle',
                'startViewTransition',
                'syncModalMask',
                'trapFocus',
                'windowScrollTo'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @returns {HTMLElement}
     */
    get modalMask() {
        let me = this;

        if (!me._modalMask) {
            me._modalMask = document.createElement('div');
            me._modalMask.className = 'neo-dialog-modal-mask';
            me._modalMask.addEventListener('mousedown', doPreventDefault, {capture : true})
        }

        return me._modalMask
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.initGlobalListeners();

        // Set up our aligning callback which is called when things change which may
        // mean that alignments need to be updated.
        me.syncAligns = me.syncAligns.bind(me)
    }

    /**
     * @param {Object} alignSpec
     */
    addAligned(alignSpec) {
        const
            me                   = this,
            {id}                 = alignSpec,
            aligns               = me._aligns || (me._aligns = new Map()),
            resizeObserver       = me._alignResizeObserver || (me._alignResizeObserver = new ResizeObserver(me.syncAligns)),
            {constrainToElement} = alignSpec;

        // Set up listeners which monitor for changes
        if (!aligns.has(id)) {
            // Realign when target's layout-controlling element changes size
            resizeObserver.observe(alignSpec.offsetParent);

            // Realign when align to target changes size
            resizeObserver.observe(alignSpec.targetElement);

            // Realign when constraining element changes size
            if (constrainToElement) {
                resizeObserver.observe(constrainToElement)
            }
        }

        if (!me.hasDocumentScrollListener) {
            document.addEventListener('scroll', me.syncAligns, {
                capture: true,
                passive: true
            });

            me.hasDocumentScrollListener = true
        }

        if (!me.documentMutationObserver) {
            me.documentMutationObserver = new MutationObserver(me.onDocumentMutation.bind(me));

            me.documentMutationObserver.observe(document.body, {
                childList: true,
                subtree  : true
            })
        }

        aligns.set(id, alignSpec)
    }

    /**
     * @param {Object} data
     * @param {Boolean} data.async
     * @param {Boolean} [data.defer=false]
     * @param {String} [data.src=true]
     */
    addScript(data) {
        let script = document.createElement('script');

        if (!data.hasOwnProperty('async')) {
            data.async = true
        }

        Object.assign(script, data);

        document.head.appendChild(script)
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async align(data) {
        const
            me            = this,
            {constrainTo} = data,
            subject       = data.subject = me.getElement(data.id),
            {style}       = subject,
            align         = {...data},
            lastAlign     = me._aligns?.get(data.id);

        if (lastAlign) {
            subject.classList.remove(`neo-aligned-${lastAlign.result.position}`)
        }

        // Release any constrainTo or matchSize sizing which may have been imposed
        // by a previous align call.
        me.resetDimensions(align);

        // The Rectangle's align spec target and constrainTo must be Rectangles
        align.target = me.getClippedRect({id : data.targetElement = me.getElementOrBody(data.target)});

        if (!align.target) {
            // Set the Component with id data.id to hidden : true
            return Neo.worker.App.setConfigs({id: data.id, hidden: true})
        }

        data.offsetParent = data.targetElement.offsetParent;

        if (constrainTo) {
            align.constrainTo = me.getBoundingClientRect({id : data.constrainToElement = me.getElementOrBody(constrainTo)})
        }

        // Get an aligned clone of myRect aligned according to the align object
        const
            myRect = me.getBoundingClientRect(data),
            result = data.result = myRect.alignTo(align);

        Object.assign(style, {
            top       : 0,
            left      : 0,
            transform : `translate(${result.x}px,${result.y}px)`
        });

        if (result.width !== myRect.width) {
            style.width = `${result.width}px`
        }

        if (result.height !== myRect.height) {
            style.height = `${result.height}px`
        }

        // Place box shadow at correct edge
        subject.classList.add(`neo-aligned-${result.position}`);

        // Register an alignment to be kept in sync
        me.addAligned(data)
    }

    /**
     * @param {Object} data
     * @param {String[]} data.cls
     */
    applyBodyCls(data) {
        let cls = data.cls || [];
        document.body.classList.add(...cls)
    }

    /**
     * Calls blur() on a node for a given dom node id
     * @param {Object} data
     * @returns {Object} obj.id => the passed id
     */
    blur(data) {
        this.getElement(data.id)?.blur();
        return {id: data.id}
    }

    /**
     * @param {Object} data
     * @param {String} data.command
     * @returns {Object} data
     */
    execCommand(data) {
        document.execCommand(data.command);
        return data
    }

    /**
     * Calls focus() on a node for a given dom node id
     * @param {Object}  data
     * @param {Boolean} data.children
     * @param {String}  data.id
     * @param {Boolean} [data.preventScroll=false]
     * @returns {Object} obj.id => the passed id
     */
    focus({children, id, preventScroll}) {
        let node = this.getElement(id);

        if (node) {
            // The children property means focus inner elements if possible.
            if (!DomUtils.isFocusable(node) && children) {
                // query for the first focusable descendent
                node = DomUtils.query(node, DomUtils.isFocusable)
            }

            if (node) {
                node.focus({preventScroll});

                if (Neo.isNumber(node.selectionStart)) {
                    node.selectionStart = node.selectionEnd = node.value.length
                }
            }
        }

        return {id}
    }

    /**
     * Returns the attributes for a given dom node id
     * @param {Object}          data
     * @param {String|String[]} data.attributes either an attribute or an array of attributes
     * @param {String|String[]} data.id either an id or an array of ids
     * @returns {Array|Object} In case id is an array, an array of attribute objects is returned, otherwise an object
     */
    getAttributes({attributes, id}) {
        let returnData;

        if (Array.isArray(id)) {
            returnData = [];

            id.forEach(id => {
                returnData.push(this.getAttributes({attributes, id}))
            })
        } else {
            let node = this.getElementOrBody(id);

            returnData = {};

            if (node) {
                if (!Array.isArray(attributes)) {
                    attributes = [attributes]
                }

                attributes.forEach(attribute => {
                    returnData[attribute] = node[attribute]
                })
            }
        }

        return returnData
    }

    /**
     * Returns node.getBoundingClientRect() for a given dom node id
     * @param {Object} data
     * @param {Array|String} data.id either an id or an array of ids
     * @returns {DOMRect|DOMRect[]} In case id is an array, an array of DomRects is returned, otherwise an DomRect object
     */
    getBoundingClientRect(data) {
        let me = this,
            returnData;

        if (Array.isArray(data.id)) {
            return data.id.map(id => me.getBoundingClientRect({id}))
        } else {
            let node = me.getElementOrBody(data.nodeType ? data : data.id),
                rect = {},
                minWidth, minHeight, style;

            returnData = {};

            if (node) {
                rect      = node.getBoundingClientRect();
                style     = node.ownerDocument.defaultView.getComputedStyle(node);
                minWidth  = style.getPropertyValue('min-width');
                minHeight = style.getPropertyValue('min-height');

                // DomRect does not support spreading => {...DomRect} => {}
                returnData = Rectangle.clone(rect);

                // Measure minWidth/minHeight in other units like em/rem etc
                // Note that 0px is what the DOM reports if no minWidth is specified
                // so we do not report a minimum in these cases.
                if (lengthRE.test(minWidth) && minWidth !== '0px') {
                    returnData.minWidth = me.measure({value: minWidth, id: node})
                }
                if (lengthRE.test(minHeight) && minHeight !== '0px') {
                    returnData.minHeight = me.measure({value: minHeight, id: node})
                }
            }
        }

        return returnData
    }

    /**
     * @param {Object|String} data
     * @returns {Neo.util.Rectangle}
     */
    getClippedRect(data) {
        let me            = this,
            node          = me.getElement(typeof data === 'object' ? data.id : data),
            {defaultView} = node.ownerDocument,
            rect          = me.getBoundingClientRect(node);

        for (let parentElement = node.offsetParent; parentElement && rect && parentElement !== document.documentElement; parentElement = parentElement.parentElement) {
            if (defaultView.getComputedStyle(parentElement).getPropertyValue('overflow') !== 'visible') {
                rect = rect.intersects(this.getBoundingClientRect(parentElement))
            }
        }

        return rect
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String|String[]} data.style
     * @returns {Object}
     */
    getComputedStyle({id, style}) {
        let node   = this.getElement(id),
            styles = {};

        if (node) {
            let computedStyle = window.getComputedStyle(node);

            if (!Array.isArray(style)) {
                style = [style]
            }

            style.forEach(prop => {
                styles[prop] = computedStyle.getPropertyValue(prop)
            })
        }

        return styles
    }

    /**
     * @param {String|HTMLElement|Window|Document} nodeId
     * @returns {HTMLElement|Window|Document|null}
     * @protected
     */
    getElement(nodeId) {
        if (nodeId === 'window') {
            return globalThis
        }

        if (nodeId === 'document') {
            return document
        }

        if (nodeId === 'document.body' || nodeId === 'body') {
            return document.body
        }

        let node = nodeId?.nodeType ?
            nodeId : Neo.config.useDomIds ?
                document.getElementById(nodeId) :
                document.querySelector(`[data-neo-id='${nodeId}']`);

        return node || null
    }

    /**
     * @param {String|HTMLElement} nodeId='document.body'
     * @returns {HTMLElement|null}
     * @protected
     */
    getElementOrBody(nodeId='document.body') {
        if (!nodeId) {
            return null
        }

        return this.getElement(nodeId)
    }

    /**
     * @param {HTMLElement|Object} data
     * @param {String|String[]} data.id
     * @returns {Object}
     */
    getScrollingDimensions(data) {
        let me = this;

        if (Array.isArray(data.id)) {
            return data.id.map(id => me.getScrollingDimensions({id}))
        } else {
            let node = data.nodeType ? data : me.getElementOrBody(data.id);

            return {
                clientHeight: node?.clientHeight,
                clientWidth : node?.clientWidth,
                scrollHeight: node?.scrollHeight,
                scrollWidth : node?.scrollWidth
            }
        }
    }

    /**
     *
     */
    initGlobalListeners() {
        let me = this;

        document.addEventListener('blur',      me.onDocumentBlur     .bind(me), capturePassive);
        document.addEventListener('keydown',   me.onDocumentKeyDown  .bind(me), capturePassive);
        document.addEventListener('keyup',     me.onDocumentKeyUp    .bind(me), capturePassive);
        document.addEventListener('mousedown', me.onDocumentMouseDown.bind(me), {capture : true})
    }

    /**
     * @param {HTMLElement} el
     * @returns {Boolean}
     */
    isAlignSubject(el) {
        return [...this._aligns?.values()].some(align => align.subject === el)
    }

    /**
     * Include a script into the document.head
     * You can add more attributes if needed. See: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script
     * @param {String} src
     * @param {Object} opts={defer:true}
     * @param {Boolean} [opts.async]
     * @param {Boolean} [opts.defer]
     * @returns {Promise<unknown>}
     */
    loadScript(src, opts={defer:true}) {
        let script;

        return new Promise((resolve, reject) => {
            script = document.createElement('script');

            Object.assign(script, {
                ...opts,
                onerror: reject,
                onload : resolve,
                src
            });

            document.head.appendChild(script)
        })
    }

    /**
     * Include a link into the document.head
     * @param {String} href
     * @param {Object} dataset=null
     * @returns {Promise<unknown>}
     */
    loadStylesheet(href, dataset=null) {
        let link;

        return new Promise((resolve, reject) => {
            link = document.createElement('link');

            Object.assign(link, {
                href,
                onerror: reject,
                onload : resolve,
                rel    : 'stylesheet',
                type   : 'text/css'
            });

            if (dataset) {
                Object.assign(link.dataset, dataset)
            }

            document.head.appendChild(link)
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Number|String} data.value
     * @returns {Number|String}
     */
    measure({ value, id }) {
        const node = id.nodeType === 1 ? id : this.getElement(id);

        if (value.endsWith('%')) {
            const fraction = parseFloat(value) / 100;

            return (node.offsetParent?.getBoundingClientRect().height || 0) * fraction
        }
        // If it's any other CSS unit than px, it needs to be measured using the DOM
        else if (isNaN(value) && !value.endsWith('px')) {
            const elStyle = node.ownerDocument.defaultView.getComputedStyle(node);

            let d = this._measuringDiv;

            if (!d) {
                d = this._measuringDiv = document.createElement('div');
                d.style = 'position:fixed;top:-10000px;left:-10000px'
            }

            // In case a DOM update cleared it out
            document.body.appendChild(d);

            // Set all the font-size, font-weight etc style properties so that
            // em/ex/rem etc units will match
            fontSizeProps.forEach(prop => {
                d.style[prop] = elStyle[prop];
            });
            d.className = node.className;
            d.style.width = value;

            // Read back the resulting computed pixel width
            value = elStyle.width;

        }
        // If it's a number, or ends with px, use the numeric value.
        else {
            value = parseFloat(value)
        }

        return value
    }

    /**
     * Checks the overflow status of a TextAreaField's &lt;textarea> element and updates the
     * height so that there is never a vertical scrollbar.
     * @param {Object} data
     */
    async monitorAutoGrow(data) {
        const
            me     = this,
            target = data.subject = me.getElement(data.id);

        // We need to update the height on every input event is autoGrow is truthy.
        target[data.autoGrow ? 'addEventListener' : 'removeEventListener']('input', me.monitorAutoGrowHandler);

        // Fix the height up immediately too
        data.autoGrow && me.monitorAutoGrowHandler({
            target
        })
    }

    /**
     *
     * @param {Event|Object} data
     * @param {String} [data.id]
     * @param {HTMLElement} [data.target]
     */
    monitorAutoGrowHandler(data) {
        const target = data.target || this.getElement(data.id);

        if (target) {
            const
                { style }              = target,
                { style : inputStyle } = target.closest('.neo-textarea');

            // Measure the scrollHeight when forced to overflow, then set height to encompass the scrollHeight
            style.height = style.minHeight = 0;
            inputStyle.setProperty('--textfield-input-height', `${target.scrollHeight + 5}px`);
            inputStyle.setProperty('height', '');
            style.height = style.minHeight = ''
        }
    }

    /**
     *
     */
    onDocumentBlur() {
        Neo.altKeyDown = Neo.controlKeyDown = Neo.metaKeyDown = Neo.shiftKeyDown = false
    }

    /**
     * @param {KeyboardEvent} keyEvent
     */
    onDocumentKeyDown(keyEvent) {
        if (modifierKeys[keyEvent.key]) {
            // e.g. Neo.isShiftKeyDown = true or Neo.isControlKeyDown = true.
            // Selection can consult this value
            Neo[`${StringUtil.uncapitalize(keyEvent.key)}KeyDown`] = true
        }
    }

    /**
     * @param {KeyboardEvent} keyEvent
     */
    onDocumentKeyUp(keyEvent) {
        if (modifierKeys[keyEvent.key]) {
            Neo[`${StringUtil.uncapitalize(keyEvent.key)}KeyDown`] = false
        }
    }

    /**
     * @param {Array} mutations
     */
    onDocumentMutation(mutations) {
        const me = this;

        // If the mutations are purely align subjects being added or removed, take no action.
        if (!mutations.every(({ type, addedNodes, removedNodes }) => {
            if (type === 'childList') {
                const nodes = [...Array.from(addedNodes), ...Array.from(removedNodes)];

                return nodes.every(a => me.isAlignSubject(a))
            }
        })) {
            me.syncAligns()
        }
    }

    /**
     * @param {MouseEvent} e
     */
    onDocumentMouseDown(e) {
        let focusController = e.target?.closest('[data-focus]');

        // data-focus on an element means reject mousedown gestures, and move focus
        // to the referenced element.
        if (focusController) {
            e.preventDefault();
            document.getElementById(focusController.dataset.focus)?.focus()
        }
    }

    /**
     *
     */
    onDomContentLoaded() {
        Neo.config.applyBodyCls && this.applyBodyCls({cls: ['neo-body']});
        Neo.config.applyFixedPositionToHtmlTag && document.documentElement.style.setProperty('position', 'fixed')
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.nodeId
     */
    getOffscreenCanvas(data) {
        let me        = this,
            node      = me.getElement(data.nodeId),
            offscreen;

        if (!node) {
            return {
                result: {success: false}
            }
        }

        try {
            offscreen = node.transferControlToOffscreen();

            return {
                result  : {offscreen},
                transfer: [offscreen]
            }
        } catch (e) {
            return {transferred: true}
        }
    }

    /**
     * @param {Object} data
     * @param {String[]} data.attributes
     * @param {Array} data.functions An array containing strings and/or objects
     * @param {String[]} data.styles
     * @param {String} data.vnodeId
     * @protected
     */
    onReadDom(data) {
        let attributes    = data.attributes || [],
            functions     = data.functions  || [],
            styles        = data.styles     || [],
            {vnodeId}     = data,
            retAttributes = {},
            retFunctions  = {},
            retStyles     = {},
            element       = vnodeId ? this.getElement(vnodeId) : null,
            fnName, scope;

        attributes.forEach(key => {
            retAttributes[key] = element[key]
        });

        functions.forEach((key, index) => {
            if (Neo.isObject(key)) {
                key.params         = key.params         || [];
                key.paramIsDomNode = key.paramIsDomNode || [];

                scope = key.scope ? document[key.scope] : element;

                key.params.forEach((param, paramIndex) => {
                    if (key.paramIsDomNode[paramIndex] === true) {
                        key.params[paramIndex] = this.getElement(key.params[paramIndex])
                    }
                });

                fnName = key.returnFnName ? key.returnFnName : index;
                retFunctions[fnName] = scope[key.fn](...key.params);

                if (key.returnValue) {
                    retFunctions[fnName] = retFunctions[fnName][key.returnValue]
                }
            } else {
                retFunctions[key] = element[key]()
            }
        });

        styles.forEach(key => {
            retStyles[key] = element.style[key]
        });

        Object.assign(data, {
            attributes: retAttributes,
            functions : retFunctions,
            styles    : retStyles
        });

        Neo.worker.Manager.sendMessage(data.origin, {
            action : 'reply',
            data,
            replyId: data.id,
            success: true
        })
    }

    /**
     * @param data
     * @param data.target
     * @param data.relatedTarget
     */
    onTrappedFocusMovement({ target, relatedTarget }) {
        const backwards = relatedTarget && (target.compareDocumentPosition(relatedTarget) & 4);

        if (target.matches('.neo-focus-trap')) {
            const
                containingEement = target.parentElement,
                treeWalker       = containingEement.$treeWalker,
                topFocusTrap     = containingEement.$topFocusTrap,
                bottomFocusTrap  = containingEement.$bottomFocusTrap;

            treeWalker.currentNode = backwards ? bottomFocusTrap : topFocusTrap;
            treeWalker[backwards ? 'previousNode' : 'nextNode']();

            requestAnimationFrame(() => treeWalker.currentNode.focus())
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    read(data) {
        Neo.isFunction(data) && data()
    }

    /**
     * Resets any DOM sizing configs to the last externally configured value.
     *
     * This is used during aligning to release any constraints applied by a previous alignment.
     * @param {Object} align
     * @protected
     */
    resetDimensions(align) {
        Object.assign(this.getElement(align.id).style, {
            flex     : align.configuredFlex,
            height   : align.configuredHeight,
            maxHeight: align.configuredMaxHeight,
            maxWidth : align.configuredMaxWidth,
            minHeight: align.configuredMinHeight,
            minWidth : align.configuredMinWidth,
            width    : align.configuredWidth
        })
    }

    /**
     * @param {Object} data
     * @param {Object} [data.animate]
     * @param {Number} [data.delay=50]
     * @returns {Promise<Boolean>}
     */
    async startViewTransition(data) {
        if (!document.startViewTransition) {
            return false
        }

        const transition = document.startViewTransition(async () => {
            await this.timeout(data.delay || 50)
        });

        if (data.animate) {
            transition.ready.then(() => {
                document.documentElement.animate(
                    data.animate.keyframes,
                    data.animate.options
                )
            })
        }

        return true
    }

    /**
     * See: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollBy
     * @param {Object} data
     * @param {String} data.behavior='auto' auto, instant, smooth
     * @param {String} data.direction='top' left, top
     * @param {String} data.id
     * @param {Number} data.value
     * @returns {Object} obj.id => the passed id
     */
    scrollBy({behavior='auto', direction='top', id, value}) {
        this.getElement(id)?.scrollBy({behavior, [direction]: value});
        return {id}
    }

    /**
     * You can either pass the id or a querySelector
     * @param {Object} data
     * @param {String} [data.id]
     * @param {String} data.behavior='smooth'
     * @param {String} data.block='start'
     * @param {Number} data.delay=500
     * @param {String} data.inline='nearest'
     * @param {String} [data.querySelector]
     * @returns {Promise<any>}
     */
    scrollIntoView({id, behavior='smooth', block='start', delay=500, inline='nearest', querySelector}) {
        let node = id ? this.getElement(id) : document.querySelector(querySelector),
            opts = {behavior, block, inline};

        if (behavior !== 'smooth') {
            node.scrollIntoView(opts)
        } else {
            // scrollIntoView() does not provide a callback yet.
            // See: https://github.com/w3c/csswg-drafts/issues/3744
            return new Promise(resolve => {
                if (node) {
                    let hasListener = 'scrollend' in window;

                    hasListener && document.addEventListener('scrollend', () => resolve(), {capture: true, once: true});

                    node.scrollIntoView(opts);

                    !hasListener && this.timeout(delay).then(() => {resolve()})
                } else {
                    resolve()
                }
            })
        }
    }

    /**
     * See: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTo
     * @param {Object} data
     * @param {String} data.behavior='auto' auto, instant, smooth
     * @param {String} data.direction='top' left, top
     * @param {String} data.id
     * @param {Number} data.value
     * @returns {Object} obj.id => the passed id
     */
    scrollTo({behavior='auto', direction='top', id, value}) {
        this.getElement(id)?.scrollTo({behavior, [direction]: value});
        return {id}
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.behavior='smooth'
     * @param {Number} data.offset=34
     * @returns {Object} obj.id => the passed id
     */
    scrollToTableRow({id, behavior='smooth', offset=34}) {
        let node = this.getElement(id); // tr tag

        if (node) {
            let tableNode   = node.parentNode.parentNode,
                wrapperNode = tableNode.parentNode,
                tableTop    = tableNode.getBoundingClientRect().top,
                top         = node.getBoundingClientRect().top;

            wrapperNode.scrollTo({
                behavior,
                top: top - tableTop - offset
            })
        }

        return {id}
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Number} [data.start=0]
     * @param {Number} [data.end=99999]
     * @returns {Object} obj.id => the passed id
     */
    selectNode(data) {
        let node  = this.getElement(data.id),
            start = Neo.isNumber(data.start) ? data.start : 0,
            end   = Neo.isNumber(data.end)   ? data.end   : 99999;

        if (node) {
            node.select();
            node.setSelectionRange(start, end)
        }

        return {id: data.id}
    }

    /**
     * @param {Object} data
     * @param {String[]} data.add
     * @param {Object[]} data.remove
     */
    setBodyCls(data) {
        document.body.classList.remove(...data.remove || []);
        document.body.classList.add(...data.add || [])
    }

    /**
     * Not recommended to use => stick to vdom updates.
     * Can be handy for custom CSS based animations though.
     * @param {Object} data
     * @param {String} data.id A node id or 'document.body'
     * @param {Object} data.style
     * @returns {Object} obj.id => the passed id
     */
    setStyle(data) {
        let node = this.getElementOrBody(data.id);

        if (node) {
            Object.entries(data.style).forEach(([key, value]) => {
                if (Neo.isString(value) && value.includes('!important')) {
                    value = value.replace('!important', '').trim();
                    node.style.setProperty(Neo.decamel(key), value, 'important')
                } else {
                    node.style[Neo.decamel(key)] = value
                }
            })
        }

        return {id: data.id}
    }

    /**
     * @param {Event|ResizeObserverEntry[]} [arg1]
     */
    syncAligns(arg1) {
        const
            me          = this,
            {_aligns}   = me,
            isScroll    = arg1?.type === 'scroll',
            evtTarget   = isScroll ? arg1.target : null,
            // Document scroll (window) target is document.
            isDocScroll = isScroll && (evtTarget === document || evtTarget === document.documentElement);

        // Keep all registered aligns aligned on any detected change
        _aligns?.forEach(align => {
            const targetPresent = document.contains(align.targetElement);

            // Align subject and target still in the DOM - correct its alignment
            if (document.contains(align.subject) && targetPresent) {
                // If it's a scroll event, optimization:
                if (isScroll && !isDocScroll) {
                    // If the scrolling element does NOT contain the reference target,
                    // then the reference target did not move relative to viewport.
                    const targetMoved = evtTarget.contains(align.targetElement) || (align.constrainToElement && evtTarget.contains(align.constrainToElement));

                    if (!targetMoved) {
                        return // Skip this alignment
                    }
                }

                me.align(align)
            }
            // Align subject or target no longer in the DOM - remove it.
            else {
                // If target is no longer in the DOM, hide the subject component
                if (!targetPresent) {
                    Neo.worker.App.setConfigs({ id: align.id, hidden: true })
                }

                const
                    {_alignResizeObserver} = me,
                    {constrainToElement}   = align;

                // Stop observing the align elements
                _alignResizeObserver.unobserve(align.subject);
                _alignResizeObserver.unobserve(align.offsetParent);
                _alignResizeObserver.unobserve(align.targetElement);
                if (constrainToElement) {
                    _alignResizeObserver.unobserve(constrainToElement)
                }

                // Clear the last aligned class.
                align.subject.classList.remove(`neo-aligned-${align.result?.position}`);

                _aligns.delete(align.id)
            }
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Boolean} data.modal
     */
    syncModalMask({ id, modal }) {
        const el = id && this.getElement(id);

        // If we are visible and modal, the mask needs to be just below this element.
        if (el && modal && el.ownerDocument.contains(el) && el.ownerDocument.defaultView.getComputedStyle(el).getPropertyValue('display') !== 'none') {
            document.body.insertBefore(this.modalMask, el)
        }
        // Otherwise, the mask needs to be below the next topmost modal dialog if possible, or hidden
        else {
            const
                modals       = document.querySelectorAll('.neo-modal'),
                topmostModal = modals[modals.length - 1];

            // Move the mask under the next topmost modal now modal "id" is gone.
            if (topmostModal) {
                this.syncModalMask({ id: topmostModal.id, modal: true })
            } else {
                this._modalMask?.remove()
            }
        }
    }

    /**
     * Traps (or stops trapping) focus within a Component
     * @param {Object} data
     * @param {String} data.id The Component to trap focus within.
     * @param {Boolean} [data.trap=true] Pass `false` to stop trapping focus inside the Component.
     */
    async trapFocus(data) {
        const
            me                     = this,
            onTrappedFocusMovement = me.$boundOnTrappedFocusMovement || (me.$boundOnTrappedFocusMovement = me.onTrappedFocusMovement.bind(me)),
            subject                = data.subject = me.getElement(data.id),
            { trap = true }        = data;

        // Called before DOM has been created.
        if (!subject) {
            return
        }

        let topFocusTrap    = subject.$topFocusTrap,
            bottomFocusTrap = subject.$bottomFocusTrap;

        if (trap) {
            if (!subject.$treeWalker) {
                subject.$treeWalker = document.createTreeWalker(subject, NodeFilter.SHOW_ELEMENT, {
                    acceptNode: filterTabbable
                });
                topFocusTrap = subject.$topFocusTrap = document.createElement('div');
                bottomFocusTrap = subject.$bottomFocusTrap = document.createElement('div');

                // The two focus trapping elements must be invisible but tabbable.
                topFocusTrap.className = bottomFocusTrap.className = 'neo-focus-trap';
                topFocusTrap.setAttribute('tabIndex', 0);
                bottomFocusTrap.setAttribute('tabIndex', 0);

                // Listen for when they gain focus and wrap focus within the encapsulating element
                subject.addEventListener('focusin', onTrappedFocusMovement)
            }

            // Ensure content is encapsulated by the focus trap elements
            subject.insertBefore(topFocusTrap, subject.firstChild);
            subject.appendChild(bottomFocusTrap)
        } else {
            subject.removeEventListener('focusin', onTrappedFocusMovement)
        }
    }

    /**
     * @param {Object} data
     * @param {String} [data.behavior='smooth'] // auto or smooth
     * @param {String} [data.left=0]
     * @param {String} [data.top=0]
     */
    windowScrollTo(data) {
        window.scrollTo({
            behavior: data.behavior || 'smooth',
            left    : data.left     || 0,
            top     : data.top      || 0
        })
    }
}

export default Neo.setupClass(DomAccess);
