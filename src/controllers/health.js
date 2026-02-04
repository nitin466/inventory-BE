import { getHealthStatus } from '../services/health.js';

export async function getHealth(req, res) {
  const status = await getHealthStatus();
  const code = status.ok ? 200 : 503;
  res.status(code).json(status);
}
