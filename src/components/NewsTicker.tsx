import { useContent } from '../hooks/useContent';
import { Theme } from '../themes';
import './NewsTicker.css';

interface NewsTickerProps {
  theme: Theme;
}

export function NewsTicker({ theme }: NewsTickerProps) {
  const { data, isLoading, error } = useContent();

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
            >
              {data?.ticker || 'Welcome to Chord-ID!'}
            </div>
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
