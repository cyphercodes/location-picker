import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Development React (NODE_ENV=development in the build script) so hydration mismatches are reported, not hidden.
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: { input: { main: 'index.html', hydrate: 'hydrate.html' } },
  },
});
