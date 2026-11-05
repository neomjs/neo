import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @summary Animates list membership from painted record positions across index-pooled wrapper reuse.
 * Captures before a delta batch and plays after it in the same task. The App Worker commits
 * membership immediately; this addon owns presentation only and never retains removed rows.
 * @class Neo.main.addon.ListMotion
 * @extends Neo.main.addon.Base
 */
class ListMotion extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.ListMotion'
         * @protected
         */
        className: 'Neo.main.addon.ListMotion',
        /**
         * Native registration lifecycle, scoped by owner token.
         * @member {Object} remote
         * @protected
         */
        remote: {app: ['register', 'unregister']}
    }

    /** @summary Owned animations and registration tokens, keyed by owner id. */
    owners = new Map()
    /** @summary Captures belong to one delta payload; failed batches never install effects. */
    batches = new WeakMap()
    /** @summary Live accessibility preference; CSS transition rules do not govern Web Animations. */
    reducedMotion = null
    /** @summary Lands owned effects when motion becomes unpresentable or is disabled. */
    onMotionPreference = () => {
        if (this.reducedMotion.matches || document.hidden) this.owners.forEach(state => this.cancel(state))
    }

    /**
     * @summary Subscribes to the native before/after apply boundary and motion preferences.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
        this.reducedMotion.addEventListener('change', this.onMotionPreference);
        document.addEventListener('visibilitychange', this.onMotionPreference);
        Neo.main.DeltaUpdates.on('update', this.onUpdate, this);
        Neo.main.DeltaUpdates.on('updated', this.onUpdated, this)
    }

    /**
     * @summary Registers a presentation owner; record identity is read from its rendered wrappers.
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.token Distinguishes registrations across plugin replacement and remount.
     */
    register({id, token}) {
        this.unregister({id});
        this.owners.set(id, {token, animations: new Map()})
    }

    /**
     * @summary Reads record identity from the rendered wrappers, excluding nested lists.
     * @param {String} rootId
     * @returns {Object[]}
     */
    readItems(rootId) {
        return [...(DomAccess.getElement(rootId)?.children || [])].flatMap(node => {
            const key = node.getAttribute('data-neo-list-record');
            return key === null ? [] : [{node, key}]
        })
    }

    /**
     * @summary Cancels only this addon's effects and restores its temporary transition overrides.
     * @param {Object} state
     */
    cancel(state) {
        [...state.animations.values()].forEach(entry => {
            entry.animation.cancel();
            this.release(state, entry)
        })
    }

    /**
     * @summary Releases a current effect without letting an old completion overwrite a successor.
     * @param {Object} state
     * @param {Object} entry
     */
    release(state, entry) {
        const {node, transition, priority} = entry;
        if (state.animations.get(node) !== entry) return;
        state.animations.delete(node);
        if (node.style.transition === 'none') node.style.setProperty('transition', transition, priority)
    }

    /**
     * @summary Removes an owner and any presentation still running on its nodes.
     * @param {Object} data
     * @param {String} data.id
     * @param {String} [data.token] Rejects retirement from an older registration.
     */
    unregister({id, token}) {
        const state = this.owners.get(id);
        if (state && (token === undefined || token === state.token)) {
            this.cancel(state);
            this.owners.delete(id)
        }
    }

    /**
     * @summary Captures computed transforms before wrappers receive their next record content.
     * Installs no new presentation styles: validation/application may still fail.
     * @param {Object} data The native DeltaUpdates payload.
     */
    onUpdate(data) {
        const batch = [];
        this.owners.forEach((state, id) => {
            const meta = data.meta?.[id]?.listMotion;
            if (!meta || meta.token !== state.token) return;
            const first = new Map();
            this.readItems(meta.rootId).forEach(({node, key}) => {
                const style = getComputedStyle(node);
                first.set(key, {node, transform: style.transform, opacity: style.opacity})
            });
            batch.push({id, state, meta, first})
        });
        this.batches.set(data, batch)
    }

    /**
     * @summary Lands current data, then retargets native motion from the captured painted origins.
     * A later owner update captures the running effect before canceling it, so interruption is continuous.
     * @param {Object} data The same payload whose deltas have now applied successfully.
     */
    onUpdated(data) {
        const batch = this.batches.get(data) || [];
        this.batches.delete(data);
        batch.forEach(({id, state, meta, first}) => {
            if (this.owners.get(id) !== state) return;
            if (this.reducedMotion.matches || document.hidden || !Number.isFinite(meta.duration) || meta.duration <= 0) {
                this.cancel(state);
                return
            }

            const items    = this.readItems(meta.rootId), current = new Map(items.map(item => [item.node, item.key]));
            const retarget = new Set();
            [...state.animations.values()].forEach(entry => {
                const {node, target} = entry;
                if (current.get(node) !== entry.key || node.style.transform !== target.transform ||
                    node.style.opacity !== target.opacity || node.className !== target.className) {
                    retarget.add(node);
                    entry.animation.cancel();
                    this.release(state, entry)
                }
            });

            items.forEach(({node, key}) => {
                if (!node || !node.animate || state.animations.has(node)) return;
                const prior = first.get(key);
                if (prior?.node === node && !retarget.has(node)) return;
                const transition = node.style.getPropertyValue('transition'), priority = node.style.getPropertyPriority('transition');
                let entry;
                try {
                    node.style.setProperty('transition', 'none', 'important');
                    const style = getComputedStyle(node), target = {transform: style.transform, opacity: style.opacity},
                        start   = {transform: prior?.transform || target.transform, opacity: prior?.opacity ?? '0'};
                    if (start.transform === target.transform && start.opacity === target.opacity) return;
                    const animation = node.animate([start, target], {duration: meta.duration, easing: meta.easing});
                    entry = {node, key, animation, transition, priority,
                        target: {transform: node.style.transform, opacity: node.style.opacity, className: node.className}};
                    state.animations.set(node, entry);
                    animation.finished.then(() => this.release(state, entry), () => this.release(state, entry))
                } finally {
                    if (!entry) node.style.setProperty('transition', transition, priority)
                }
            })
        })
    }

    /**
     * @summary Retires native observers and effects before releasing the addon.
     * @param {...*} args
     */
    destroy(...args) {
        this.owners.forEach(state => this.cancel(state));
        this.owners.clear();
        this.reducedMotion.removeEventListener('change', this.onMotionPreference);
        document.removeEventListener('visibilitychange', this.onMotionPreference);
        Neo.main.DeltaUpdates.un({update: this.onUpdate, updated: this.onUpdated, scope: this});
        super.destroy(...args)
    }
}

export default Neo.setupClass(ListMotion);
