// Tier-1 must register before ConfigBase evaluates, so materialized operator overlays win the realm root.
import '../../../config.template.mjs';
import ConfigBase          from './configBase.mjs';
import {createConfigProxy} from '../../../ConfigProvider.mjs';

/**
 * @summary Canonical thin singleton for Knowledge Base configuration.
 *
 * Defaults and formulas live in {@link Neo.ai.mcp.server.knowledge-base.ConfigBase}; this class
 * only claims the runtime namespace. Operator overlays subclass the same base with delta-only data.
 * @class Neo.ai.mcp.server.knowledge-base.Config
 * @extends Neo.ai.mcp.server.knowledge-base.ConfigBase
 * @singleton
 */
class Config extends ConfigBase {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.Config'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }
}

export default createConfigProxy(Neo.setupClass(Config));
