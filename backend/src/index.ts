import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRouter from './routes/auth.routes';
import generateRouter from './routes/generate.routes';
import webhookRouter from './routes/webhook.routes';
import assetRouter from './routes/asset.routes';
import projectRouter from './routes/project.routes';
import accountRouter from './routes/account.routes';
import uploadRouter from './routes/upload.routes';
import { queueService } from './services/queue.service';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Configuration - restrict to frontend origins
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use('/api/v1/webhooks/freemius', express.raw({ type: 'application/json', limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// Routes Registration
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/account', accountRouter);
app.use('/api/v1/assets', assetRouter);
app.use('/api/v1/projects', projectRouter);
app.use('/api/v1/uploads', uploadRouter);
app.use('/api/v1', generateRouter);
app.use('/api/v1/webhooks', webhookRouter);

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', service: 'marsfield-backend' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  void queueService.resumeIncompleteJobs().catch((error) => {
    console.error('Failed to resume incomplete generation jobs:', error);
  });
});
