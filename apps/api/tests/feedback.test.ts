import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { issueToken, clearSessions } from '../src/auth';

describe('Feedback & Issue Reports Endpoints', () => {
  const app = createApp();

  beforeEach(async () => {
    clearSessions();
    await prisma.feedbackReport.deleteMany({});
  });

  it('allows submitting feedback without auth', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({
        message: 'The milk tea was delicious!',
        telegramUserId: '12345678',
        userName: 'John Doe',
        userPhone: '+85512345678',
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('The milk tea was delicious!');
    expect(res.body.status).toBe('new');

    const inDb = await prisma.feedbackReport.findFirst({
      where: { message: 'The milk tea was delicious!' },
    });
    expect(inDb).not.toBeNull();
  });

  it('rejects feedback with empty message', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ message: '   ' });

    expect(res.status).toBe(400);
  });

  it('requires manager token to view feedback list', async () => {
    await prisma.feedbackReport.create({
      data: { message: 'Test message', status: 'new' },
    });

    const unauth = await request(app).get('/api/feedback');
    expect(unauth.status).toBe(401);

    const { token: staffToken } = issueToken('staff');
    const staffRes = await request(app)
      .get('/api/feedback')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffRes.status).toBe(401);

    const { token: managerToken } = issueToken('manager');
    const managerRes = await request(app)
      .get('/api/feedback')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(managerRes.status).toBe(200);
    expect(managerRes.body).toHaveLength(1);
    expect(managerRes.body[0].message).toBe('Test message');
  });

  it('allows manager to update status and delete feedback', async () => {
    const report = await prisma.feedbackReport.create({
      data: { message: 'Straw missing', status: 'new' },
    });

    const { token: managerToken } = issueToken('manager');

    const updateRes = await request(app)
      .put(`/api/feedback/${report.id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'resolved' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toBe('resolved');

    const deleteRes = await request(app)
      .delete(`/api/feedback/${report.id}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(deleteRes.status).toBe(200);

    const count = await prisma.feedbackReport.count();
    expect(count).toBe(0);
  });
});
