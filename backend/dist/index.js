"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const generate_routes_1 = __importDefault(require("./routes/generate.routes"));
const webhook_routes_1 = __importDefault(require("./routes/webhook.routes"));
const asset_routes_1 = __importDefault(require("./routes/asset.routes"));
const project_routes_1 = __importDefault(require("./routes/project.routes"));
const account_routes_1 = __importDefault(require("./routes/account.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const kit_routes_1 = __importDefault(require("./routes/kit.routes"));
const youtube_routes_1 = __importDefault(require("./routes/youtube.routes"));
const queue_service_1 = require("./services/queue.service");
const retention_service_1 = require("./services/retention.service");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// CORS Configuration - restrict to frontend origins
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use((0, cors_1.default)(corsOptions));
app.use('/api/v1/webhooks/freemius', express_1.default.raw({ type: 'application/json', limit: '2mb' }));
app.use(express_1.default.json({ limit: '2mb' }));
app.use(express_1.default.urlencoded({ limit: '2mb', extended: true }));
// Routes Registration
app.use('/api/v1/auth', auth_routes_1.default);
app.use('/api/v1/account', account_routes_1.default);
app.use('/api/v1/assets', asset_routes_1.default);
app.use('/api/v1/projects', project_routes_1.default);
app.use('/api/v1/uploads', upload_routes_1.default);
app.use('/api/v1/kits', kit_routes_1.default);
app.use('/api/v1/youtube', youtube_routes_1.default);
app.use('/api/v1', generate_routes_1.default);
app.use('/api/v1/webhooks', webhook_routes_1.default);
// Health check endpoint
app.get('/api/v1/health', (req, res) => {
    res.json({ status: 'ok', service: 'marsfield-backend' });
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    void queue_service_1.queueService.resumeIncompleteJobs().catch((error) => {
        console.error('Failed to resume incomplete generation jobs:', error);
    });
    (0, retention_service_1.startRetentionScheduler)();
});
