// Angular's Express SSR server (as `ng add @angular/ssr` writes it), plus the POST echo the smoke spec submits to.
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.post('/echo', express.urlencoded({ extended: false }), (req, res) => {
  res.json({ method: 'POST', fields: req.body });
});

app.use(express.static(browserDistFolder, { maxAge: '1y', index: false, redirect: false }));

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env['PORT'] || 4000);
  app.listen(port, '127.0.0.1', (error) => {
    if (error) throw error;
    console.log(`Angular SSR smoke on http://127.0.0.1:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
