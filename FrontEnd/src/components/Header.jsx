import { memo } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Header.css";

function Header({
  children,
  title = "Catálogo ABR",
  subtitle = "Peças automotivas",
  showLogo = true,
  showBackButton = false,
  onBackClick = null,
  onLogoClick = null
}) {
  const navigate = useNavigate();

  const handleLogoClick = () => {
    if (onLogoClick) {
      onLogoClick();
    } else {
      navigate("/");
    }
  };

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="catalog-header">
      <div className="header-container">
        <div className="header-brand">
          {showBackButton && (
            <button className="header-back-btn" onClick={handleBackClick}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="brand-content" onClick={handleLogoClick} style={{ cursor: 'pointer' }}>
            {showLogo ? (
              <img
                src="/images/LOGO_ABR.png"
                alt={title}
                className="header-logo"
              />
            ) : (
              <>
                <h1 className="header-title">{title}</h1>
                {subtitle && <p className="header-subtitle">{subtitle}</p>}
              </>
            )}
          </div>
        </div>

        <div className="header-actions">
          {children}
        </div>
      </div>
    </header>
  );
}

export default memo(Header);