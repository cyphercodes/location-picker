import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { HydrateApp } from './HydrateApp';

export function render(): string {
  return renderToString(
    <StrictMode>
      <HydrateApp />
    </StrictMode>,
  );
}
