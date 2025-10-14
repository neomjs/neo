import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
    host            : process.env.HOST || '127.0.0.1',
    logFormat       : 'dev',
    openApiFilePath : path.join(__dirname, 'openapi.yaml'),
    port            : process.env.PORT || 8002,
    requestBodyLimit: '10mb'
};

export default config;
