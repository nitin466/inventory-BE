import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.js';
import configRoutes from './routes/config.routes.js';
import syncRoutes from './routes/sync.js';
import productRoutes from './routes/products.js';
import salesRoutes from './routes/sales.js';
import reportsRoutes from './routes/reports.routes.js';
import purchaseRoutes from './routes/purchase.routes.js';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5555',
  'http://127.0.0.1:5555',
  ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, origin);
      }
      callback(null, false);
    },
    allowedHeaders: ['Content-Type', 'Accept'],
  })
);
app.use(express.json());

// Routes
app.use('/health', healthRoutes);
app.use('/config', configRoutes);
app.use('/sync', syncRoutes);
app.use('/products', productRoutes);
app.use('/sales', salesRoutes);
app.use('/reports', reportsRoutes);
app.use('/purchases', purchaseRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

export default app;
