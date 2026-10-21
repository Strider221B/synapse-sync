import React, { Suspense } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardStatsGrid } from '@/components/dashboard/DashboardStatsGrid';
import { RecentNotesSection } from '@/components/dashboard/RecentNotesSection';
import { SRSDashboardWidget } from '@/components/review/SRSDashboardWidget';

export default function Home() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* 1. Welcome Header Banner & Quick Actions */}
      <Suspense fallback={null}>
        <DashboardHeader />
      </Suspense>

      {/* 2. Study Statistics Grid */}
      <DashboardStatsGrid />

      {/* 3. Spaced Repetition Interactive Widget */}
      <section aria-label="Spaced Repetition Review">
        <SRSDashboardWidget />
      </section>

      {/* 4. Recent Notes Listing */}
      <RecentNotesSection />
    </div>
  );
}
