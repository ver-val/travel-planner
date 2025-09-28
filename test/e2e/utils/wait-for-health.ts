import request from 'supertest';

export async function waitForHealth(app: any, path = '/api/health', timeoutMs = 30000) {
  const start = Date.now();
  let lastErr: any;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await request(app.getHttpServer()).get(path);
      if (res.status === 200) return;
      lastErr = new Error(`Health not OK, status ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw lastErr ?? new Error('Health check timeout');
}
