import aiConfig       from './config.mjs';
import {createLogger} from '../shared/logger.mjs';

export default createLogger(aiConfig, {
    filePrefix    : 'kb-server',
    fileSink      : true,
    stderrMode    : 'debug',
    timestampStyle: 'plain'
});
