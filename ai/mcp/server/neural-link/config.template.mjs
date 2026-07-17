// Tier-1 must register before ConfigBase evaluates, so materialized operator overlays win the realm root.
import '../../../config.template.mjs';
import ConfigBase          from './configBase.mjs';
import {createConfigProxy} from '../../../ConfigProvider.mjs';

/**
 * @summary Canonical thin singleton for Neural Link configuration.
 *
 * Defaults and formulas live in {@link Neo.ai.mcp.server.neural-link.ConfigBase}; this class
 * only claims the runtime namespace. Operator overlays subclass the same base with delta-only data.
 * @class Neo.ai.mcp.server.neural-link.Config
 * @extends Neo.ai.mcp.server.neural-link.ConfigBase
 * @singleton
 */
class Config extends ConfigBase {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.Config'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }
}

export default createConfigProxy(Neo.setupClass(Config));
