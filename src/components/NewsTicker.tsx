import { useMemo } from 'react';
import { useContent } from '../hooks/useContent';
import { Theme } from '../themes';
import './NewsTicker.css';

interface NewsTickerProps {
  theme: Theme;
}

// Sanitize HTML to only allow safe tags: b, i, u, a, strong, em
function sanitizeTickerHtml(html: string): string {
  const allowedTags = ['b', 'i', 'u', 'a', 'strong', 'em'];
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  function processNode(node: Node): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      if (!allowedTags.includes(tagName)) {
        // Replace disallowed tag with its text content
        const text = document.createTextNode(element.textContent || '');
        node.parentNode?.replaceChild(text, node);
        return;
      }

      // For anchor tags, only allow href and target attributes
      if (tagName === 'a') {
        const allowedAttrs = ['href', 'target'];
        [...element.attributes].forEach(attr => {
          if (!allowedAttrs.includes(attr.name)) {
            element.removeAttribute(attr.name);
          }
        });
        // Ensure safe link behavior
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      } else {
        // Remove all attributes from other tags
        [...element.attributes].forEach(attr => {
          element.removeAttribute(attr.name);
        });
      }

      // Process children
      [...node.childNodes].forEach(processNode);
    }
  }

  [...tempDiv.childNodes].forEach(processNode);
  return tempDiv.innerHTML;
}

export function NewsTicker({ theme }: NewsTickerProps) {
  const { data, isLoading, error } = useContent();

  // Sanitize ticker HTML content
  const sanitizedTicker = useMemo(() => {
    const tickerText = data?.ticker || 'Welcome to Chord-ID!';
    return sanitizeTickerHtml(tickerText);
  }, [data?.ticker]);

  // Don't render anything if loading or error with no cached data
  if (isLoading && !data) {
    return (
      <div className="news-ticker-container">
        <div
          className="news-ticker-wrapper"
          style={{
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
          }}
        >
          {/* Ticker section - loading state */}
          <div
            className="news-ticker-section"
            style={{
              height: '40px',
              borderBottom: `1px solid ${theme.colors.primary}20`,
            }}
          >
            <div
              className="news-ticker-loading"
              style={{ color: theme.colors.textMuted }}
            >
              Loading...
            </div>
          </div>

          {/* Banner section - loading state */}
          <div
            className="news-banner-section"
            style={{
              height: '80px',
            }}
          />
        </div>
      </div>
    );
  }

  // Handle error state gracefully - just don't show the component
  if (error && !data) {
    return null;
  }

  return (
    <div className="news-ticker-container">
      <div
        className="news-ticker-wrapper"
        style={{
          background: 'transparent',
          borderRadius: '8px',
        }}
      >
        {/* Ticker section - scrolling text */}
        <div
          className="news-ticker-section"
          style={{
            height: '40px',
            borderBottom: `1px solid ${theme.colors.primary}20`,
          }}
        >
          <div className="news-ticker-content">
            <div
              className="news-ticker-text"
              style={{
                color: theme.colors.text,
                textShadow: `0 0 10px ${theme.colors.primaryGlow}40`,
              }}
              dangerouslySetInnerHTML={{ __html: sanitizedTicker }}
            />
          </div>
        </div>

        {/* Banner section - clickable image */}
        <div
          className="news-banner-section"
          style={{
            height: '80px',
          }}
        >
          {data?.banner?.imageUrl && (
            <a
              href={data.banner.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="news-banner-link"
            >
              <img
                src={data.banner.imageUrl}
                alt="Banner"
                className="news-banner-image"
                onError={(e) => {
                  // Hide image on error
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
