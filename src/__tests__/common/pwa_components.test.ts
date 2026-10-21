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
