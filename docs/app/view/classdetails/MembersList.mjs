import Base       from '../../../../src/list/Base.mjs';
import Collection from '../../../../src/collection/Base.mjs';

/**
 * @summary Displays selected class and mixin members with their source and composition precedence.
 * @class Docs.view.classdetails.MembersList
 * @extends Neo.list.Base
 */
class MembersList extends Base {
    static config = {
        /**
         * @member {String} className='Docs.view.classdetails.MembersList'
         * @protected
         */
        className: 'Docs.view.classdetails.MembersList',
        /**
         * @member {String} ntype='classdetails-memberslist'
         * @protected
         */
        ntype: 'classdetails-memberslist',
        /**
         * @member {String[]} baseCls=['docs-classhierarchy-memberslist']
         */
        baseCls: ['docs-classhierarchy-memberslist'],
        /**
         * @member {String} filterMembersQuery_=''
         * @protected
         * @reactive
         */
        filterMembersQuery_: '',
        /**
         * @member {Boolean} showPrivateMembers_=true
         * @reactive
         */
        showPrivateMembers_: true,
        /**
         * @member {Boolean} showProtectedMembers_=true
         * @reactive
         */
        showProtectedMembers_: true,
        /**
         * @member {Boolean} showStaticMembers_=true
         * @reactive
         */
        showStaticMembers_: true,
        /**
         * @member {Neo.collection.Base} store=null
         * @reactive
         */
        store: null,
        /**
         * @member {String|null} targetClassName=null
         */
        targetClassName: null,
        /**
         * @member {Object} _vdom={cn: []}
         */
        _vdom:
            {cn: []}
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me            = this,
            hierarchyView = me.up('classdetails-maincontainer').down('classhierarchy-treelist'),
            mainStore     = me.up('main-container').store;

        hierarchyView.on({
            refreshClassMembers: me.onRefreshClassMembers,
            scope              : me
        });

        me.store = Neo.create(Collection, {
            filterMode: 'advanced',
            sourceId  : mainStore.id
        });

        me.onRefreshClassMembers()
    }

    /**
     * Triggered after the filterMembersQuery config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetFilterMembersQuery(value, oldValue) {
        oldValue !== undefined && this.onRefreshClassMembers()
    }

    /**
     * Triggered after the showProtectedMembers config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowProtectedMembers(value, oldValue) {
        oldValue !== undefined && this.onRefreshClassMembers()
    }

    /**
     * Triggered after the showPrivateMembers config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowPrivateMembers(value, oldValue) {
        oldValue !== undefined && this.onRefreshClassMembers()
    }

    /**
     * Triggered after the showStaticMembers config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowStaticMembers(value, oldValue) {
        oldValue !== undefined && this.onRefreshClassMembers()
    }

    /**
     *
     * @param {Neo.collection.Base} store
     * @param {Object} vdom
     * @returns {Object} vdom
     */
    applyConfigsHeader(store, vdom) {
        if (store.getAt(0)?.kind === 'member') {
            vdom.cn.push({
                // scrolling placeholder
            }, {
                cls : ['neo-docs-memberlist-group-header'],
                html: 'Configs',
                'data-list-header': 'Configs'
            })
        }

        return vdom
    }

    /**
     *
     * @param {Object} item
     * @param {Number} index
     * @param {Neo.collection.Base} store
     * @param {Object} vdom
     * @returns {Object} vdom
     */
    applyEventsHeader(item, index, store, vdom) {
        if (
            item.kind === 'event' &&
            store.getAt(index -1)?.kind !== 'event'
        ) {
            vdom.cn.push({
                // scrolling placeholder
            }, {
                cls  : ['neo-docs-memberlist-group-header'],
                html : 'Events',
                style: {zIndex: 3},
                'data-list-header': 'Events'
            })
        }

        return vdom
    }

