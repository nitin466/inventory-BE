import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.js';
import configRoutes from './routes/config.routes.js';
import syncRoutes from './routes/sync.js';
import productRoutes from './routes/products.js';

const app = express();

app.use(cors({ origin: true, allowedHeaders: ['Content-Type', 'Accept'] }));
app.use(express.json());

// Routes
app.use('/health', healthRoutes);
app.use('/config', configRoutes);
app.use('/sync', syncRoutes);
app.use('/products', productRoutes);

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
