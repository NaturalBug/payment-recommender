import request from 'supertest';
import app from '../app';

describe('admin API authentication', () => {
  test('rejects requests without an API key', async () => {
    const response = await request(app).get('/api/admin/merchants');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'admin API key is required'
    });
  });

  test('rejects requests with an invalid API key', async () => {
    const response = await request(app)
      .get('/api/admin/merchants')
      .set('X-Admin-API-Key', 'wrong-key');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      message: 'invalid admin API key'
    });
  });

  test('allows requests with the configured API key', async () => {
    const response = await request(app)
      .get('/api/admin/merchants')
      .set('X-Admin-API-Key', 'test-admin-key');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
