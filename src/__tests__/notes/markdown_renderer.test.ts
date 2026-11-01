import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownRenderer } from '@/components/notes/MarkdownRenderer';

describe('MarkdownRenderer — Math Equations & GFM', () => {
  it('renders inline math expressions with KaTeX markup', () => {
    const content = 'The mass-energy equivalence formula is $E = mc^2$.';
    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content })
    );

    assert.ok(html.includes('markdown-body'), 'Must have markdown-body class');
    assert.ok(html.includes('katex'), 'Must contain rendered KaTeX element');
    assert.ok(html.includes('aria-hidden="true"'), 'KaTeX renders accessible math spans');
    assert.ok(html.includes('E'), 'Includes variable E');
  });

  it('renders display block math expressions', () => {
    const content = `$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$`;
    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content })
    );

    assert.ok(html.includes('katex-display'), 'Must render as a display block element');
    assert.ok(html.includes('katex'), 'Must contain rendered KaTeX element');
  });

  it('renders standard markdown along with math equations', () => {
    const content = `# Calculus Notes

Here is an important formula:
$$
f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}
$$

And inline math $\\alpha + \\beta = \\gamma$.`;

    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content })
    );

    assert.ok(html.includes('Calculus Notes'), 'Must render header');
    assert.ok(html.includes('katex-display'), 'Must render block formula');
    assert.ok(html.includes('katex'), 'Must render inline formula');
  });

  it('renders mermaid UML diagrams inside mermaid-diagram container', () => {
    const content = `\`\`\`mermaid
flowchart TD
  A[Start] --> B{Is Valid?}
  B -- Yes --> C[Process]
  B -- No --> D[Error]
\`\`\``;

    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content })
    );

    assert.ok(html.includes('mermaid-diagram'), 'Must render within mermaid-diagram container');
    assert.ok(html.includes('flowchart TD'), 'Includes diagram source content');
    assert.ok(!html.includes('<pre node='), 'Must not wrap mermaid diagram in pre element');
  });

  it('preserves standard code blocks in pre elements while rendering mermaid diagrams', () => {
    const content = `\`\`\`python
def add(a, b):
    return a + b
\`\`\`

\`\`\`mermaid
sequenceDiagram
  Alice->>Bob: Hello
\`\`\``;

    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content })
    );

    assert.ok(html.includes('<pre'), 'Standard code block must be inside pre');
    assert.ok(html.includes('language-python'), 'Must preserve code language class');
    assert.ok(html.includes('mermaid-diagram'), 'Mermaid block must be in mermaid-diagram container');
  });

  it('renders inline code and preformatted code blocks properly', () => {
    const content = 'Use `np.einsum` to evaluate tensor contractions:\n\n```python\nR1 = np.array([0, 1])\n```';
    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content })
    );

    assert.ok(html.includes('np.einsum'), 'Must render inline code content');
    assert.ok(html.includes('<code'), 'Must have code tag');
    assert.ok(html.includes('R1 = np.array([0, 1])'), 'Must render preformatted code block content');
    assert.ok(html.includes('language-python'), 'Must preserve language class on code element');
  });

  it('renders blockquotes, lists, and links properly', () => {
    const content = '> Important note\n\n- Item 1\n- Item 2\n\n[Documentation](https://example.com)';
    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content })
    );

    assert.ok(html.includes('<blockquote>'), 'Must render blockquote element');
    assert.ok(html.includes('<ul>'), 'Must render unordered list');
    assert.ok(html.includes('<a href="https://example.com"'), 'Must render link with href');
  });
});
