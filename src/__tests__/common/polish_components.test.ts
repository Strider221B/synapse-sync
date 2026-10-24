import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Skeleton } from '../../components/common/Skeleton';
import { ErrorState } from '../../components/common/ErrorState';
import { ThemeToggle } from '../../components/common/ThemeToggle';
import { SettingRow } from '../../components/settings/SettingRow';
import { NumberInput } from '../../components/settings/NumberInput';
import { SelectDropdown } from '../../components/settings/SelectDropdown';
import { BottomNav } from '../../components/layout/BottomNav';

describe('Epic 9 Polish & Enhancements Components Test Suite', () => {
  describe('Skeleton Component', () => {
    it('renders text variant with default dimensions', () => {
      const markup = renderToStaticMarkup(React.createElement(Skeleton, { variant: 'text' }));
      assert.ok(markup.includes('skeleton-shimmer'));
      assert.ok(markup.includes('height:1rem'));
    });

    it('renders circular variant with 50% border radius', () => {
      const markup = renderToStaticMarkup(
        React.createElement(Skeleton, { variant: 'circular', width: '50px', height: '50px' })
      );
      assert.ok(markup.includes('border-radius:50%'));
      assert.ok(markup.includes('width:50px'));
    });

    it('renders card and rectangular variants', () => {
      const cardMarkup = renderToStaticMarkup(React.createElement(Skeleton, { variant: 'card' }));
      assert.ok(cardMarkup.includes('height:160px'));

      const rectMarkup = renderToStaticMarkup(
        React.createElement(Skeleton, { variant: 'rectangular', height: '100px' })
      );
      assert.ok(rectMarkup.includes('height:100px'));
    });
  });

  describe('ErrorState Component', () => {
    it('renders error title and message correctly', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ErrorState, {
          title: 'Database Sync Failed',
          message: 'Unable to reach remote server.',
        })
      );
      assert.ok(markup.includes('Database Sync Failed'));
      assert.ok(markup.includes('Unable to reach remote server.'));
      assert.ok(markup.includes('role="alert"'));
    });

    it('renders retry button when onRetry is provided', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ErrorState, {
          title: 'Error',
          onRetry: () => {},
          actionLabel: 'Try Reconnecting',
        })
      );
      assert.ok(markup.includes('Try Reconnecting'));
    });
  });

  describe('ThemeToggle Component', () => {
    it('renders unmounted placeholder or segmented toggle', () => {
      const markup = renderToStaticMarkup(React.createElement(ThemeToggle));
      assert.ok(markup.includes('theme-toggle'));
    });

    it('renders compact variant toggle button with appropriate id and dimensions', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ThemeToggle, { variant: 'compact', id: 'header-theme-toggle' })
      );
      assert.ok(markup.includes('header-theme-toggle'));
      assert.ok(markup.includes('34px'));
    });
  });

  describe('Settings Form Components', () => {
    it('renders SettingRow with label, description, and children', () => {
      const markup = renderToStaticMarkup(
        React.createElement(
          SettingRow,
          {
            label: 'Study Goal',
            description: 'Cards per day',
          },
          React.createElement('span', null, 'Control')
        )
      );
      assert.ok(markup.includes('Study Goal'));
      assert.ok(markup.includes('Cards per day'));
      assert.ok(markup.includes('Control'));
    });

    it('renders NumberInput stepper with decrement, input, and increment buttons', () => {
      const markup = renderToStaticMarkup(
        React.createElement(NumberInput, {
          value: 20,
          onChange: () => {},
          min: 5,
          max: 100,
        })
      );
      assert.ok(markup.includes('value="20"'));
      assert.ok(markup.includes('aria-label="Decrease value"'));
      assert.ok(markup.includes('aria-label="Increase value"'));
    });

    it('renders SelectDropdown with options and selection', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SelectDropdown, {
          value: 'medium',
          onChange: () => {},
          options: [
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ],
        })
      );
      assert.ok(markup.includes('<select'));
      assert.ok(markup.includes('value="medium"'));
      assert.ok(markup.includes('Easy'));
      assert.ok(markup.includes('Hard'));
    });
  });

  describe('BottomNav Component', () => {
    it('renders mobile navigation bar with 5 core tabs', () => {
      const markup = renderToStaticMarkup(React.createElement(BottomNav));
      assert.ok(markup.includes('bottom-nav'));
      assert.ok(markup.includes('Home'));
      assert.ok(markup.includes('Notes'));
      assert.ok(markup.includes('Review'));
      assert.ok(markup.includes('Quizzes'));
      assert.ok(markup.includes('Settings'));
    });
  });
});
