'use client';

import React, { useEffect, useState } from 'react';
import { DatabaseService } from '@/lib/db/database_service';
import { SRSCardService } from '@/lib/db/services/srs_card_service';

export const ReviewNavBadge: React.FC = () => {
  const [dueCount, setDueCount] = useState<number>(0);

  useEffect(() => {
    let active = true;

    async function checkDue() {
      try {
        const dbService = new DatabaseService();
        const srsService = new SRSCardService(dbService);
        const due = await srsService.getDueCards();
        if (active) {
          setDueCount(due.length);
        }
      } catch {
        // Fallback gracefully if database is initializing or unavailable
      }
    }

    checkDue();
    return () => {
      active = false;
    };
  }, []);

  if (dueCount <= 0) return null;

  return (
    <span
      id="review-nav-badge"
      style={{
        marginLeft: 'auto',
        backgroundColor: 'var(--color-primary)',
        color: '#ffffff',
        fontSize: '0.7rem',
        fontWeight: 700,
        padding: '0.15rem 0.45rem',
        borderRadius: 'var(--radius-full)',
        lineHeight: 1.2,
        boxShadow: '0 0 10px rgba(99, 102, 241, 0.4)',
      }}
    >
      {dueCount}
    </span>
  );
};
