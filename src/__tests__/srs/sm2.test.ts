import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SRSCard } from '../../lib/db/models';
import { SM2Engine } from '../../lib/srs/sm2';

describe('SM2Engine', () => {
  const BASE_DATE = new Date('2026-06-01T12:00:00.000Z');

  const createCard = (overrides?: Partial<SRSCard>): SRSCard => ({
    id: 'srs-card-1',
    cardId: 'card-1',
    cardType: 'flashcard',
    repetitions: 0,
    easinessFactor: 2.5,
    interval: 0,
    nextReview: BASE_DATE.toISOString(),
    lastReview: null,
    totalReviews: 0,
    correctCount: 0,
    ...overrides,
  });

  it('calculates first review with quality 5: interval = 1 day, repetitions = 1, EF increases', () => {
    const card = createCard();
    const result = SM2Engine.calculate(card, 5, BASE_DATE);

    assert.equal(result.repetitions, 1);
    assert.equal(result.interval, 1);
    // EF' = 2.5 + (0.1 - 0) = 2.6
    assert.equal(result.easinessFactor, 2.6);
    const expectedDate = new Date('2026-06-02T12:00:00.000Z').toISOString();
    assert.equal(result.nextReview, expectedDate);
  });

  it('calculates second review with quality 4: interval = 6 days, repetitions = 2, EF remains stable', () => {
    const card = createCard({
      repetitions: 1,
      easinessFactor: 2.6,
      interval: 1,
    });
    const result = SM2Engine.calculate(card, 4, BASE_DATE);

    assert.equal(result.repetitions, 2);
    assert.equal(result.interval, 6);
    // diff = 1: 0.1 - 1 * (0.08 + 0.02) = 0.1 - 0.1 = 0
    assert.equal(result.easinessFactor, 2.6);
    const expectedDate = new Date('2026-06-07T12:00:00.000Z').toISOString();
    assert.equal(result.nextReview, expectedDate);
  });

  it('calculates third review with quality 5: interval = round(6 * EF), repetitions = 3', () => {
    const card = createCard({
      repetitions: 2,
      easinessFactor: 2.6,
      interval: 6,
    });
    const result = SM2Engine.calculate(card, 5, BASE_DATE);

    assert.equal(result.repetitions, 3);
    // EF' = 2.6 + 0.1 = 2.7
    assert.equal(result.easinessFactor, 2.7);
    // interval = round(6 * 2.7) = round(16.2) = 16
    assert.equal(result.interval, 16);
    const expectedDate = new Date('2026-06-17T12:00:00.000Z').toISOString();
    assert.equal(result.nextReview, expectedDate);
  });

  it('resets repetitions to 0 and interval to 1 on failed recall (quality 0, 1, 2)', () => {
    const establishedCard = createCard({
      repetitions: 4,
      easinessFactor: 2.7,
      interval: 35,
    });

    const failedQualities = [0, 1, 2];
    for (const q of failedQualities) {
      const result = SM2Engine.calculate(establishedCard, q, BASE_DATE);
      assert.equal(result.repetitions, 0, `Expected repetitions 0 for quality ${q}`);
      assert.equal(result.interval, 1, `Expected interval 1 for quality ${q}`);
      assert.ok(result.easinessFactor < establishedCard.easinessFactor);
      assert.equal(result.nextReview, new Date('2026-06-02T12:00:00.000Z').toISOString());
    }
  });

  it('decreases EF at quality 3 but increments repetitions if successful', () => {
    const card = createCard({
      repetitions: 2,
      easinessFactor: 2.5,
      interval: 6,
    });
    const result = SM2Engine.calculate(card, 3, BASE_DATE);

    assert.equal(result.repetitions, 3);
    // diff = 2: 0.1 - 2 * (0.08 + 0.04) = 0.1 - 0.24 = -0.14 -> 2.36
    assert.equal(result.easinessFactor, 2.36);
    // interval = round(6 * 2.36) = round(14.16) = 14
    assert.equal(result.interval, 14);
  });

  it('never allows EF to drop below the minimum threshold of 1.3', () => {
    const lowEfCard = createCard({
      repetitions: 3,
      easinessFactor: 1.35,
      interval: 10,
    });
    // quality 0 decreases EF by 0.8
    const result = SM2Engine.calculate(lowEfCard, 0, BASE_DATE);

    assert.equal(result.easinessFactor, 1.3);
    assert.equal(result.repetitions, 0);
    assert.equal(result.interval, 1);
  });

  it('retains minimum EF of 1.3 if already at 1.3 and quality is 0', () => {
    const minCard = createCard({
      repetitions: 1,
      easinessFactor: 1.3,
      interval: 2,
    });
    const result = SM2Engine.calculate(minCard, 0, BASE_DATE);
    assert.equal(result.easinessFactor, 1.3);
  });

  it('clamps quality below 0 to 0 and above 5 to 5', () => {
    const card = createCard({ easinessFactor: 2.5 });

    const underResult = SM2Engine.calculate(card, -3, BASE_DATE);
    const zeroResult = SM2Engine.calculate(card, 0, BASE_DATE);
    assert.deepEqual(underResult, zeroResult);

    const overResult = SM2Engine.calculate(card, 10, BASE_DATE);
    const maxResult = SM2Engine.calculate(card, 5, BASE_DATE);
    assert.deepEqual(overResult, maxResult);
  });

  it('works via class instance calculate() method as well', () => {
    const engine = new SM2Engine();
    const card = createCard();
    const result = engine.calculate(card, 5, BASE_DATE);

    assert.equal(result.repetitions, 1);
    assert.equal(result.interval, 1);
    assert.equal(result.easinessFactor, 2.6);
  });
});
