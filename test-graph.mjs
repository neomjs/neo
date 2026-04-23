import fs from 'fs';
import path from 'path';

(async () => {
    const GraphService = (await import('./ai/mcp/server/memory-core/services/GraphService.mjs')).default;
    const SystemLifecycleService = (await import('./ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;
    
    // Clear and boot
    GraphService._initPromise = null;
    await GraphService.initAsync();
    
    const geminiPro = GraphService.getNode({id: '@neo-gemini-3-1-pro'});
    console.log(geminiPro);
})();
