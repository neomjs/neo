import Component from '../../../../../src/component/Base.mjs';

/**
 * @class DevIndex.view.home.component.Heuristics
 * @extends Neo.component.Base
 */
class Heuristics extends Component {
    static config = {
        /**
         * @member {String} className='DevIndex.view.home.component.Heuristics'
         * @protected
         */
        className: 'DevIndex.view.home.component.Heuristics',
        /**
         * @member {String[]} cls=['devindex-heuristics']
         */
        cls: ['devindex-heuristics'],
        /**
         * @member {Object|null} heuristics_=null
         */
        heuristics_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'span', cls: ['devindex-badge']}, // Velocity
            {tag: 'span', cls: ['devindex-badge']}, // Acceleration
            {tag: 'span', cls: ['devindex-badge']}  // Consistency
        ]}
    }

    /**
     * @param {Object|null} value
     * @param {Object|null} oldValue
     */
    afterSetHeuristics(value, oldValue) {
        let me     = this,
            {vdom} = me,
            nodes  = vdom.cn,
            badges, v, a, c;

        if (value) {
            ({v, a, c} = value);
            badges = [];

            // 1. Velocity (v)
            if (v > 1000) {
                badges.push({cls: 'fire', icon: '🔥', title: 'Velocity: Superhuman (>1k/day)'})
            } else if (v > 100) {
                badges.push({cls: 'bolt', icon: '⚡', title: 'Velocity: High (>100/day)'})
            }

            // 2. Acceleration (a)
            if (a > 10) {
                badges.push({cls: 'rocket', icon: '🚀', title: 'Acceleration: Explosive Growth (>10x)'})
            } else if (a > 2) {
                badges.push({cls: 'trend-up', icon: '📈', title: 'Acceleration: Rising Star (>2x)'})
            }

            // 3. Consistency (c)
            if (c > 10) {
                badges.push({cls: 'pillar', icon: '🏛️', title: 'Consistency: Community Pillar (>10y)'})
            } else if (c > 5) {
                badges.push({cls: 'shield', icon: '🛡️', title: 'Consistency: Veteran (>5y)'})
            }

            // Zero State
            if (badges.length === 0 && c <= 1) {
                badges.push({cls: 'seedling', icon: '🌱', title: 'New Contributor'})
            }

            // Map badges to fixed nodes
            nodes.forEach((node, index) => {
                let badge = badges[index];

                if (badge) {
                    node.cls   = ['devindex-badge', badge.cls];
                    node.title = badge.title;
                    node.text  = badge.icon;
                    node.style = null        // Remove visibility: hidden
                } else {
                    node.style = {visibility: 'hidden'}
                }
            });
        } else {
            // Hide all if no data
            nodes.forEach(node => {
                node.style = {visibility: 'hidden'}
            })
        }

        me.update()
    }
}

export default Neo.setupClass(Heuristics);
