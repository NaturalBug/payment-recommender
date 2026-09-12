import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';

describe('health route', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('reports API and database health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      database: 'ok'
    });
  });

  test('reports database failures as unavailable', async () => {
    jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('database unavailable'));

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'error',
      database: 'unavailable'
    });
  });
});
