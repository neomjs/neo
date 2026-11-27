import Component         from './Base.mjs';
import NeoArray          from '../util/Array.mjs';
import {isDescriptor}    from '../core/ConfigSymbols.mjs';
import {resolveCallback} from '../util/Function.mjs';

/**
 * @summary Presents a meaningful empty or no-results message with optional supporting guidance and a recovery action.
 *
 * Text-only configurations render a single semantic paragraph at full title prominence without empty decorative
 * wrappers. When `iconCls` is supplied, the glyph stays `aria-hidden="true"` so screen readers announce only the
 * consumer-owned message, optional `description`, and optional native `<button type="button">` recovery action.
 *
 * `EmptyState` intentionally extends `Neo.component.Base` with a native `<button>` rather than `Neo.container.Base`
 * composing `Neo.button.Base`: text-only and `removeDom`-toggled empty states pay zero container layout or child
 * component lifecycle cost, while `.neo-empty-state-action` inherits Neo's `--button-*` sizing/typography cascade and
 * `--button-secondary-*` surface tokens so it matches neighbouring `Neo.button.Base` controls on the same surface.
 * Pointer clicks and keyboard activation (`Enter` / `Space`) share the browser's native button path, invoke
 * `actionHandler` via `resolveCallback`, and emit the semantic `action` event. Pass `ui: 'plain'` when embedding
 * inside a surface that already draws its own border and padding.
 *
 * @class Neo.component.EmptyState
 * @extends Neo.component.Base
 */
class EmptyState extends Component {
    /**
     * Valid values for contentAlign
     * @member {String[]} contentAligns=['start','center']
     * @protected
     * @static
     */
    static contentAligns = ['start', 'center']

