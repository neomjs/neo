import Base from '../../core/Base.mjs';

/**
 * Basic helper class to create template DOM nodes and apply them to a target node via cloning.
 * See: https://github.com/neomjs/neo/blob/dev/apps/krausest/view/TableComponent.mjs
 * @class Neo.main.addon.CloneNode
 * @extends Neo.core.Base
 * @singleton
 */
class CloneNode extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.addon.CloneNode'
         * @protected
         */
        className: 'Neo.main.addon.CloneNode',
        /**
         * Internal map to store DOM nodes which will get used for cloning
         * @member {Object} map={}
         * @protected
         */
        map: {},
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'applyClones',
                'createNode'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}

    /**
     * @param {Object} data
     * @param {Array} data.data
     * @param {String} data.id The reference id, not DOM id
     * @param {String} data.parentId
     */
    applyClones(data) {
        let i      = 0,
            node   = this.map[data.id],
            len    = data.data.length,
            parent = document.getElementById(data.parentId),
            clone, itemData, j, path, pathLen, targetNode;

        requestAnimationFrame(() => {
            let start = performance.now();

            for (; i < len; i++) {
                clone    = node.template.cloneNode(true);
                itemData = data.data[i];

                Object.entries(itemData).forEach(([key, value]) => {
                    path = node.paths[key];

                    if (path) {
                        path       = path.split('/').map(e => Number(e));
                        j          = 0;
                        pathLen    = path.length;
                        targetNode = clone;

                        for (; j < pathLen; j++) {
                            targetNode = targetNode.childNodes[path[j]];
                        }

                        targetNode.textContent = value;
                    }
                });

                parent.append(clone);
            }

            let end = performance.now();

            console.log('time', end - start);
        });
    }

    /**
     * @param {Object} data
     * @param {String} data.html
     * @param {String} data.id The reference id, not DOM id
     * @param {Object} data.paths
     * @param {String} data.tag
     */
    createNode(data) {
        let template = document.createElement(data.tag);
        template.innerHTML = data.html;

        this.map[data.id] = {
            paths   : data.paths,
            template: template
        };
    }
}

let instance = Neo.applyClassConfig(CloneNode);

export default instance;
