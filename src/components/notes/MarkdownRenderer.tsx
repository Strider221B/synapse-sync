'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { MermaidDiagram } from './MermaidDiagram';
import { MarkdownMathNormalizer } from '@/lib/utils/markdown_math_normalizer';

const MERMAID_LANG = 'mermaid';
const REGEX_LANG = /language-(\w+)/;

export interface MarkdownRendererProps {
  content: string;
  className?: string;
  inline?: boolean;
}

/**
 * Checks whether a pre element wraps a Mermaid diagram code block.
 */
function isMermaidElement(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some(
    (child) =>
      React.isValidElement(child) &&
      typeof child.props === 'object' &&
      child.props !== null &&
      'className' in child.props &&
      typeof child.props.className === 'string' &&
      child.props.className.includes(`language-${MERMAID_LANG}`)
  );
}

/**
 * Renders GitHub Flavored Markdown, LaTeX math equations, and Mermaid UML diagrams safely.
 */
export function MarkdownRenderer({ content, className = '', inline = false }: MarkdownRendererProps) {
  const normalizedContent = React.useMemo(() => {
    return MarkdownMathNormalizer.normalize(content);
  }, [content]);

  const Component = inline ? 'span' : 'div';
  const inlineClass = inline ? 'markdown-inline' : '';
  const combinedClass = `markdown-body ${inlineClass} ${className}`.trim();

  return (
    <Component className={combinedClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          ...(inline
            ? {
                p({ children }) {
                  return <span className="markdown-inline-p">{children}</span>;
                },
              }
            : {}),
          pre({ children, ...rest }) {
            if (isMermaidElement(children)) {
              return <>{children}</>;
            }
            return <pre {...rest}>{children}</pre>;
          },
          code({ className: codeClass, children, ...rest }) {
            const match = REGEX_LANG.exec(codeClass || '');
            if (match && match[1] === MERMAID_LANG) {
              return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />;
            }
            return (
              <code className={codeClass} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </Component>
  );
}
