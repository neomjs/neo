import {defineComponent}      from '../../../../src/functional/_export.mjs';
import {kindToken, kindLabel} from './kindRegistry.mjs';

/**
 * The event-kind chip: a small uppercase mono plate colored by event kind, composed by the
 * activity stream and the agent-detail feed. The kind vocabulary — color token + short label,
 * with the neutral unknown fallback — lives in {@link kindRegistry} (one owner), so this component
 * only renders; a growing kind set never forces a chip edit or a per-view edit.
 *
 * @summary Event-kind chip primitive — renders a kind via the shared registry.
 */
export default defineComponent({
    config: {
        className: 'AgentOS.view.fleet.EventChip',
        ntype    : 'fm-event-chip',
        /**
         * The event kind — e.g. `pr` · `a2a` · `review` · `alert` · `lane-claim` · `work-stall`
         * · `source-degraded` · `lifecycle-request`. Unknown kinds render neutral, never broken.
         * @member {String} kind_='a2a'
         */
        kind_: 'a2a',
        /**
         * Optional label override. Defaults to the canonical short label for `kind`.
         * @member {String|null} label_=null
         */
        label_: null
    },

    createVdom(config) {
        return {
            tag  : 'span',
            cls  : ['fm-event-chip'],
            style: {'--fm-chip': `var(${kindToken(config.kind)})`},
            text : config.label ?? kindLabel(config.kind)
        }
    }
});
