import { startStaticServer, lpPort } from './server.js';

// One static server for the whole run. It fails loudly (EADDRINUSE) instead of reusing a server another checkout
// started on the same port: pick another LP_PORT.
export default async function globalSetup(): Promise<() => Promise<void>> {
  const server = await startStaticServer(process.cwd(), lpPort());
  return () => new Promise((resolve) => server.close(() => resolve()));
}
