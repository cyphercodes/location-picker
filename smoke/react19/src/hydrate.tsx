import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydrateApp } from './HydrateApp';

const root = document.getElementById('root');
if (!root) throw new Error('no #root');
hydrateRoot(
  root,
  <StrictMode>
    <HydrateApp />
  </StrictMode>,
);
