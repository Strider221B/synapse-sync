import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionStatus } from '../../components/common/ConnectionStatus';
import { OfflineNotice } from '../../components/common/OfflineNotice';
import { ServiceWorkerRegister } from '../../components/common/ServiceWorkerRegister';

describe('PWA Offline Components Test Suite', () => {
  it('renders ConnectionStatus component markup without crashing', () => {
    const markup = renderToStaticMarkup(React.createElement(ConnectionStatus));
    assert.ok(markup.includes('connection-status-badge'));
    assert.ok(markup.includes('Online'));
  });

  it('renders ConnectionStatus sync button disabled when Google Drive is disconnected', () => {
    const markup = renderToStaticMarkup(React.createElement(ConnectionStatus, { isAuthenticated: false }));
    assert.ok(markup.includes('disabled=""') || markup.includes('disabled'));
    assert.ok(markup.includes('Google Drive is not connected'));
  });

  it('renders ConnectionStatus sync button enabled when Google Drive is connected', () => {
    const markup = renderToStaticMarkup(React.createElement(ConnectionStatus, { isAuthenticated: true }));
    assert.ok(markup.includes('Force sync notes and quizzes with Google Drive'));
    assert.ok(!markup.includes('Google Drive is not connected'));
  });

  it('renders OfflineNotice component markup', () => {
    const noticeMarkup = renderToStaticMarkup(
      React.createElement(OfflineNotice, {
        featureName: 'AI Summarization',
        description: 'Requires internet connectivity.',
      })
    );
    // Initial server render is not offline, so returns null / empty string
    assert.equal(noticeMarkup, '');
  });

  it('renders ServiceWorkerRegister returning null', () => {
    const markup = renderToStaticMarkup(React.createElement(ServiceWorkerRegister));
    assert.equal(markup, '');
  });
});
