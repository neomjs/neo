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
        Shift  : 1,
        Alt    : 1,
        Meta   : 1,
        Control: 1
    },
    /**
     * @summary Identifies the JSON-safe viewport Rectangle accepted by floating alignment.
     * @param {*} value
     * @returns {Boolean}
     */
    isSerializedRectangle = value => Boolean(value) && !value.nodeType &&
        ['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key]));

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
                'getChildNodeIds',
                'getComputedStyle',
                'getLayoutRect',
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
                'transferCanvasToWorker',
                'trapFocus',
                'waitForAnimation',
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
     * @summary Registers one alignment so it is re-resolved whenever its geometry inputs change.
     *
     * Observes the subject, the target, the target's offset parent and any constraining element with a
     * shared `ResizeObserver`, and installs the document-level scroll and mutation listeners on first
     * use. Every one of those paths re-enters `align()`, which is why that method must be idempotent
     * for an unchanged result — a resync happens far more often than a real move.
     * @param {Object} alignSpec
     */
    addAligned(alignSpec) {
        const
            me                                           = this,
            {id}                                         = alignSpec,
            aligns                                       = me._aligns || (me._aligns = new Map()),
            resizeObserver                               = me._alignResizeObserver || (me._alignResizeObserver = new ResizeObserver(me.syncAligns)),
            {constrainToElement, subject, targetElement} = alignSpec;

        // Set up listeners which monitor for changes
        if (!aligns.has(id)) {
            // The subject size participates in every alignment, including coordinate targets.
            resizeObserver.observe(subject);

            // Realign when the target's layout-controlling element changes size. `align()` stores
            // `alignSpec.offsetParent = targetElement.offsetParent` — the TARGET's layout parent, which is
            // null when the target is position:fixed (or the body/root). Guard against observing null —
            // `ResizeObserver.observe(null)` throws "parameter 1 is not of type 'Element'".
            alignSpec.offsetParent && resizeObserver.observe(alignSpec.offsetParent);

            // Element targets can resize. Serialized viewport Rectangles have no physical node to observe.
            targetElement && resizeObserver.observe(targetElement);

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
        if (!data.hasOwnProperty('async')) {
            data.async = true
        }

        this.createAndAppendElement('script', data)
    }

    /**
     * Shared DOM-element factory: creates an element of the given tag, assigns the props onto it via
     * Object.assign, and appends it to document.head. The common primitive behind addScript() and
     * loadScript() (loadStylesheet() can adopt it in a follow-up). Returns the element for any
     * post-append work the caller needs.
     * @param {String} tag The element tag, e.g. 'script'.
     * @param {Object} props Properties assigned onto the element.
     * @returns {Element} The created + appended element.
     */
    createAndAppendElement(tag, props) {
        const element = document.createElement(tag);

        Object.assign(element, props);
        document.head.appendChild(element);

        return element
    }

    /**
     * @summary Aligns a physical subject to either an element or serialized viewport Rectangle.
     * @param {Object} data
     * @param {String} data.id
     * @param {String|HTMLElement|{x:Number,y:Number,width:Number,height:Number}} [data.target]
     * @param {String|HTMLElement} [data.constrainTo]
     * @returns {Promise<void>}
     */
    async align(data) {
        const
            me             = this,
            {constrainTo}  = data,
            subject        = data.subject = me.getElement(data.id),
            {style}        = subject,
            align          = {...data},
            lastAlign      = me._aligns?.get(data.id),
            targetIsObject = typeof data.target === 'object' && !data.target?.nodeType,
            targetIsRect   = isSerializedRectangle(data.target);

        // The previous zone class is NOT dropped here. Removing it before the zone search knows the
        // new result means every resync passes through a classless frame, even when the zone is
        // unchanged — and a class removed and re-added around a layout read does not resume a CSS
        // animation, it destroys one and starts another (measured: `currentTime` 949ms -> `none` with
        // zero animations -> a different Animation object at 0). The swap is therefore deferred to
        // the point where the new position is known, and skipped entirely when it matches.

        // Release any constrainTo or matchSize sizing which may have been imposed
        // by a previous align call.
        me.resetDimensions(align);

        data.targetElement = targetIsObject ? null : me.getElementOrBody(data.target);
        data.targetRect    = targetIsRect ? new Rectangle(
            data.target.x,
            data.target.y,
            data.target.width,
            data.target.height
        ) : null;

        // Rectangle targets are already viewport geometry; element targets retain clipping semantics.
        align.target = data.targetRect || (data.targetElement && me.getClippedRect({id: data.targetElement}));

        if (!align.target) {
            // Set the Component with id data.id to hidden : true
            return Neo.worker.App.setConfigs({id: data.id, hidden: true})
        }

        data.offsetParent = data.targetElement?.offsetParent || null;

        if (constrainTo) {
            align.constrainTo = me.getBoundingClientRect({id : data.constrainToElement = me.getElementOrBody(constrainTo)})
        }

        // Get an aligned clone of myRect aligned according to the align object
        const
            myRect = me.getBoundingClientRect(data),
            result = data.result = myRect.alignTo(align);

        Object.assign(style, {
            top      : 0,
            left     : 0,
            transform: `translate(${result.x}px,${result.y}px)`
        });

        if (result.width !== myRect.width) {
            style.width = `${result.width}px`
        }

        if (result.height !== myRect.height) {
            style.height = `${result.height}px`
        }

        // Place box shadow at correct edge. Swapped only on a real zone change, so an ordinary
        // resync leaves the class — and anything keyed on it, including a CSS entrance animation and
        // the shadow repaint — completely untouched.
        const
            previousPosition = lastAlign?.result?.position,
            positionCls      = `neo-aligned-${result.position}`;

        // Guarded on the SUBJECT, not on the cached align record. Keying off `lastAlign` looks
        // equivalent and is not: a subject can lose the class without the record changing — a hidden
        // menu is removed from the DOM and remounts as a fresh element, so it comes back classless
        // while `_aligns` still reports the same zone. That guard silently never re-added the class,
        // and a reused menu stayed unaligned for the rest of its life.
        if (!subject.classList.contains(positionCls)) {
            previousPosition && subject.classList.remove(`neo-aligned-${previousPosition}`);
            subject.classList.add(positionCls)
        }

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
     * @param {String}  [data.modality] 'pointer' | 'keyboard' — explicit input-modality contract. :focus-visible
     * cannot tie an async worker→main programmatic focus back to the originating pointer gesture, so the caller
     * states it. Undefined preserves user-agent behavior.
     * @param {Boolean} [data.preventScroll=false]
     * @returns {Object} obj.id => the passed id
     */
    focus({children, id, modality, preventScroll}) {
        let node = this.getElement(id);

        if (node) {
            // The children property means focus inner elements if possible.
            if (!DomUtils.isFocusable(node) && children) {
                // query for the first focusable descendent
                node = DomUtils.query(node, DomUtils.isFocusable)
            }

            if (node) {
                // Modality is an explicit contract: :focus-visible cannot survive the async worker→main
                // programmatic focus (and a tabindex=-1 node has no reliable user-agent ring to fall back on).
                // The class is applied immediately before focus() so class + focus land atomically (no flash).
                // 'pointer' suppresses the accidental ring; the first keydown without an intervening blur swaps
                // it to the intentional keyboard ring; both self-clear on blur.
                if (modality === 'pointer') {
                    node.classList.add('neo-focus-pointer');

                    const onKeydown = () => {
                        node.classList.replace('neo-focus-pointer', 'neo-focus-keyboard');
                        node.removeEventListener('keydown', onKeydown)
                    };

                    const onBlur = () => {
                        node.classList.remove('neo-focus-pointer', 'neo-focus-keyboard');
                        node.removeEventListener('keydown', onKeydown);
                        node.removeEventListener('blur',    onBlur)
                    };

                    node.addEventListener('keydown', onKeydown);
                    node.addEventListener('blur',    onBlur)
                } else if (modality === 'keyboard') {
                    node.classList.add('neo-focus-keyboard');
                    node.classList.remove('neo-focus-pointer');

                    const onBlur = () => {
                        node.classList.remove('neo-focus-keyboard');
                        node.removeEventListener('blur', onBlur)
                    };

                    node.addEventListener('blur', onBlur)
                }

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
     * Returns the ids of a node's direct element children, in DOM order.
     * Consistency probe primitive: lets the App Worker compare its logical child order
     * (items / vdom) against the rendered DOM truth (e.g. duplicate-node detection).
     * @param {Object} data
     * @param {String} data.id
     * @returns {String[]|null} child ids (empty string for id-less nodes), or null if the node does not exist
     */
    getChildNodeIds(data) {
        let node = document.getElementById(data.id);

        return node ? Array.from(node.children).map(child => child.id) : null
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
     * @summary Returns transform-immune layout-box metrics for a given dom node id.
     *
     * `getBoundingClientRect()` reports VISUAL (post-transform) geometry: while a presentation
     * layer animates an ancestor (e.g. the DockFlip inverse-transform window), rect widths and
     * heights are scaled fiction. Layout consumers that persist sizes (grid column generation,
     * buffered mounting math) must read the LAYOUT box instead, which transforms never affect.
     *
     * The size contract, per node state:
     * - Rendered box: fractional computed used values, normalized to border-box when an element
     *   opts into content-box sizing.
     * - No generated box (`display: none`, `display: contents`, detached subtree): the zero
     *   shape — matching `getBoundingClientRect()`. Computed styles would report SPECIFIED
     *   sizes for boxless nodes (phantom boxes), so this path never reads them.
     * - Rendered box whose used value does not resolve to px (defensive narrowing): integer
     *   `offsetWidth`/`offsetHeight` — still layout-truth, reduced precision.
     *
     * x/y are offset-parent-relative (`offsetLeft`/`offsetTop`). Use this for size and
     * sibling-relative position semantics; use `getBoundingClientRect()` whenever viewport-space
     * coordinates are required.
     * @param {Object} data
     * @param {Array|String} data.id either an id or an array of ids
     * @returns {Object|Object[]} rect-shaped layout metrics ({x, y, left, top, right, bottom, width, height})
     */
    getLayoutRect(data) {
        let me = this;

        if (Array.isArray(data.id)) {
            return data.id.map(id => me.getLayoutRect({id}))
        }

        let node       = me.getElementOrBody(data.nodeType ? data : data.id),
            returnData = {};

        if (node) {
            if (node.getClientRects().length < 1) {
                return {x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0}
            }

            let style  = node.ownerDocument.defaultView.getComputedStyle(node),
                read   = property => parseFloat(style.getPropertyValue(property)) || 0,
                width  = parseFloat(style.getPropertyValue('width')),
                height = parseFloat(style.getPropertyValue('height')),
                x      = node.offsetLeft,
                y      = node.offsetTop;

            if (Number.isFinite(width) && Number.isFinite(height)) {
                // Used width/height track the box-sizing mode; normalize to border-box metrics
                if (style.getPropertyValue('box-sizing') === 'content-box') {
                    width  += read('padding-left') + read('padding-right')  + read('border-left-width') + read('border-right-width');
                    height += read('padding-top')  + read('padding-bottom') + read('border-top-width')  + read('border-bottom-width')
                }
            } else {
                width  = node.offsetWidth;
                height = node.offsetHeight
            }

            returnData = {x, y, left: x, top: y, right: x + width, bottom: y + height, width, height}
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
     * @summary Awaits one named CSS animation on a physical node through the browser's Animation API.
     *
     * App-worker components can be born with an animation class before their local DOM listeners
     * finish mounting. The main thread already owns the physical animation, so `Animation.finished`
     * is the race-free settlement authority. A missing, already-finished, or cancelled animation
     * resolves safely; presentation must never wedge projection truth.
     * @param {Object} data
     * @param {String} data.animationName CSS animation name to match on the node itself.
     * @param {String} data.id Physical DOM node id.
     * @returns {Promise<Boolean>} Whether a live named animation was observed.
     */
    async waitForAnimation({animationName, id}) {
        let animation = this.getElement(id)?.getAnimations?.()
            .find(candidate => candidate.animationName === animationName);

        if (!animation) {
            return false
        }

        try {
            await animation.finished
        } catch (error) {/* cancellation is settlement */}

        return true
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
        return new Promise((resolve, reject) => {
            this.createAndAppendElement('script', {
                ...opts,
                onerror: reject,
                onload : resolve,
                src
            })
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
        let me   = this,
            node = me.getElement(data.nodeId),
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
     * @summary Starts a view transition, optionally revealing the new state from a point.
     *
     * Resolves once the transition has STARTED, deliberately not once it has finished. The caller
     * applies its DOM change after this resolves, and `data.delay` is the window it has to do so
     * before the new state is captured. Awaiting `transition.ready` here would close that window,
     * and the transition would capture the unchanged DOM as both states.
     * @param {Object} data
     * @param {Object} [data.animate] Raw keyframes and options, passed to `animate()` unchanged
     * @param {Number} [data.delay=50] Milliseconds the caller has to apply its DOM change
     * @param {Object} [data.reveal] Origin for a circular reveal — see DomUtils.createRevealAnimation()
     * @returns {Promise<Boolean>} False when the browser has no View Transition API
     */
    async startViewTransition(data) {
        if (!document.startViewTransition) {
            return false
        }

        const animate    = data.animate || DomUtils.createRevealAnimation(data.reveal),
              transition = document.startViewTransition(async () => {
                  // `??`, not `||`: `delay: 0` is a caller asking for no window at all.
                  await this.timeout(data.delay ?? 50)
              });

        if (animate) {
            transition.ready.then(() => {
                document.documentElement.animate(animate.keyframes, animate.options)
            }).catch(error => {
                // Catches a rejected `ready` or a registration that throws — NOT a reveal that
                // registers and then rasterises wrongly, which is what actually happened here and
                // stays invisible to every runtime signal this method can read. The reveal is
                // decorative, so a failure must not reject the transition; it must not be silent
                // either, which is what returning success unconditionally amounted to.
                console.warn('Neo.main.DomAccess: the view transition reveal was not applied.', error)
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
            me        = this,
            {_aligns} = me,
            isScroll  = arg1?.type === 'scroll',
            evtTarget = isScroll ? arg1.target : null,
            // Document scroll (window) target is document.
            isDocScroll = isScroll && (evtTarget === document || evtTarget === document.documentElement);

        // Keep all registered aligns aligned on any detected change
        _aligns?.forEach(align => {
            const
                {targetElement} = align,
                targetPresent   = targetElement ? document.contains(targetElement) : Boolean(align.targetRect);

            // Align subject and target still in the DOM - correct its alignment
            if (document.contains(align.subject) && targetPresent) {
                // If it's a scroll event, optimization:
                if (isScroll && !isDocScroll) {
                    // If the scrolling element does NOT contain the reference target,
                    // then the reference target did not move relative to viewport.
                    const targetMoved = (targetElement && evtTarget.contains(targetElement)) ||
                        (align.constrainToElement && evtTarget.contains(align.constrainToElement));

                    if (!targetMoved) {
                        return // Skip this alignment
                    }
                }

                me.align(align)
            }
            // Align subject or target no longer in the DOM - remove it.
            else {
                // If target is no longer in the DOM, hide the subject component
                if (targetElement && !targetPresent) {
                    Neo.worker.App.setConfigs({ id: align.id, hidden: true })
                }

                const
                    {_alignResizeObserver} = me,
                    {constrainToElement}   = align;

                // Stop observing the align elements. `align.offsetParent` is the TARGET's layout parent
                // (null when the target is position:fixed or the body/root) — never observed in that case,
                // and unobserve(null) throws just like observe(null).
                _alignResizeObserver.unobserve(align.subject);
                align.offsetParent && _alignResizeObserver.unobserve(align.offsetParent);
                targetElement && _alignResizeObserver.unobserve(targetElement);
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
     * @summary Extracts an OffscreenCanvas and transfers it directly to the Canvas Worker.
     *
     * This method implements a "Triangular Communication" pattern required to bypass a core limitation in Firefox Nightly (and potentially other browsers) regarding SharedWorkers.
     * Firefox fails silently when attempting to transfer an `OffscreenCanvas` from the Main Thread to the App Worker (SharedWorker), and then again from the App Worker to the Canvas Worker.
     * By calling this method, the Main Thread extracts the canvas and sends it directly to the Canvas Worker, bypassing the App Worker entirely for the buffer transfer.
     *
     * @param {Object} data
     * @param {String} data.componentId
     * @param {String} data.nodeId
     */
    transferCanvasToWorker({componentId, nodeId}) {
        let me   = this,
            node = me.getElement(nodeId);

        if (node) {
            try {
                let offscreen = node.transferControlToOffscreen();

                Neo.worker.Manager.sendMessage('canvas', {
                    action: 'registerCanvasDirect',
                    componentId,
                    node  : offscreen,
                    nodeId
                }, [offscreen])
            } catch (e) {
                // Ignore, means the canvas was already transferred or we do not support it
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
