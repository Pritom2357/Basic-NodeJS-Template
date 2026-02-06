const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const client = require('prom-client');
const { createLogger, transports } = require("winston");
const LokiTransport = require("winston-loki");
const responseTime = require('response-time');
const path = require('path');
const {rateLimit} = require('express-rate-limit');
const http = require('http');
const createSocketServer = require('./realtime/socketServer.js');
const NotificationService = require('./notifications/notificationService.js');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { swaggerJsdocOptions } = require('./docs/swaggerConfig.js');

dotenv.config({path: path.resolve(__dirname, '.env')});

const app = express();
const {authRouter} = require('./routes/authRoutes.js');
const {userRouter} = require('./routes/userRoutes.js');
const PORT = process.env.PORT || 8000;
const server = http.createServer(app);
const socketLayer = createSocketServer(server);
const swaggerSpec = swaggerJsdoc(swaggerJsdocOptions);
new NotificationService(socketLayer);


const corsOptions = {
    origin: "*",
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Length', 'X-Knowledge-Base'],
    credentials: false,  
    maxAge: 600, 
}

const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	limit: 500, 
	standardHeaders: 'draft-8', 
	legacyHeaders: false, 
	ipv6Subnet: 56
});

const loginLimiter = rateLimit({
	windowMs: 5 * 60 * 1000, 
	limit: 50, 
	standardHeaders: 'draft-8', 
	legacyHeaders: false, 
	ipv6Subnet: 64
});

const SENSITIVE_FIELDS = ['password', 'oldPassword', 'newPassword', 'token', 'refreshToken', 'accessToken'];

const sanitize = (obj)=>{
    if(!obj || typeof obj !== 'object') return obj;
    const out = {};
    for(const [key, value] of Object.entries(obj)){
        if(SENSITIVE_FIELDS.includes(key)) out[key] = '[REDACTED]';
        else if(typeof value === 'string' && value.length > 256) out[key] = value.slice(0, 256) + '...';
        else out[key] = value;
    }

    return out;
}

morgan.token('req-body', req=>{
    if(process.env.LOG_REQUEST_BODY === 'false') return '-';
    if(!req.body || Object.keys(req.body).length === 0) return '-';
    try {
        return JSON.stringify(sanitize(req.body));
    } catch (error) {
        return '[unreadable]';
    }
});

morgan.token('query', req=>{
    const q = req.query || {};
    return Object.keys(q).length ? JSON.stringify(q) : '-';
});

morgan.token('user-id', req=> req.user?.id || '-');
const morganFormat = 'method=:method url=:url status=:status response time=:response-time ms len=:res[content-length] user=:user-id query=:query body=:req-body';

const format = process.env.NODE_ENV === 'production' ? 'combined' : morganFormat;

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({register: client.register});


const totalRequestCounter = new client.Counter({
    name: 'total_request_count',
    help: "Tells total request on each route",
    labelNames: ['method', 'route', 'status_code']
});

const reqResTime = new client.Histogram({
    name: 'http_request_response_time',
    help: "This tells how much time is taken by req and response time",
    labelNames: ['method', 'route', 'status_code'],
    buckets: [1, 50, 100, 200, 500, 800, 1000, 2000]
});

app.use(cors(corsOptions));
app.use(express.json());
app.use(helmet());
app.use(morgan(format));

app.use(
    responseTime((req, res, time)=>{
        totalRequestCounter.labels({
            method: req.method,
            route: req.route ? req.route.path : req.path,
            status_code: res.statusCode
        }).inc();
        reqResTime.labels({
            method: req.method,
            route: req.route ? req.route.path : req.path,
            status_code: res.statusCode
        }).observe(time)
}))

app.use('/api/auth', loginLimiter, authRouter);
app.use('/api/user', apiLimiter, userRouter);

const options = {
  transports: [
    new LokiTransport({
      host: "http://loki:3100",
      handleExceptions: true,
      labels: { app: 'node-backend' }
    })
  ]
};
const logger = createLogger(options);

if (process.env.ENABLE_SWAGGER !== 'false') {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        explorer: true,
        swaggerOptions: {
            persistAuthorization: true
        }
    }));
    app.get('/api/docs.json', (req,res)=> res.json(swaggerSpec));
}

app.get('/metrics', async (req, res)=>{
    res.setHeader('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.send(metrics);
});

app.get('/', (req, res)=>{
    logger.info("Request came on / router");
    res.send("Welcome to the backend made for authentication template")
})
 

server.listen(PORT, '0.0.0.0', ()=>{    
    console.log(`Listening on: http://0.0.0.0:${PORT}`);
    if(process.env.ENABLE_WEBSOCKETS === 'true'){
        console.log("Websockets enabled");
    }
})