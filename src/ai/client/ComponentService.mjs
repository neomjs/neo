import Service     from './Service.mjs';
import TreeBuilder from '../../util/vdom/TreeBuilder.mjs';
import VdomUtil    from '../../util/VDom.mjs';

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
     * @param {Object}   params
     * @param {String}   params.componentId
     * @param {String[]} params.variables
     * @returns {Object}
     */
    async getComputedStyles({componentId, variables}) {
        const component = Neo.getComponent(componentId);

        if (!component) {
            throw new Error(`Component not found: ${componentId}`)
        }

        const styles = await Neo.main.DomAccess.getComputedStyle({
            id   : component.id,
            style: variables
        });

        return {styles}
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
     * @param {Number} [params.depth]
     * @param {String} [params.rootId]
     * @returns {Object}
     */
    getVdomTree({depth, rootId}) {
        const component = this.getComponentRoot(rootId);
        if (!component) throw new Error('Root component not found');
        return {vdom: TreeBuilder.getVdomTree(component.vdom, depth)}
    }

    /**
     * @param {Object} params
     * @param {Number} [params.depth]
     * @param {String} [params.rootId]
     * @returns {Object}
     */
    getVnodeTree({depth, rootId}) {
        const component = this.getComponentRoot(rootId);
        if (!component) throw new Error('Root component not found');
        return {vnode: TreeBuilder.getVnodeTree(component.vnode, depth)}
    }

    /**
     * @param {Object} params
     * @param {Number} [params.depth]
     * @param {String} [params.rootId]
     * @returns {Object}
     */
    getVdomVnode({depth, rootId}) {
        const component = this.getComponentRoot(rootId);
        if (!component) throw new Error('Root component not found');
        return {
            vdom : TreeBuilder.getVdomTree(component.vdom, depth),
            vnode: TreeBuilder.getVnodeTree(component.vnode, depth)
        }
    }

    /**
     * @param {Object}   params
     * @param {String}   [params.rootId]
     * @param {Object}   params.selector
     * @param {String[]} [params.returnProperties]
     * @returns {Object}
     */
    queryComponent({rootId, selector, returnProperties}) {
        let matches;

        if (rootId) {
            const component = Neo.getComponent(rootId);
            if (!component) throw new Error(`Root component not found: ${rootId}`);
            matches = component.down(selector, false)
        } else {
            matches = Neo.manager.Component.find(selector)
        }

        const components = matches.map(c => {
            if (Array.isArray(returnProperties) && returnProperties.length > 0) {
                const props = {};
                returnProperties.forEach(prop => {
                    props[prop] = this.safeSerialize(c[prop])
                });

                return {
                    className : c.className,
                    id        : c.id,
                    properties: props
                }
            }

            return c.toJSON()
        });

        return {components}
    }

    /**
     * @param {Object} params
     * @param {String} [params.rootId]
     * @param {Object} params.selector
     * @returns {Object}
     */
    queryVdom({rootId, selector}) {
        const component = this.getComponentRoot(rootId);
        if (!component) throw new Error('Root component not found');

        const result = VdomUtil.find(component.vdom, selector);

        return {
            vdom    : result?.vdom || null,
            index   : result?.index,
            parentId: result?.parentNode?.id
        }
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

        const result = component.toJSON();

        if (maxDepth === -1 || currentDepth < maxDepth) {
            const children = Neo.manager.Component.getChildComponents(component);

            if (children && children.length > 0) {
                result.items = children.map(child => this.serializeComponent(child, maxDepth, currentDepth + 1))
            }
        }

        return result
    }
}

export default Neo.setupClass(ComponentService);