    /**
     *
     * @param {Object} item
     * @param {Number} index
     * @param {Neo.collection.Base} store
     * @param {Object} vdom
     * @returns {Object} vdom
     */
    applyMethodsHeader(item, index, store, vdom) {
        if (
            item.kind === 'function' &&
            (
                !store.getAt(index -1) || (
                    store.getAt(index -1)?.kind !== 'function'
                )
            )
        ) {
            vdom.cn.push({
                // scrolling placeholder
            }, {
                cls  : ['neo-docs-memberlist-group-header'],
                html : 'Methods',
                style: {zIndex: 2},
                'data-list-header': 'Methods'
            })
        }

        return vdom
    }

    /**
     * @summary Renders member documentation without changing the source doclets used by later filtering.
     */
    createItems() {
        let me                 = this,
            filterMembersRegEx = new RegExp(me.filterMembersQuery || '', 'gi'),
            hasExamples        = false,
            mixinSources       = new Set(me.up('classdetails-maincontainer').down('classhierarchy-treelist').store.items
                .filter(source => source.isMixin).map(source => source.sourceClassName)),
            targetClassName    = me.targetClassName,
            vdom               = me.vdom,
            headerText, itemAttributes, itemConfig, path;

        vdom.cn = [];
        vdom = me.applyConfigsHeader(me.store, vdom);

        me.store.forEach((item, index) => {
            vdom = me.applyEventsHeader( item, index, me.store, vdom);
            vdom = me.applyMethodsHeader(item, index, me.store, vdom);

            itemAttributes = [];
            let memberName = item.name;

            if (memberName.substr(-1) === '_') {
                memberName = memberName.slice(0, -1);
                itemAttributes.push('GS')
            }

            if (item.neoClassName !== targetClassName) {
                itemAttributes.push(mixinSources.has(item.neoClassName) ? 'mixin' : 'inherited')
            }

            if (item.access === 'private' || item.access === 'protected') {
                itemAttributes.push(item.access)
            }

            if (item.scope === 'static') {
                itemAttributes.push('static')
            }

            headerText = memberName;

            if (me.filterMembersQuery !== '' && me.filterMembersQuery !== null) {
                headerText = headerText.replace(filterMembersRegEx, match => `<span class="neo-highlight-search">${match}</span>`)
            }

            // configs
            if (item.type?.names) {
                headerText += (': {' + MembersList.escapeHtml(item.type.names.join('|')) + '}')
            }

            if (Object.hasOwn(item, 'defaultvalue')) {
                headerText += (' = ' + item.defaultvalue)
            }

            // methods
            if (item.params && item.kind !== 'event') {
                if (item.$kind === 'property') {
                    headerText = 'get ' + headerText
                }

                headerText += ('(' + item.params.reduce((result, param) => {
                    if (param.name.indexOf('.') < 0) {
                        if (param.optional) {
                            result.push('[' + param.name + ']')
                        } else {
                            result.push(param.name)
                        }
                    }
                    return result
                }, []).join(', ') + ')')
            }

            if (item.returns?.[0].type) {
                headerText += (' → {' + MembersList.escapeHtml(item.returns[0].type.names.join('|') + '}'))
            }

            path = item.meta.srcPath;

            itemConfig = {
                cls: ['neo-list-item'],
                cn : [{
                    cls: ['neo-list-item-header-container'],
                    cn : [{
                        cls : ['neo-list-item-header'],
                        html: headerText
                    }, {
                        style: {
                            flex: 1
                        }
                    }, {
                        cls : ['neo-list-item-header'],
                        html: itemAttributes.join(', ')
                    }]
                }, {
                    cls: 'neo-docs-view-source-link-container',
                    cn :[{
                        tag : 'a',
                        cls : ['neo-docs-view-source-link'],
                        href: `#/viewSource/${item.neoClassName}/line/${item.meta.lineno}`,
                        html: `Source: ${path} (Line ${item.meta.lineno})`
                    }]
                }, {
                    html: item.description
                }]
            };

            if (item.examples?.length > 0) {
                hasExamples = true;

                item.examples.forEach(example => {
                    itemConfig.cn.push({
                        tag: 'pre',
                        cls: ['hljs'],
                        cn : [{
                            tag : 'code',
                            html: example
                        }]
                    })
                })
            }

            if (item.params?.length > 0) {
                itemConfig.cn.push(MembersList.createParametersTable(item.params))
            }

            if (item.returns?.[0].type && item.kind !== 'event') {
                itemConfig.cn.push({
                    html: 'Returns {' + MembersList.escapeHtml(item.returns[0].type.names.join('|') + '} ') + (item.returns[0].description || '')
                })
            }

            vdom.cn.push(itemConfig)
        });

        me.update();

        me.timeout(100).then(() => {
            Neo.main.addon.HighlightJS.syntaxHighlightInit({windowId: me.windowId})
        })
    }

