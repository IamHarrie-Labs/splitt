import type { Metadata } from 'next';
import { Agentation } from 'agentation';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'Splitt | Project payment workspace',
  description:
    'Allocate partial client payments across approved contractor obligations while protecting each project’s reserve.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === 'development' && <Agentation appName="Splitt" />}
      </body>
    </html>
  );
}
