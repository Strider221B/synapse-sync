'use client';

import React, { useEffect, useState } from 'react';

const THEME_DARK = 'dark';
const THEME_LIGHT = 'default';
const ATTR_DATA_THEME = 'data-theme';
const VALUE_LIGHT = 'light';
const VALUE_SYSTEM = 'system';
const MEDIA_QUERY_DARK = '(prefers-color-scheme: dark)';
const ID_PREFIX = 'mermaid-';

export interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

function checkDarkMode(): boolean {
  if (typeof document === 'undefined') return true;
  const theme = document.documentElement.getAttribute(ATTR_DATA_THEME);
  if (theme === VALUE_LIGHT) return false;
  if (theme === THEME_DARK) return true;
  if (theme === VALUE_SYSTEM && typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia(MEDIA_QUERY_DARK).matches;
  }
  return true;
}

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState<boolean>(checkDarkMode);

  useEffect(() => {
    const update = () => setIsDark(checkDarkMode());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [ATTR_DATA_THEME],
    });

    const mql = window.matchMedia?.(MEDIA_QUERY_DARK);
    mql?.addEventListener?.('change', update);

    return () => {
      observer.disconnect();
      mql?.removeEventListener?.('change', update);
    };
  }, []);

  return isDark;
}

/**
 * Renders Mermaid UML diagrams (flowcharts, sequence, class, state, ER diagrams) client-side into SVG.
 */
export function MermaidDiagram({ chart, className = '' }: MermaidDiagramProps) {
  const isDark = useIsDarkMode();
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function renderChart() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? THEME_DARK : THEME_LIGHT,
          securityLevel: 'loose',
          fontFamily: 'inherit',
        });

        const id = `${ID_PREFIX}${Math.random().toString(36).substring(2, 10)}`;
        const { svg: renderedSvg } = await mermaid.render(id, chart);
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to parse Mermaid diagram');
        }
      }
    }

    void renderChart();
    return () => {
      isMounted = false;
    };
  }, [chart, isDark]);

  if (error) {
    return (
      <div
        className={`mermaid-error ${className}`.trim()}
        data-testid="mermaid-error"
        style={{
          padding: '0.875rem 1rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid var(--color-error)',
          color: 'var(--color-error)',
          margin: '1rem 0',
          fontSize: '0.85rem',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>
          ⚠️ Mermaid Syntax Error
        </div>
        <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>{error}</div>
        <pre
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            overflowX: 'auto',
            fontSize: '0.75rem',
            color: 'var(--color-text-secondary)',
          }}
        >
          {chart}
        </pre>
      </div>
    );
  }

  if (svg) {
    return (
      <div
        className={`mermaid-diagram ${className}`.trim()}
        data-testid="mermaid-diagram"
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflowX: 'auto',
          margin: '1.25rem 0',
          padding: '1rem',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-surface-border)',
        }}
      />
    );
  }

  return (
    <div
      className={`mermaid-diagram ${className}`.trim()}
      data-testid="mermaid-diagram"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '1.25rem 0',
        padding: '1rem',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      <pre className="mermaid" style={{ margin: 0, font: 'inherit' }}>
        <code>{chart}</code>
      </pre>
    </div>
  );
}
