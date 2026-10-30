export const metadata = { title: 'Next.js smoke' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* The server-rendered picker, kept to prove hydration reuses it instead of re-rendering. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "window.__ssrPicker = document.querySelector('location-picker#recipe');",
          }}
        />
      </body>
    </html>
  );
}
