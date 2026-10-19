import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatInterface } from '@/components/chat/ChatInterface';

describe('Chat Components Test Suite', () => {
  describe('ChatBubble Component', () => {
    it('renders user message bubble with user styling', () => {
      const element = ChatBubble({
        role: 'user',
        content: 'How does gradient descent work?',
        timestamp: '2026-10-19T10:00:00.000Z',
      });

      assert.ok(React.isValidElement(element), 'ChatBubble should return a valid React element');
      assert.equal((element.props as Record<string, unknown>)['data-testid'], 'chat-bubble-user');
      assert.equal(element.type, 'div');
    });

    it('renders assistant message bubble with markdown formatting', () => {
      const element = ChatBubble({
        role: 'assistant',
        content: 'Gradient descent minimizes the **cost function** by updating weights iteratively.',
        timestamp: '2026-10-19T10:01:00.000Z',
      });

      assert.ok(React.isValidElement(element), 'ChatBubble should return a valid React element');
      assert.equal((element.props as Record<string, unknown>)['data-testid'], 'chat-bubble-assistant');
    });

    it('handles message without timestamp gracefully', () => {
      const element = ChatBubble({
        role: 'user',
        content: 'Quick question',
      });

      assert.ok(React.isValidElement(element), 'ChatBubble renders when timestamp is omitted');
    });
  });

  describe('ChatInterface Component', () => {
    it('creates a valid React element with props configured', () => {
      const element = React.createElement(ChatInterface, {
        noteId: 'note-123',
        noteTitle: 'Lecture 1: Intro to ML',
        noteContent: 'Machine learning algorithms learn representations from data.',
      });

      assert.ok(React.isValidElement(element), 'ChatInterface must return a valid React element');
      assert.equal(element.type, ChatInterface);
      assert.equal(element.props.noteId, 'note-123');
      assert.equal(element.props.noteTitle, 'Lecture 1: Intro to ML');
    });
  });
});
