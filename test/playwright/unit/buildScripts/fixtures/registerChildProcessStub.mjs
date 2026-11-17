import {register} from 'node:module';

// Preloaded with `node --import`: the build script it starts gets the stub in place of `child_process`
register('./childProcessStub.mjs', import.meta.url);
