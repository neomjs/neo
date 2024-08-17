import Base         from '../core/Base.mjs';
import DeltaUpdates from './mixin/DeltaUpdates.mjs';
import DomUtils     from './DomUtils.mjs';
import Observable   from '../core/Observable.mjs';
import Rectangle    from '../util/Rectangle.mjs';
import StringUtil   from '../util/String.mjs';

const
    doPreventDefault = e => e.preventDefault(),
    filterTabbable   = e => !e.classList.contains('neo-focus-trap') && DomUtils.isTabbable(e) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
    lengthRE         = /^\d+\w+$/,

    capturePassive = {
        capture : true,
        passive : true
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
    static config = {
        /**
         * @member {String} className='Neo.main.DomAccess'
         * @protected
         */
        className: 'Neo.main.DomAccess',
        /**
         * @member {Number} countDeltas=0
         * @protected
         */
        countDeltas: 0,
        /**
         * @member {Number} countDeltasPer250ms=0
         * @protected
         */
        countDeltasPer250ms: 0,
        /**
         * @member {Number} countUpdates=0
         * @protected
         */
        countUpdates: 0,
        /**
         * @member {Array} mixins=[DeltaUpdates, Observable]
         */
        mixins: [
            DeltaUpdates,
            Observable
        ],
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
                'getScrollingDimensions',
                'measure',
                'monitorAutoGrow',
                'monitorAutoGrowHandler',
                'navigate',
                'navigateTo',
                'scrollBy',
                'scrollIntoView',
                'scrollTo',
                'scrollToTableRow',
                'selectNode',
                'setBodyCls',
                'setStyle',
                'syncModalMask',
                'trapFocus',
                'windowScrollTo'
            ]
        },
        /**
         * @member {Boolean} renderCountDeltas_=false
         * @protected
         */
        renderCountDeltas_: false,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Void attributes inside html tags
         * @member {String[]} voidAttributes
         * @protected
         */
        voidAttributes: [
            'checked',
            'required'
        ]
    }

    /**
     * @member {Number} logDeltasIntervalId=0
     * @protected
     */
    logDeltasIntervalId = 0

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

        if (Neo.config.renderCountDeltas) {
            me.renderCountDeltas = true
        }

        me.initGlobalListeners();

        // Set up our aligning callback which is called when things change which may
        // mean that alignments need to be updated.
        me.syncAligns = me.syncAligns.bind(me)
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

    onDocumentMouseDown(e) {
        let focusController = e.target?.closest('[data-focus]');

        // data-focus on an element means reject mousedown gestures, and move focus
        // to the referenced element.
        if (focusController) {
            e.preventDefault();
            document.getElementById(focusController.dataset.focus)?.focus()
        }
    }

    onDocumentKeyDown(keyEvent) {
        if (modifierKeys[keyEvent.key]) {
            // e.g. Neo.isShiftKeyDown = true or Neo.isControlKeyDown = true.
            // Selection can consult this value
            Neo[`${StringUtil.uncapitalize(keyEvent.key)}KeyDown`] = true;
        }
    }

    onDocumentKeyUp(keyEvent) {
        if (modifierKeys[keyEvent.key]) {
            Neo[`${StringUtil.uncapitalize(keyEvent.key)}KeyDown`] = false;
        }
    }

    onDocumentBlur() {
        Neo.altKeyDown = Neo.controlKeyDown = Neo.metaKeyDown = Neo.shiftKeyDown = false;
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
     * Triggered after the renderCountDeltas config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetRenderCountDeltas(value, oldValue) {
        let me                    = this,
            {logDeltasIntervalId} = me,
            node;

        if (value) {
            if (logDeltasIntervalId === 0) {
                me.logDeltasIntervalId = setInterval(() => {
                    node = document.getElementById('neo-delta-updates');

                    if (node) {
                        node.innerHTML = String(me.countDeltasPer250ms * 4)
                    }

                    me.countDeltasPer250ms = 0
                }, 250)
            }
        } else {
            logDeltasIntervalId && clearInterval(logDeltasIntervalId);
            me.logDeltasInterval = 0
        }
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
     * @param {Object} data
     * @returns {Object} obj.id => the passed id
     */
    focus(data) {
        let node = this.getElement(data.id);

        if (node) {
            // The children property means focus inner elements if possible.
            if (!DomUtils.isFocusable(node) && data.children) {
                // query for the first focusable decendent
                node = DomUtils.query(node, DomUtils.isFocusable)
            }

            if (node) {
                node.focus();

                if (Neo.isNumber(node.selectionStart)) {
                    node.selectionStart = node.selectionEnd = node.value.length
                }
            }
        }

        return {id: data.id}
    }

    /**
     * Returns the attributes for a given dom node id
     * @param {Object} data
     * @param {Array|String} data.id either an id or an array of ids
     * @param {Array|String} data.attributes either an attribute or an array of attributes
     * @returns {Array|Object} In case id is an array, an array of attribute objects is returned, otherwise an object
     */
    getAttributes(data) {
        let returnData;

        if (Array.isArray(data.id)) {
            returnData = [];

            data.id.forEach(id => {
                returnData.push(this.getAttributes({
                    attributes: data.attributes,
                    id        : id
                }))
            })
        } else {
            let node = this.getElementOrBody(data.id);

            returnData = {};

            if (node) {
                if (!Array.isArray(data.attributes)) {
                    data.attributes = [data.attributes];

                    data.attributes.forEach(attribute => {
                        returnData[attribute] = node[attribute]
                    })
                }
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
            return data.id.map(id => me.getBoundingClientRect({ id }));
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
     * @param {String|HTMLElement} nodeId
     * @returns {HTMLElement}
     * @protected
     */
    getElement(nodeId) {
        return nodeId.nodeType ? nodeId : Neo.config.useDomIds ?  document.getElementById(nodeId) : document.querySelector(`[data-neo-id='${nodeId}']`)
    }

    /**
     * @param {String|HTMLElement} [nodeId='document.body']
     * @returns {HTMLElement}
     * @protected
     */
    getElementOrBody(nodeId='document.body') {
        return nodeId.nodeType ? nodeId : (nodeId === 'body' || nodeId === 'document.body') ? document.body : this.getElement(nodeId)
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
     * @param {Object} opts=defer:true}
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
     *
     */
    onDomContentLoaded() {
        Neo.config.applyBodyCls && this.applyBodyCls({cls: ['neo-body']})
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.nodeId
     */
    onGetOffscreenCanvas(data) {
        let me        = this,
            node      = me.getElement(data.nodeId),
            offscreen = node.transferControlToOffscreen();

        data.offscreen = offscreen;

        Neo.worker.Manager.sendMessage(data.origin, {
            action : 'reply',
            data,
            replyId: data.id,
            success: true
        }, [offscreen])
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
        typeof data === 'function' && data()
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
     * @param {String} data.direction left, top
     * @param {String} data.id
     * @param {Number} data.value
     * @returns {Object} obj.id => the passed id
     */
    scrollBy(data) {
        let node = this.getElement(data.id);

        if (node) {
            node[`scroll${Neo.capitalize(data.direction)}`] += data.value
        }

        return {id: data.id}
    }

    /**
     * You can either pass the id or a querySelector
     * @param {Object} data
     * @param {String} [data.id]
     * @param {String} data.behavior='smooth'
     * @param {String} data.block='start'
     * @param {String} data.inline='nearest'
     * @param {String} [data.querySelector]
     * @returns {Promise<any>}
     */
    scrollIntoView(data) {
        let node = data.id ? this.getElement(data.id) : document.querySelector(data.querySelector),
            opts = {
                behavior: data.behavior || 'smooth',
                block   : data.block    || 'start',
                inline  : data.inline   || 'nearest'
            };

        if (opts.behavior !== 'smooth') {
            node.scrollIntoView(opts)
        } else {
            // scrollIntoView() does not provide a callback yet.
            // See: https://github.com/w3c/csswg-drafts/issues/3744
            return new Promise(resolve => {
                if (node) {
                    let hasListener = 'scrollend' in window;

                    hasListener && document.addEventListener('scrollend', () =>resolve(), {capture : true, once: true});

                    node.scrollIntoView(opts);

                    !hasListener && this.timeout(500).then(() => {resolve()})
                } else {
                    resolve()
                }
            })
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.direction left, top
     * @param {String} data.id
     * @param {Number} data.value
     * @returns {Object} obj.id => the passed id
     */
    scrollTo(data) {
        let node = this.getElement(data.id);

        if (node) {
            node[`scroll${Neo.capitalize(data.direction)}`] = data.value
        }

        return {id: data.id}
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} [data.behavior='smooth']
     * @param {String} [data.offset=34]
     * @returns {Object} obj.id => the passed id
     */
    scrollToTableRow(data) {
        let node = this.getElement(data.id); // tr tag

        if (node) {
            let tableNode   = node.parentNode.parentNode,
                wrapperNode = tableNode.parentNode,
                tableTop    = tableNode.getBoundingClientRect().top,
                top         = node.getBoundingClientRect().top;

            wrapperNode.scrollTo({
                behavior: data.behavior || 'smooth',
                top     : top - tableTop - (data.hasOwnProperty('offset') ? data.offset : 34)
            })
        }

        return {id: data.id}
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
     *
     */
    syncAligns() {
        const
            me        = this,
            {_aligns} = me;

        // Keep all registered aligns aligned on any detected change
        _aligns?.forEach(align => {
            const targetPresent = document.contains(align.targetElement);

            // Align subject and target still in the DOM - correct its alignment
            if (document.contains(align.subject) && targetPresent) {
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

                // The two focus traping elements must be invisble but tabbable.
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

    /**
     * @param {Object} data
     * @protected
     */
    write(data) {
        this.du_insertNode({
            index    : data.parentIndex,
            outerHTML: data.html || data.outerHTML,
            parentId : data.parentId
        })
    }
}

export default Neo.setupClass(DomAccess);
