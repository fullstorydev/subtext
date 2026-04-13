export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h4>About Us</h4>
          <ul>
            <li>
              <a href="#">Feedback</a>
            </li>
            <li>
              <a href="#">Community</a>
            </li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Trust, Safety & Security</h4>
          <ul>
            <li>
              <a href="#">Help & Support</a>
            </li>
            <li>
              <a href="#">Topwork Foundation</a>
            </li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Terms of Service</h4>
          <ul>
            <li>
              <a href="#">Privacy Policy</a>
            </li>
            <li>
              <a href="#">CA Notice at Collection</a>
            </li>
            <li>
              <a href="#">Cookie Settings</a>
            </li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Accessibility</h4>
          <ul>
            <li>
              <a href="#">Desktop App</a>
            </li>
            <li>
              <a href="#">Cookie Policy</a>
            </li>
            <li>
              <a href="#">Enterprise Solutions</a>
            </li>
          </ul>
        </div>

        <div className="footer-right">
          <div className="footer-section">
            <p className="footer-text">Follow Us</p>
            <div className="social-links">
              <a href="#" aria-label="Facebook">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M20 10.061c0-5.523-4.477-10-10-10s-10 4.477-10 10c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V10.06h2.54V7.845c0-2.522 1.493-3.915 3.777-3.915 1.094 0 2.238.197 2.238.197v2.476h-1.26c-1.242 0-1.63.774-1.63 1.568V10.06h2.773l-.443 2.892h-2.33v6.987C16.343 19.189 20 15.052 20 10.061z" />
                </svg>
              </a>
              <a href="#" aria-label="LinkedIn">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M18.52 0H1.477C.66 0 0 .645 0 1.441v17.114C0 19.351.66 20 1.477 20H18.52c.816 0 1.48-.649 1.48-1.443V1.441C20 .645 19.336 0 18.52 0zM5.932 17.043H2.968V7.496h2.964v9.547zM4.45 6.195c-.951 0-1.723-.771-1.723-1.723 0-.952.772-1.723 1.723-1.723.95 0 1.723.771 1.723 1.723 0 .952-.772 1.723-1.723 1.723zm12.593 10.848h-2.962v-4.64c0-1.106-.02-2.53-1.542-2.53-1.544 0-1.78 1.205-1.78 2.449v4.721H7.797V7.496h2.844v1.305h.039c.397-.75 1.364-1.542 2.807-1.542 3.004 0 3.559 1.977 3.559 4.547v5.237z" />
                </svg>
              </a>
              <a href="#" aria-label="Twitter">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M12.362 8.486L19.141 0h-1.604l-5.89 7.353L6.906 0H0l7.112 10.348L0 19.25h1.604l6.221-7.764 5.012 7.764H20l-7.638-11.264zm-2.204 2.749l-.721-1.031L3.176 1.361h2.47l5.055 7.227.721 1.031 6.02 8.608h-2.47l-4.814-6.882z" />
                </svg>
              </a>
              <a href="#" aria-label="YouTube">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M19.582 5.374a2.514 2.514 0 00-1.768-1.768C16.254 3.125 10 3.125 10 3.125s-6.254 0-7.814.418A2.514 2.514 0 00.418 5.374C0 6.934 0 10 0 10s0 3.066.418 4.626a2.514 2.514 0 001.768 1.768c1.56.418 7.814.418 7.814.418s6.254 0 7.814-.418a2.514 2.514 0 001.768-1.768C20 13.066 20 10 20 10s0-3.066-.418-4.626zM7.957 12.876V7.124L13.183 10l-5.226 2.876z" />
                </svg>
              </a>
              <a href="#" aria-label="Instagram">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10 1.802c2.67 0 2.987.01 4.042.058 1.137.052 2.215.24 2.886.91.67.671.858 1.749.91 2.886.048 1.055.058 1.372.058 4.042s-.01 2.987-.058 4.042c-.052 1.137-.24 2.215-.91 2.886-.671.67-1.749.858-2.886.91-1.055.048-1.372.058-4.042.058s-2.987-.01-4.042-.058c-1.137-.052-2.215-.24-2.886-.91-.67-.671-.858-1.749-.91-2.886-.048-1.055-.058-1.372-.058-4.042s.01-2.987.058-4.042c.052-1.137.24-2.215.91-2.886.671-.67 1.749-.858 2.886-.91 1.055-.048 1.372-.058 4.042-.058zM10 0C7.284 0 6.944.012 5.877.06 4.246.134 2.928.523 1.993 1.458.523 2.928.134 4.246.06 5.877.012 6.944 0 7.284 0 10s.012 3.056.06 4.123c.074 1.631.463 2.949 1.398 3.884 1.458 1.47 2.776 1.859 4.407 1.933 1.067.048 1.407.06 4.123.06s3.056-.012 4.123-.06c1.631-.074 2.949-.463 3.884-1.398 1.47-1.458 1.859-2.776 1.933-4.407.048-1.067.06-1.407.06-4.123s-.012-3.056-.06-4.123c-.074-1.631-.463-2.949-1.398-3.884C17.072.523 15.754.134 14.123.06 13.056.012 12.716 0 10 0zm0 4.865a5.135 5.135 0 100 10.27 5.135 5.135 0 000-10.27zm0 8.468a3.333 3.333 0 110-6.666 3.333 3.333 0 010 6.666zm6.538-8.671a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0z" />
                </svg>
              </a>
            </div>
            <div className="mobile-app">
              Mobile app
              <div className="app-links">
                <a href="#" aria-label="iOS app">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M16.574 13.262c-.335.893-.494 1.291-.925 2.078-.602 1.097-1.451 2.464-2.503 2.476-.936.01-1.176-.612-2.448-.604-1.272.007-1.537.616-2.474.606-1.052-.012-1.856-1.247-2.458-2.344-1.684-3.068-1.859-6.67-.82-8.585.739-1.363 2.061-2.227 3.304-2.227 1.227 0 1.999.615 3.013.615 1.015 0 1.634-.616 3.099-.616 1.106 0 2.277.534 3.113 1.458-2.735 1.502-2.291 5.413.099 6.743zm-3.655-13.13c.533-.686.913-1.634.768-2.611-.844.048-1.829.595-2.406 1.287-.522.627-.963 1.584-.793 2.508.916.027 1.862-.521 2.431-1.184z" />
                  </svg>
                </a>
                <a href="#" aria-label="Android app">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10 0C4.478 0 0 4.478 0 10s4.478 10 10 10 10-4.478 10-10S15.522 0 10 0zm5.894 14.528a.622.622 0 01-.849.216l-4.425-2.554v5.11a.622.622 0 01-1.244 0v-5.11l-4.425 2.554a.622.622 0 01-.633-1.066l4.425-2.554-4.425-2.554a.622.622 0 01.633-1.066l4.425 2.554V5a.622.622 0 011.244 0v5.108l4.425-2.554a.622.622 0 01.633 1.066l-4.425 2.554 4.425 2.554a.622.622 0 01.216.85z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© 2015 - 2024 Topwork® Global Inc.</p>
      </div>

      <style>{`
        .footer {
          background: #001e00;
          color: white;
          padding: 40px 0 20px;
          margin-top: 60px;
        }
        
        .footer-content {
          max-width: 1440px;
          margin: 0 auto;
          padding: 0 20px;
          display: flex;
          justify-content: space-between;
          gap: 40px;
        }
        
        .footer-section {
          flex: 1;
        }
        
        .footer-section h4 {
          font-size: 14px;
          font-weight: 500;
          margin: 0 0 16px 0;
          color: white;
        }
        
        .footer-section ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .footer-section li {
          margin-bottom: 12px;
        }
        
        .footer-section a {
          color: rgba(255, 255, 255, 0.7);
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s;
        }
        
        .footer-section a:hover {
          color: white;
        }
        
        .footer-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }
        
        .footer-text {
          font-size: 14px;
          margin: 0 0 12px 0;
          color: rgba(255, 255, 255, 0.7);
        }
        
        .social-links {
          display: flex;
          gap: 16px;
          margin-bottom: 20px;
        }
        
        .social-links a {
          color: rgba(255, 255, 255, 0.7);
          transition: color 0.2s;
        }
        
        .social-links a:hover {
          color: white;
        }
        
        .mobile-app {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.7);
          text-align: right;
        }
        
        .app-links {
          display: flex;
          gap: 12px;
          margin-top: 8px;
        }
        
        .app-links a {
          color: rgba(255, 255, 255, 0.7);
          transition: color 0.2s;
        }
        
        .app-links a:hover {
          color: white;
        }
        
        .footer-bottom {
          max-width: 1440px;
          margin: 40px auto 0;
          padding: 20px 20px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          text-align: center;
        }
        
        .footer-bottom p {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          margin: 0;
        }
      `}</style>
    </footer>
  );
}
