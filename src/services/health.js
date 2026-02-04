import prisma from '../lib/prisma.js';

export async function getHealthStatus() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, database: 'connected' };
  } catch (err) {
    return { ok: false, database: 'disconnected', error: err.message };
  }
}