    static config = {
        /**
         * @member {String} className='Neo.component.EmptyState'
         * @protected
         */
        className: 'Neo.component.EmptyState',
        /**
         * @member {String} ntype='empty-state'
         * @protected
         */
        ntype: 'empty-state',
        /**
         * Content alignment inside the empty-state region: `'start'` for inline cards and banners, or `'center'`
         * when filling a master-detail pane or workspace stage.
         * @member {'center'|'start'} contentAlign_='start'
         * @reactive
         */
        contentAlign_: 'start',
        /**
         * Optional accessible name override (`aria-label`) for the recovery action button.
         * When `null`, assistive technology announces `actionText` directly.
         * @member {String|null} actionAriaLabel_=null
         * @reactive
         */
        actionAriaLabel_: null,
        /**
         * Callback invoked when the recovery action button is activated. Accepts a function or a string method name
         * resolved on the nearest `Neo.controller.Component` or ancestor (`'up.methodName'`).
         * Custom `isEqual` always treats two function references as unequal so re-bound closures with updated outer
         * state are never skipped, while identical string controller method names still short-circuit as no-ops.
         * @member {Function|String|null} actionHandler_=null
         * @reactive
         */
        actionHandler_: {
            [isDescriptor]: true,
            value         : null,

            isEqual: (a, b) => {
                if (Neo.isFunction(a) && Neo.isFunction(b)) {
                    return false
                }
                return a === b
            }
        },
        /**
         * Optional decorative icon CSS class(es) for the recovery action button, e.g. `'fa fa-xmark'`.
         * @member {String|String[]|null} actionIconCls_=null
         * @reactive
         */
        actionIconCls_: null,
        /**
         * Optional `this` scope for `actionHandler`. Defaults to the component or resolved controller scope.
         * @member {Object|null} actionScope=null
         */
        actionScope: null,
        /**
         * Label for the optional recovery action button. When `null` or empty, no action button is rendered.
         * @member {String|null} actionText_=null
         * @reactive
         */
        actionText_: null,
        /**
         * @member {String[]} baseCls=['neo-empty-state']
         */
        baseCls: ['neo-empty-state'],
        /**
         * Optional secondary guidance rendered below `text`. When `null` or empty, the node is omitted from the DOM.
         * @member {String|null} description_=null
         * @reactive
         */
        description_: null,
        /**
         * Optional decorative icon CSS class(es), e.g. `'fa fa-folder-open'`. Decorative artwork is never required.
         * @member {String|String[]|null} iconCls_=null
         * @reactive
         */
        iconCls_: null,
        /**
         * Primary empty-state message.
         * @member {String|null} text=null
         * @reactive
         */
        text: null,
        /**
         * Surface presentation variant: `null` renders a bordered surface card; `'plain'` omits outer border,
         * background, and padding for placement inside an already-framed container.
         * @member {'plain'|null} ui=null
         * @reactive
         */
        ui: null,
        /**
         * True registers delegated click handling for the recovery action button.
         * @member {Boolean} useDomListeners=true
         */
        useDomListeners: true,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [
                {tag: 'span', cls: ['neo-empty-state-glyph'], 'aria-hidden': 'true', removeDom: true},
                {tag: 'p',    cls: ['neo-empty-state-title'], removeDom: true},
                {tag: 'p',    cls: ['neo-empty-state-description'], removeDom: true},
                {tag: 'div',  cls: ['neo-empty-state-actions'], removeDom: true, cn: [
                    {tag: 'button', type: 'button', cls: ['neo-empty-state-action'], cn: [
                        {tag: 'span', cls: ['neo-empty-state-action-glyph'], 'aria-hidden': 'true', removeDom: true},
                        {tag: 'span', cls: ['neo-empty-state-action-text']}
                    ]}
                ]}
            ]
        }
    }

    /**
     * @returns {Object}
     */
    get actionButtonNode() {
        return this.actionsNode.cn[0]
    }

    /**
     * @returns {Object}
     */
    get actionIconNode() {
        return this.actionButtonNode.cn[0]
    }

    /**
     * @returns {Object}
     */
    get actionTextNode() {
        return this.actionButtonNode.cn[1]
    }

    /**
     * @returns {Object}
     */
    get actionsNode() {
        return this.getVdomRoot().cn[3]
    }

    /**
     * @returns {Object}
     */
    get descriptionNode() {
        return this.getVdomRoot().cn[2]
    }

    /**
     * @returns {Object}
     */
    get iconNode() {
        return this.getVdomRoot().cn[0]
    }

    /**
     * @returns {Object}
     */
    get titleNode() {
        return this.getVdomRoot().cn[1]
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (me.useDomListeners) {
            me.addDomListeners({
                click   : me.onActionClick,
                delegate: 'neo-empty-state-action',
                scope   : me
            })
        }
    }

    /**
     * @summary Updates alignment modifier classes when `contentAlign` changes.
     * @param {'center'|'start'} value
     * @param {'center'|'start'} oldValue
     * @protected
     */
    afterSetContentAlign(value, oldValue) {
        this.removeAddCls(oldValue ? `neo-align-${oldValue}` : [], value ? `neo-align-${value}` : [])
    }

    /**
     * @summary Updates or removes `aria-label` on the native recovery action button.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetActionAriaLabel(value, oldValue) {
        let button = this.actionButtonNode;

        if (value) {
            button['aria-label'] = value
        } else {
            delete button['aria-label']
        }

        this.update()
    }

    /**
     * @summary Updates the optional decorative glyph inside the recovery action button.
     * @param {String|String[]|null} value
     * @param {String|String[]|null} oldValue
     * @protected
     */
    afterSetActionIconCls(value, oldValue) {
        this.syncGlyphNode(this.actionIconNode, value, oldValue);
        this.update()
    }

    /**
     * @summary Renders or removes the native recovery action button based on `actionText`.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetActionText(value, oldValue) {
        let isEmpty = !value || value === '';

        this.actionsNode.removeDom = isEmpty;

        if (!isEmpty) {
            this.actionTextNode.text = value
        } else {
            delete this.actionTextNode.text
        }

        this.update()
    }

    /**
     * @summary Renders or removes the optional supporting description paragraph.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetDescription(value, oldValue) {
        let node    = this.descriptionNode,
            isEmpty = !value || value === '';

        node.removeDom = isEmpty;

        if (!isEmpty) {
            node.text = value
        } else {
            delete node.text
        }

        this.update()
    }

    /**
     * @summary Mirrors component disabled state onto the native recovery `<button>`.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        super.afterSetDisabled(value, oldValue);

        let button = this.actionButtonNode;

        if (value) {
            button.disabled = true
        } else {
            delete button.disabled
        }

        this.update()
    }

    /**
     * @summary Updates or removes the optional decorative empty-state icon.
     * @param {String|String[]|null} value
     * @param {String|String[]|null} oldValue
     * @protected
     */
    afterSetIconCls(value, oldValue) {
        this.syncGlyphNode(this.iconNode, value, oldValue);
        this.update()
    }

    /**
     * @summary Renders or removes the primary message paragraph without writing text onto the root wrapper.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetText(value, oldValue) {
        let node    = this.titleNode,
            isEmpty = !value || value === '';

        node.removeDom = isEmpty;

        if (!isEmpty) {
            node.text = value
        } else {
            delete node.text
        }

        this.update()
    }

    /**
     * @summary Validates `contentAlign` against `EmptyState.contentAligns`.
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetContentAlign(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'contentAlign')
    }

    /**
     * @summary Dispatches `actionHandler` and emits `action` when the native recovery button is activated.
     * @param {Object} data
     * @protected
     */
    onActionClick(data) {
        let me = this;

        if (!me.disabled && me.actionText) {
            let payload = {component: me, domEvent: data};

            if (me.actionHandler) {
                let {fn, scope} = resolveCallback(me.actionHandler, me.actionScope || me);
                fn?.call(scope, payload)
            }

            me.fire('action', payload)
        }
    }

    /**
     * @summary Normalizes string or array icon class tokens onto a decorative glyph VNode.
     * @param {Object} node
     * @param {String|String[]|null} value
     * @param {String|String[]|null} oldValue
     * @protected
     */
    syncGlyphNode(node, value, oldValue) {
        let oldTokens = Array.isArray(oldValue) ? oldValue : oldValue ? oldValue.split(/\s+/).filter(Boolean) : [],
            newTokens = Array.isArray(value)    ? value    : value    ? value.split(/\s+/).filter(Boolean)    : [];

        oldTokens.length > 0 && NeoArray.remove(node.cls, oldTokens);

        if (newTokens.length === 0) {
            node.removeDom = true
        } else {
            node.removeDom = false;
            NeoArray.add(node.cls, newTokens)
        }
    }
}

/**
 * Fires when the optional recovery action button is activated via pointer or keyboard.
 * @event action
 * @param {Neo.component.EmptyState} component
 * @param {Object} domEvent
 */

export default Neo.setupClass(EmptyState);