    /**
     *
     * @param {Object} params
     * @returns {Object} vdom
     */
    static createParametersTable(params) {
        let hasDefaultValues  = false,
            hasOptionalParams = false,
            description, nestedParams, paramTable;

        params.forEach(param => {
            if (Object.hasOwn(param, 'defaultvalue')) {
                hasDefaultValues = true
            }

            if (Object.hasOwn(param, 'optional')) {
                hasOptionalParams = true
            }
        });

        paramTable = {
            tag: 'table',
            cls: 'docs-param-table',
            cn : [{
                tag: 'thead',
                cn : [{
                    tag : 'th',
                    html: 'Name'
                }, {
                    tag : 'th',
                    html: 'Type'
                }, {
                    tag : 'th',
                    html: 'Description'
                }]
            }]
        };

        if (hasDefaultValues) {
            paramTable.cn[0].cn.splice(2, 0, {
                tag : 'th',
                html: 'Default'
            })
        }

        if (hasOptionalParams) {
            paramTable.cn[0].cn.splice(2, 0, {
                tag : 'th',
                html: 'Optional'
            })
        }

        params.forEach(param => {
            if (param.name.indexOf('.') < 0) { // ignore nested params
                description = {
                    tag : 'td',
                    html: param.description
                };
                nestedParams = [];

                params.forEach(p => {
                    if (p.name.indexOf(param.name + '.') === 0) {
                        p = Neo.clone(p, true);

                        p.name = p.name.split('.');
                        p.name.shift();
                        p.name = p.name.join('.');

                        nestedParams.push(p);
                    }
                });

                if (nestedParams.length > 0) {
                    description = {
                        tag: 'td',
                        cn : [
                            {html: description.html},
                            MembersList.createParametersTable(nestedParams)
                        ]
                    }
                }

                paramTable.cn.push({
                    tag: 'tr',
                    cn : [
                        {tag: 'td', html: param.name},
                        {tag: 'td', html: param.type ? MembersList.escapeHtml(param.type.names.join(' | ')) : ''},
                        description
                    ]
                });

                if (hasDefaultValues) {
                    paramTable.cn[paramTable.cn.length - 1].cn.splice(2, 0, {
                        tag : 'td',
                        html: param.defaultvalue === undefined ? '' : (param.defaultvalue + '')
                    })
                }

                if (hasOptionalParams) {
                    paramTable.cn[paramTable.cn.length - 1].cn.splice(2, 0, {
                        tag : 'td',
                        html: param.optional
                    })
                }
            }
        });

        return paramTable
    }

