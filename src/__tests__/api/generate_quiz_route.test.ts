import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/generate-quiz/route';

describe('GenerateQuiz Route Handler', () => {
  it('returns 400 when text is shorter than 50 characters', async () => {
    const req = new NextRequest('http://localhost:3000/api/generate-quiz', {
      method: 'POST',
      body: JSON.stringify({ text: 'Too short text' }),
    });

    const res = await POST(req);
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.equal(data.error.code, 'TEXT_TOO_SHORT');
  });
});

