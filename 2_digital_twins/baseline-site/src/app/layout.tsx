import type { Metadata } from 'next';
import './styles/globals.css';

export const metadata: Metadata = {
  title: '데카트론 코리아 | Decathlon Korea',
  description: '세상의 모든 스포츠. 데카트론에서 만나보세요.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* GTM - matches real Decathlon JS weight for TBT accuracy */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;
            f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-PLACEHOLDER');`,
          }}
        />
      </head>
      <body>
        {children}

        {/* Swetrix RUM - Captures real-world production telemetry */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              !function(e,t,n){function a(){var e=t.createElement("script");
              e.type="text/javascript",e.async=!0,
              e.src="https://swetrix.com/swt.js",
              e.onload=function(){swetrix.init("YOUR_PID",{devMode:false})},
              t.head.appendChild(e)}
              "loading"===t.readyState?t.addEventListener("DOMContentLoaded",a):a()
              }(window,document);
            `,
          }}
        />
      </body>
    </html>
  );
}
