import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';
import { sniffImageType } from '../src/image-type';

const app = createApp();
const staffToken = issueToken('staff').token;
const auth = { Authorization: `Bearer ${staffToken}` };

describe('sniffImageType', () => {
  it('recognizes allowed raster image headers', () => {
    expect(sniffImageType(Buffer.from('89504e470d0a1a0a', 'hex'))).toEqual({
      mime: 'image/png',
      ext: '.png',
    });
    expect(sniffImageType(Buffer.from('ffd8ff', 'hex'))).toEqual({
      mime: 'image/jpeg',
      ext: '.jpg',
    });
    expect(sniffImageType(Buffer.from('474946383761', 'hex'))).toEqual({
      mime: 'image/gif',
      ext: '.gif',
    });
    expect(sniffImageType(Buffer.from('524946460000000057454250', 'hex'))).toEqual({
      mime: 'image/webp',
      ext: '.webp',
    });
  });

  it('rejects SVG and empty buffers', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('POST /api/upload', () => {
  it('rejects an SVG with a spoofed PNG content type', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set(auth)
      .attach('image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), {
        filename: 'image.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unsupported image type');
  });

  it('rejects an SVG file', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set(auth)
      .attach('image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), {
        filename: 'image.svg',
        contentType: 'image/svg+xml',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unsupported image type');
  });

  it('passes a valid PNG to the R2 configuration check', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set(auth)
      .attach('image', Buffer.from('89504e470d0a1a0a', 'hex'), {
        filename: 'image.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('Image storage (R2) is not configured');
  });
});
