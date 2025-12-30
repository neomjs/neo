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
     * @param {String} params.id
     * @param {String} params.property
     * @returns {Object}
     */
    getComponentProperty({id, property}) {
        const component = Neo.getComponent(id);
        if (!component) throw new Error(`Component not found: ${id}`);
        return {value: this.safeSerialize(component[property])};
    }

    /**
     * @param {Object}   params
     * @param {String[]} params.componentIds
     * @returns {Object}
     */
    async getDomRect({componentIds}) {
        if (!Array.isArray(componentIds) || componentIds.length === 0) {
            throw new Error('componentIds must be a non-empty array')
        }

        // Use the first component to resolve the windowId context
        const component = Neo.getComponent(componentIds[0]);

        if (!component) {
            throw new Error(`Component not found: ${componentIds[0]}`)
        }

        const rects = await component.getDomRect(componentIds);

        return {
            rects: Array.isArray(rects) ? rects : [rects]
        }
    }

    /**
     * @param {Object} params
     * @param {String} params.componentId
     * @param {Object} [params.options]
     * @returns {Object}
     */
    highlightComponent({componentId, options}) {
        let component = Neo.getComponent(componentId),
            originalStyle;

        if (!component) {
            throw new Error(`Component not found: ${componentId}`)
        }

        options = options || {};

        const
            color    = options.color    || 'red',
            duration = options.duration || 2000,
            mode     = options.style    || 'outline'; // 'outline' or 'box-shadow'

        originalStyle = component.style || {};

        let highlightStyle = {};

        if (mode === 'outline') {
            highlightStyle.outline       = `2px solid ${color}`;
            highlightStyle.outlineOffset = '-2px'
        } else {
            highlightStyle.boxShadow = `0 0 10px ${color}, inset 0 0 10px ${color}`
        }

        component.style = {...originalStyle, ...highlightStyle};

        this.timeout(duration).then(() => {
            component.style = originalStyle
        });

        return {success: true}
    }

    /**
     * @param {Object} params
     * @param {Number} [params.depth]
     * @param {String} [params.rootId]
     * @returns {Object}
     */
    getComponentTree({depth, rootId}) {
        return {tree: this.serializeComponent(this.getComponentRoot(rootId), depth || -1)}
    }

    /**
     * @param {Object} params
     * @param {String} [params.rootId]
     * @returns {Object}
     */
    getVdomTree({rootId}) {
        const component = this.getComponentRoot(rootId);
        if (!component) throw new Error('Root component not found');
        return {vdom: component.vdom}
    }

    /**
     * @param {Object} params
     * @param {String} [params.rootId]
     * @returns {Object}
     */
    getVnodeTree({rootId}) {
        const component = this.getComponentRoot(rootId);
        if (!component) throw new Error('Root component not found');
        return {vnode: component.vnode}
    }

    /**
     * @param {Object} params
     * @param {String} [params.rootId]
     * @param {Object} params.selector
     * @returns {Object}
     */
    queryComponent({rootId, selector}) {
        let matches = [];

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
        }
    }

    /**
     * @param {Object} params
     * @param {String} params.id
     * @param {String} params.property
     * @param {*}      params.value
     * @returns {Object}
     */
    setComponentProperty({id, property, value}) {
        const component = Neo.getComponent(id);
        if (!component) throw new Error(`Component not found: ${id}`);
        component[property] = value;
        return {success: true}
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

        if (component.stateProvider) {
            result.stateProviderId = component.stateProvider.id
        }

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
