import {defineComponent} from '../../../../src/functional/_export.mjs';

/**
 * Maps a model-family key to its rail token (see `apps/agentos/resources/tokens.css`).
 * Family is an attribute of the resident's CURRENT EmbodiedEpisode era —
 * NOT a per-agent constant and NOT identity. Unknown keys fall back to `human`.
 * @type {Object}
 */
const FAMILY_TOKEN = {
    claude: '--fm-family-claude',
    gpt   : '--fm-family-gpt',
    gemini: '--fm-family-gemini',
    human : '--fm-family-human'
};

/**
 * Pure family → token mapping, exported for reuse and direct unit-testing.
 * @param {String} family
 * @returns {String} the `--fm-family-*` custom-property name
 */
export function familyToken(family) {
    return FAMILY_TOKEN[family] || FAMILY_TOKEN.human
}

/**
 * The family accent rail rendered on the leading edge of a resident's card. Its color is bound
 * DATA-DRIVEN from the current episode's family key — so a family swap (e.g. Opus→Fable) simply
 * re-renders the rail for the SAME resident, never forks a new self — the
 * anti-lock-in binding enforced here once instead of re-derived per consumer.
 *
 * @summary Family-accent rail primitive — episode-attribute data binding.
 */
export default defineComponent({
    config: {
        className: 'AgentOS.view.fleet.FamilyRail',
        ntype    : 'fm-family-rail',
        /**
         * The model family of the resident's current era — `claude` · `gpt` · `gemini` · `human`.
         * A data-driven episode attribute, never a per-agent constant. Unknown values render as `human`.
         * @member {String} family_='human'
         */
        family_: 'human'
    },

    createVdom(config) {
        return {
            cls  : ['fm-family-rail'],
            style: {'--fm-rail': `var(${familyToken(config.family)})`}
        }
    }
});
