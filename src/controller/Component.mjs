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
         * @member {String} ntype='view-controller'
         * @protected
         */
        ntype: 'component-controller',
        /**
         * @member {Object} references=null
         * @protected
         */
        references: null,
        /**
         * @member {Object} view_=null
         * @protected
         */
        view_: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.references = {};

        /*if (me.view.isConstructed) {
            me.onViewConstructed();
        } else {
            me.view.on('constructed', () => {
                me.onViewConstructed();
            });
        }*/

        console.log('constructor', this.view.id);
    }

    /**
     * Triggered when accessing the view config
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    beforeGetView(value, oldValue) {
        return Neo.get(value);
    }

    /**
     * Triggered before the view config gets changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    beforeSetView(value, oldValue) {
        return value.id;
    }

    /**
     * sameLevelOnly=false will return the closest VM inside the component parent tree,
     * in case there is none on the same level.
     * @param {Boolean} [sameLevelOnly=false]
     */
    getModel(sameLevelOnly=false) {
        if (sameLevelOnly) {
            return this.view.model;
        }

        return this.view.getModel();
    }

    /**
     *
     * @param {String} [ntype]
     * @returns {Neo.controller.Component|null}
     */
    getParent(ntype) {
        let me      = this,
            view    = me.view,
            parents = ComponentManager.getParents(view),
            i       = 0,
            len     = parents.length,
            controller;

        for (; i < len; i++) {
            controller = parents[i].controller;

            if (controller) {
                if (ntype) {
                    if (ntype === controller.ntype) {
                        return controller;
                    }
                } else {
                    return controller;
                }
            }
        }

        return null;
    }

    /**
     *
     * @param {String} handlerName
     * @returns {Neo.controller.Component|null}
     */
    getParentHandlerScope(handlerName) {
        let me      = this,
            view    = me.view,
            parents = ComponentManager.getParents(view),
            i       = 0,
            len     = parents.length,
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
            component = me.view.down({reference: name});

            if (component) {
                me.references[name] = component.id;
            }
        }

        return component || null;
    }

    /**
     *
     * @param {Neo.component.Base} [view=null]
     */
    onViewConstructed(view=null) {
        let me        = this,
            childCall = !!view,
            domListeners, eventHandler, fn, parentController;

        view = view || me.view;

        view.domListeners = Neo.clone(view.domListeners, true, true); // ensure there is no interference on prototype level
        domListeners = view.domListeners;

        if (domListeners) {
            console.log('onViewConstructed', childCall, view.id, domListeners);

            if (!Array.isArray(domListeners)) {
                domListeners = [domListeners];
            }

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
                            if (!me[eventHandler]) {
                                parentController = me.getParentHandlerScope(eventHandler);

                                if (!parentController) {
                                    Logger.logError('Unknown domEvent handler for', view, eventHandler);
                                } else {
                                    fn               = parentController[eventHandler].bind(parentController);
                                    domListener[key] = fn;

                                    DomEventManager.updateListenerPlaceholder({
                                        componentId       : view.id,
                                        eventHandlerMethod: fn,
                                        eventHandlerName  : eventHandler,
                                        eventName         : key,
                                        scope             : parentController
                                    });
                                }
                            } else {
                                fn               = me[eventHandler].bind(me);
                                domListener[key] = fn;

                                DomEventManager.updateListenerPlaceholder({
                                    componentId       : view.id,
                                    eventHandlerMethod: fn,
                                    eventHandlerName  : eventHandler,
                                    eventName         : key,
                                    scope             : me
                                });
                            }
                        }
                    }
                });
            });
        }

        if (view.items) {
            view.items.forEach(item => {
                if (!item.controller) {
                    me.onViewConstructed(item);
                }
            });
        }

        if (!childCall) {
            me.onViewParsed();
        }
    }

    /**
     * Override this method inside your view controllers as a starting point in case you need references
     * (instead of using onConstructed() inside your controller)
     */
    onViewParsed() {
        console.log('onViewParsed', this.view.id);
    }

    /**
     *
     * @param {Neo.component.Base} [component=this.view]
     */
    parseConfig(component=this.view) {
        let me           = this,
            domListeners = component.domListeners,
            eventHandler, fn, parentController;

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
                            if (!me[eventHandler]) {
                                parentController = me.getParentHandlerScope(eventHandler);

                                if (!parentController) {
                                    Logger.logError('Unknown domEvent handler for', view, eventHandler);
                                } else {
                                    fn               = parentController[eventHandler].bind(parentController);
                                    domListener[key] = fn;

                                    DomEventManager.updateListenerPlaceholder({
                                        componentId       : view.id,
                                        eventHandlerMethod: fn,
                                        eventHandlerName  : eventHandler,
                                        eventName         : key,
                                        scope             : parentController
                                    });
                                }
                            } else {
                                fn               = me[eventHandler].bind(me);
                                domListener[key] = fn;

                                DomEventManager.updateListenerPlaceholder({
                                    componentId       : component.id,
                                    eventHandlerMethod: fn,
                                    eventHandlerName  : eventHandler,
                                    eventName         : key,
                                    scope             : me
                                });
                            }
                        }
                    }
                });
            });
        }

        if (component.listeners) {
            Object.entries(component.listeners).forEach(([key, value]) => {
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
    }
}

Neo.applyClassConfig(Component);

export {Component as default};