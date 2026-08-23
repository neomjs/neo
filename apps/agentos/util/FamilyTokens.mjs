import Base from '../../../src/core/Base.mjs';

/**
 * Maps a model-family key to its rail token (the `--fm-family-*` values live in the theme skin,
 * `resources/scss/theme-neo-{dark,light}/apps/agentos/`).
 * Family is an attribute of the resident's CURRENT EmbodiedEpisode era — NOT a per-agent
 * constant and NOT identity. A KNOWN family maps to its --fm-family-* token; anything else
 * degrades to the NEUTRAL --fm-state-off token (never silently to `human`), so an unrecognized
 * or absent family reads as genuinely unclassified rather than being mis-attributed.
 * @type {Object}
 */
const FAMILY_TOKEN = {
    claude: '--fm-family-claude',
    gpt   : '--fm-family-gpt',
    gemini: '--fm-family-gemini',
    human : '--fm-family-human',
    kimi  : '--fm-family-kimi'
};

/**
 * Static model-family presentation utilities for the AgentOS Fleet surfaces.
 * @class AgentOS.util.FamilyTokens
 * @extends Neo.core.Base
 */
class FamilyTokens extends Base {
    static config = {
        /**
         * @member {String} className='AgentOS.util.FamilyTokens'
         * @protected
         */
        className: 'AgentOS.util.FamilyTokens'
    }

    /**
     * Pure family → rail-token resolver. Unknown / absent family → the neutral token. Uses the
     * `isKnownFamily` hasOwn check (not `MAP[k] ||`) so a prototype-shaped key (`toString`,
     * `constructor`, `__proto__`) can't leak an inherited value past the closed set.
     * @param {String} family
     * @returns {String} a `--fm-family-*` name for a known family, else `--fm-state-off`
     */
    static familyToken(family) {
        return FamilyTokens.isKnownFamily(family) ? FAMILY_TOKEN[family] : '--fm-state-off'
    }

    /**
     * Pure family → CSS-class resolver — a known family's token minus its `--` custom-property prefix
     * (e.g. `fm-family-claude`); unknown / absent → `null` (the `fm-family-unclassified` marker class
     * carries the neutral rail binding in the component SCSS). The class binds `--fm-rail`, so color
     * stays entirely in the token/skin layer: the rail swaps a class, never writes a style.
     * @param {String} family
     * @returns {String|null} the family class name, or null for an unknown / absent family
     */
    static familyClass(family) {
        return FamilyTokens.isKnownFamily(family) ? FAMILY_TOKEN[family].slice(2) : null
    }

    /**
     * Whether `family` is a recognized family key — drives the `unclassified` render marker.
     * @param {String} family
     * @returns {Boolean}
     */
    static isKnownFamily(family) {
        return Object.hasOwn(FAMILY_TOKEN, family)
    }
}

export default Neo.setupClass(FamilyTokens);
