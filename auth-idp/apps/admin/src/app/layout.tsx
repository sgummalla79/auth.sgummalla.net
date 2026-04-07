import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'IDP Admin',
  description: 'Admin dashboard for auth.sgummalla.net',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var t = localStorage.getItem('theme');
                if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', t);
              })();
            `,
          }}
        />
      </head>
      <body className="relative overflow-x-hidden">
        <svg
          className="pointer-events-none select-none fixed"
          style={{
            right: '-60px',
            bottom: '-40px',
            width: '420px',
            height: '420px',
            opacity: 0.04,
            zIndex: 0,
          }}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="15.5" r="1.5" fill="currentColor" />
          <rect x="11.4" y="16.5" width="1.2" height="2.5" rx="0.6" fill="currentColor" />
        </svg>

        <div className="relative" style={{ zIndex: 1 }}>
          {children}
        </div>
      </body>
    </html>
  )
}