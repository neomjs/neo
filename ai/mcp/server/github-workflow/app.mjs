import express          from 'express';
import fs               from 'fs';
import morgan           from 'morgan';
import swaggerUi        from 'swagger-ui-express';
import yaml             from 'js-yaml';
import healthRouter     from './routes/health.mjs';
import pullRequestsRouter from './routes/pullRequests.mjs';
import errorHandler     from './middleware/errorHandler.mjs';
import notFoundHandler  from './middleware/notFoundHandler.mjs';
import serverConfig     from './config.mjs';

const app = express();

// Middleware
app.use(express.json({limit: serverConfig.requestBodyLimit}));
app.use(morgan(serverConfig.logFormat));

// Swagger docs
const openApiDocument = yaml.load(fs.readFileSync(serverConfig.openApiFilePath, 'utf8'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, {explorer: true}));

// Routes
app.use('/', healthRouter);
app.use('/', pullRequestsRouter);

// 404 + Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
