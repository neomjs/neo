import ConfigBase          from './configBase.mjs';
import {createConfigProxy} from './ConfigProvider.mjs';

/**
 * @summary The canonical Tier-1 config singleton — the thin, eager subclass of
 * {@link Neo.ai.ConfigBase} that owns the `Neo.ai.Config` namespace when no operator overlay does.
 *
 * Every default leaf and formula lives in `ai/configBase.mjs`; this module contributes ONLY the
 * singleton registration. It stays EAGER on purpose: the Tier-2 server templates side-effect-import
 * this module so the Tier-1 parent exists in the registry before a child provider's `getParent`
 * resolves — laziness here would orphan the hierarchy chain.
 *
 * Operator overlays (`ai/config.mjs`, gitignored) come in two accepted shapes:
 *
 * 1. **Subclass + delta (the standard):** import the base, subclass it, and carry ONLY the leaves
 *    whose values differ from the defaults — a new base leaf is inherited by construction. Deltas
 *    are `leaf()` declarations exactly like the base (bare primitives do not survive the data
 *    plane's leaf resolution; re-declaring keeps env/type explicit where the value changes):
 *    ```js
 *    import ConfigBase                from './configBase.mjs';
 *    import {createConfigProxy, leaf} from './ConfigProvider.mjs';
 *
 *    class Config extends ConfigBase {
 *        static config = {
 *            className: 'Neo.ai.Config',
 *            singleton: true,
 *            data: {
 *                debug: leaf(true, 'NEO_DEBUG', 'boolean') // delta-only — everything else inherits
 *            }
 *        }
 *    }
 *
 *    export default createConfigProxy(Neo.setupClass(Config));
 *    ```
 * 2. **Snapshot copy (deprecated-honest):** a full copy of the pre-split template. It keeps
 *    loading — the copy self-registers `Neo.ai.Config` before this module could — but every leaf
 *    added upstream is invisible to it until hand-merged (the drift class this split retires).
 *    Migrate with `node ai/scripts/setup/migrateConfigOverlay.mjs`.
 *
 * Namespace arbitration is `Neo.setupClass`'s registry idempotency: whichever module registers
 * `Neo.ai.Config` first wins the process; consumers always read the winning singleton.
 *
 * @class Neo.ai.Config
 * @extends Neo.ai.ConfigBase
 * @singleton
 */
class Config extends ConfigBase {
    static config = {
        /**
         * @member {String} className='Neo.ai.Config'
         * @protected
         */
        className: 'Neo.ai.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }
}

const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
