import Base             from '../core/Base.mjs';
import ComponentManager from '../manager/Component.mjs';
import DomEvents        from '../mixin/DomEvents.mjs';
import Observable       from '../core/Observable.mjs';
import VdomLifecycle    from '../mixin/VdomLifecycle.mjs';

/**
 * @class Neo.component.Abstract
 * @extends Neo.core.Base
 * @mixes Neo.component.mixin.DomEvents
 * @mixes Neo.core.Observable
 * @mixes Neo.component.mixin.VdomLifecycle
 */
class Abstract extends Base {
    static config = {
        /**
         * @member {String} className='Neo.component.Abstract'
         * @protected
         */
        className: 'Neo.component.Abstract',
        /**
         * @member {String} ntype='abstract-component'
         * @protected
         */
        ntype: 'abstract-component',
        /**
         * The name of the App this component belongs to
         * @member {String|null} appName_=null
         * @reactive
         */
        appName_: null,
        /**
         * Custom CSS selectors to apply to the root level node of this component
         * @member {String[]} cls_=null
         * @reactive
         */
        cls_: null,
        /**
         * Disabled components will get the neo-disabled cls applied and won't receive DOM events
         * @member {Boolean} disabled_=false
         * @reactive
         */
        disabled_: false,
        /**
         * @member {Neo.core.Base[]} mixins=[DomEvents, Observable, VdomLifecycle]
         */
        mixins: [DomEvents, Observable, VdomLifecycle],
        /**
         * True after the component render() method was called. Also fires the rendered event.
         * @member {Boolean} mounted_=false
         * @protected
         * @reactive
         */
        mounted_: false,
        /**
         * @member {String|null} parentId_=null
         * @protected
         * @reactive
         */
        parentId_: null,
        /**
         * The custom windowIs (timestamp) this component belongs to
         * @member {Number|null} windowId_=null
         * @reactive
         */
        windowId_: null
    }

    /**
     * Internal flag which will get set to true while a component is waiting for its mountedPromise
     * @member {Boolean} isAwaitingMount=false
     * @protected
     */
    isAwaitingMount = false

    /**
     * Convenience shortcut to access the App this component belongs to
     * @returns {Neo.controller.Application|null}
     */
    get app() {
        return Neo.apps[this.appName] || null
    }

    /**
     * A Promise that resolves when the component is mounted to the DOM.
     * This provides a convenient way to wait for the component to be fully
     * available and interactive before executing subsequent logic.
     *
     * It also handles unmounting by resetting the promise, so it can be safely
     * awaited again if the component is remounted.
     * @returns {Promise<Neo.component.Base>}
     */
    get mountedPromise() {
        let me = this;

        if (!me._mountedPromise) {
            me._mountedPromise = new Promise(resolve => {
                if (me.mounted) {
                    resolve(me);
                } else {
                    me.mountedPromiseResolve = resolve
                }
            })
        }

        return me._mountedPromise
    }

    /**
     * Convenience method to access the parent component
     * @returns {Neo.component.Base|null}
     */
    get parent() {
        let me = this;

        return me.parentComponent || (me.parentId === 'document.body' ? null : Neo.getComponent(me.parentId))
    }

    /**
     * Triggered after the id config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        super.afterSetId(value, oldValue);

        oldValue && ComponentManager.unregister(oldValue);
        value    && ComponentManager.register(this)
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        if (oldValue !== undefined) {
            const me = this;

            if (value) { // mount
                me.initDomEvents?.();
                me.mountedPromiseResolve?.(this);
                delete me.mountedPromiseResolve
            } else { // unmount
                delete me._mountedPromise
            }
        }
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        const me = this;

        if (value) {
            Neo.currentWorker.insertThemeFiles(value, me.__proto__)
        }

        // If a component gets moved into a different window, an update cycle might still be running.
        // Since the update might no longer get mapped, we want to re-enable this instance for future updates.
        if (oldValue) {
            me.isVdomUpdating = false
        }
    }

    /**
     *
     */
    destroy() {
        this.removeDomEvents();
        ComponentManager.unregister(this);
        super.destroy()
    }

    /**
     * Change multiple configs at once, ensuring that all afterSet methods get all new assigned values
     * @param {Object} values={}
     * @param {Boolean} silent=false
     * @returns {Promise<*>}
     */
    set(values={}, silent=false) {
        const
            me        = this,
            wasHidden = me.hidden;

        me.setSilent(values);

        if (!silent && me.needsVdomUpdate) {
            if (wasHidden && !me.hidden) {
                me.show?.(); // show() is not part of the abstract base class
                return Promise.resolve()
            }

            return me.promiseUpdate()
        }

        return Promise.resolve()
    }

    /**
     * A silent version of set(), which does not trigger a vdom update at the end.
     * Useful for batching multiple config changes.
     * @param {Object} values={}
     */
    setSilent(values={}) {
        this.silentVdomUpdate = true;
        super.set(values);
        this.silentVdomUpdate = false
    }
}

export default Neo.setupClass(Abstract);
