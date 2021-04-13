import Base             from './Base.mjs';
import ComponentManager from '../manager/Component.mjs';
import DomEventManager  from '../manager/DomEvent.mjs';
import Logger           from '../core/Logger.mjs';

/**
 * @class Neo.controller.Component
 * @extends Neo.controller.Base
 */
class Component extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.controller.Component'
         * @protected
         */
        className: 'Neo.controller.Component',
        /**
         * @member {String} ntype='component-controller'
         * @protected
         */
        ntype: 'component-controller',
        /**
         * @member {Object} component=null
         * @protected
         */
        component: null,
        /**
         * @member {Neo.controller.Component|null} parent_=null
         */
        parent_: null,
        /**
         * @member {Object} references=null
         * @protected
         */
        references: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.references = {};

        if (me.component.isConstructed) {
            me.onViewConstructed();
        } else {
            me.component.on('constructed', () => {
                me.onViewConstructed();
            });
        }
    }

    /**
     * Triggered before the parent config gets changed
     * @param {Neo.controller.Component|null} value
     * @param {Neo.controller.Component|null} oldValue
     * @protected
     */
    beforeSetParent(value, oldValue) {
        if (!value) {
            return this.getParent();
        }

        return value;
    }

    /**
     * sameLevelOnly=false will return the closest VM inside the component parent tree,
     * in case there is none on the same level.
     * @param {Boolean} [sameLevelOnly=false]
     */
    getModel(sameLevelOnly=false) {
        if (sameLevelOnly) {
            return this.component.model;
        }

        return this.component.getModel();
    }

    /**
     * Get the closest controller inside the components parent tree
     * @returns {Neo.controller.Component|null}
     */
    getParent() {
        let me = this,
            parentComponent, parentId;

        if (me.parent) {
            return me.parent;
        }

        parentId        = me.component.parentId;
        parentComponent = parentId && Neo.getComponent(parentId);

        return parentComponent && parentComponent.getController() || null;
    }

    /**
     *
     * @param {String} handlerName
     * @returns {Neo.controller.Component|null}
     */
    getParentHandlerScope(handlerName) {
        let me        = this,
            component = me.component,
            parents   = ComponentManager.getParents(component),
            i         = 0,
            len       = parents.length,
            controller;

        for (; i < len; i++) {
            controller = parents[i].controller;

            if (controller && controller[handlerName]) {
                return controller;
            }
        }

        return null;
    }

    /**
     * todo: cleanup no longer existing references
     * todo: update changed references (e.g. container.remove() then container.add() using the same key)
     * @param {String} name
     * @returns {*}
     */
    getReference(name) {
        let me          = this,
            componentId = me.references[name],
            component;

        if (componentId) {
            component = Neo.getComponent(componentId);
        }

        if (!component) {
            component = me.component.down({reference: name});

            if (component) {
                me.references[name] = component.id;
            }
        }

        return component || null;
    }

    /**
     * Override this method inside your view controllers as a starting point in case you need references
     * (instead of using onConstructed() inside your controller)
     */
    onViewConstructed() {}

    /**
     *
     * @param {Neo.component.Base} [component=this.component]
     */
    parseConfig(component=this.component) {
        let me           = this,
            domListeners = component.domListeners,
            listeners    = component.listeners,
            reference    = component.reference,
            domEventOpts, eventHandler, fn, parentController;

        if (domListeners) {
            domListeners.forEach(domListener => {
                Object.entries(domListener).forEach(([key, value]) => {
                    eventHandler = null;

                    if (key !== 'scope' && key !== 'delegate') {
                        if (Neo.isString(value)) {
                            eventHandler = value;
                        } else if (Neo.isObject(value) && value.hasOwnProperty('fn') && Neo.isString(value.fn)) {
                            eventHandler = value.fn;
                        }

                        if (eventHandler) {
                            domEventOpts = {
                                componentId     : component.id,
                                eventHandlerName: eventHandler,
                                eventName       : key,
                                scope           : parentController
                            };

                            if (!me[eventHandler]) {
                                parentController = me.getParentHandlerScope(eventHandler);

                                if (!parentController) {
                                    Logger.logError('Unknown domEvent handler for', component, eventHandler);
                                } else {
                                    fn               = parentController[eventHandler].bind(parentController);
                                    domListener[key] = fn;

                                    DomEventManager.updateListenerPlaceholder({
                                        ...domEventOpts,
                                        eventHandlerMethod: fn
                                    });
                                }
                            } else {
                                fn               = me[eventHandler].bind(me);
                                domListener[key] = fn;

                                DomEventManager.updateListenerPlaceholder({
                                    ...domEventOpts,
                                    eventHandlerMethod: fn
                                });
                            }
                        }
                    }
                });
            });
        }

        if (listeners) {
            Object.entries(listeners).forEach(([key, value]) => {
                if (key !== 'scope' && key !== 'delegate') {
                    value.forEach(listener => {
                        eventHandler = null;

                        if (Neo.isObject(listener) && listener.hasOwnProperty('fn') && Neo.isString(listener.fn)) {
                            eventHandler = listener.fn;

                            if (!me[eventHandler]) {
                                Logger.logError('Unknown event handler for', component, eventHandler);
                            } else {
                                listener.fn = me[eventHandler].bind(me);
                            }
                        }
                    });
                }
            });
        }

        if (reference) {
            me.references[reference] = component.id;
        }
    }
}

Neo.applyClassConfig(Component);

export {Component as default};