    /**
     * Replaces '<' & '>'
     * @param {String} value
     * @returns {String}
     */
    static escapeHtml(value) {
        return value.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    /**
     * @summary Filters checked sources and resolves member collisions using class configuration and mixin application order.
     */
    filterAndSortItems() {
        const me                  = this,
              hierarchyView       = me.up('classdetails-maincontainer').down('classhierarchy-treelist'),
              hierarchyItems      = hierarchyView.store.items,
              hierarchyMap        = new Map(),
              ignoredMixinMembers = new Set([
                  '_name', 'classConfigApplied', 'className', 'constructor', 'id', 'isClass', 'mixin', 'ntype',
                  'observable', 'toJSON'
              ]),
              memberName = item => item.kind === 'member' && item.name.endsWith('_') ? item.name.slice(0, -1) : item.name,
              reactive   = item => item.kind === 'member' &&
                  (item.name.endsWith('_') || item.tags?.some(tag => tag.title === 'reactive')),
              precedence = (first, second) => {
                  const firstSource  = hierarchyMap.get(first.neoClassName),
                        secondSource = hierarchyMap.get(second.neoClassName);

                  if (firstSource.isMixin !== secondSource.isMixin) {
                      if (!firstSource.isMixin && first.kind === 'member') return 1;
                      if (!secondSource.isMixin && second.kind === 'member') return -1
                  } else if (firstSource.isMixin && (reactive(first) || reactive(second))) {
                      if (!reactive(first)) return -1;
                      if (!reactive(second)) return 1;
                      return secondSource.configOrder - firstSource.configOrder
                  }

                  return firstSource.order - secondSource.order
              };

        hierarchyItems.forEach((source, index) => {
            if (source.checked) {
                hierarchyMap.set(source.sourceClassName || source.name, {...source, order: source.order ?? index})
            }
        });

        me.targetClassName = hierarchyView.structureData.className;

        const filters = [{
            includeEmptyValues: false,
            operator          : 'included',
            property          : 'neoClassName',
            value             : [...hierarchyMap.keys()]
        }, {
            operator: '!==',
            property: 'kind',
            value   : 'class'
        }, {
            operator: '!==',
            property: 'kind',
            value   : 'constant' // todo?
        }, {
            operator: '!==',
            property: 'kind',
            value   : 'module'
        }, {
            operator: 'isUndefined',
            property: 'inherited'
        }];

        if (!me.showPrivateMembers) {
            filters.push({
                operator: '!==',
                property: 'access',
                value   : 'private'
            })
        }

        if (!me.showProtectedMembers) {
            filters.push({
                operator: '!==',
                property: 'access',
                value   : 'protected'
            })
        }

        if (!me.showStaticMembers) {
            filters.push({
                operator: '!==',
                property: 'scope',
                value   : 'static'
            })
        }

        if (me.filterMembersQuery !== '' && me.filterMembersQuery !== null) {
            filters.push({
                operator: 'like',
                property: 'name',
                value   : me.filterMembersQuery
            })
        }

        filters.push({
            filterBy: ({item}) => {
                const source = hierarchyMap.get(item.neoClassName),
                      name   = memberName(item);

                // Neo.setupClass copies prototype members, excluding its class metadata and toJSON.
                if (source.isMixin && (item.scope === 'static' || ignoredMixinMembers.has(name))) return true;
                return name === 'ntype' && item.neoClassName !== me.targetClassName
            }
        }, {
            filterBy: ({item, filteredItems}) => filteredItems.some(other => other.id !== item.id &&
                memberName(other) === memberName(item) && (item.kind === 'event') === (other.kind === 'event') &&
                (item.scope === 'static') === (other.scope === 'static') && precedence(other, item) > 0)
        });

        me.store.filters = filters;

        me.store.sorters = [{
            // Configs => Methods => Events
            sortBy: function(a, b) {
                a = a.kind === 'member' ? 0 : a.kind === 'function' ? 1 : 2;
                b = b.kind === 'member' ? 0 : b.kind === 'function' ? 1 : 2;

                return a > b ? 1 : a < b ? -1 : 0
            }
        }, {
            direction: 'ASC',
            property : 'name'
        }];

        me.fire('mutateItems', me.store)
    }

    /**
     * Override to not call createItems() at this point => onRefreshClassMembers()
     */
    onStoreFilter() {}

    /**
     *
     */
    onRefreshClassMembers() {
        this.filterAndSortItems();
        this.createItems()
    }
}

export default Neo.setupClass(MembersList);
