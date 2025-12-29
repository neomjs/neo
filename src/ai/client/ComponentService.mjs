import Service from './Service.mjs';

/**
 * Handles component-related Neural Link requests.
 * @class Neo.ai.client.ComponentService
 * @extends Neo.ai.client.Service
 */
class ComponentService extends Service {
    static config = {
        /**
         * @member {String} className='Neo.ai.client.ComponentService'
         * @protected
         */
        className: 'Neo.ai.client.ComponentService'
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    getComponentProperty(params) {
        const component = Neo.getComponent(params.id);
        if (!component) throw new Error(`Component not found: ${params.id}`);
        return {value: this.safeSerialize(component[params.property])};
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    getComponentTree(params) {
        return {tree: this.serializeComponent(this.getComponentRoot(params.rootId), params.depth || -1)};
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    getVdomTree(params) {
        const component = this.getComponentRoot(params.rootId);
        if (!component) throw new Error('Root component not found');
        return {vdom: component.vdom};
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    getVnodeTree(params) {
        const component = this.getComponentRoot(params.rootId);
        if (!component) throw new Error('Root component not found');
        return {vnode: component.vnode};
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    queryComponent(params) {
        let {selector, rootId} = params,
            matches = [];

        if (rootId) {
            const component = Neo.getComponent(rootId);
            if (!component) throw new Error(`Root component not found: ${rootId}`);
            matches = component.down(selector, false)
        } else {
            matches = Neo.manager.Component.find(selector)
        }

        if (!Array.isArray(matches)) {
            matches = matches ? [matches] : []
        }

        return {
            components: matches.map(c => ({
                id       : c.id,
                className: c.className,
                ntype    : c.ntype
            }))
        };
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    setComponentProperty(params) {
        const component = Neo.getComponent(params.id);
        if (!component) throw new Error(`Component not found: ${params.id}`);
        component[params.property] = params.value;
        return {success: true};
    }

    /**
     * @param {String} [rootId]
     * @returns {Neo.component.Base|null}
     */
    getComponentRoot(rootId) {
        if (rootId) {
            return Neo.getComponent(rootId)
        }

        const apps = Object.values(Neo.apps || {});

        if (apps.length > 0) {
            return apps[0].mainView
        }

        return null
    }

    /**
     * @param {Neo.component.Base} component
     * @param {Number} maxDepth
     * @param {Number} currentDepth
     * @returns {Object}
     */
    serializeComponent(component, maxDepth, currentDepth=1) {
        if (!component) return null;

        const result = {
            id       : component.id,
            className: component.className,
            ntype    : component.ntype
        };

        if (maxDepth === -1 || currentDepth < maxDepth) {
            const children = Neo.manager.Component.getChildren(component);

            if (children && children.length > 0) {
                result.items = children.map(child => this.serializeComponent(child, maxDepth, currentDepth + 1))
            }
        }

        return result
    }
}

export default Neo.setupClass(ComponentService);
