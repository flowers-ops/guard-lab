import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import './ui/app.css';

async function start() {
  // Browser preview of desktop states (?mock=ready, ?mock=signed-out, ...). Never in builds.
  if (import.meta.env.DEV && !window.desktop && location.search.includes('mock=')) {
    const { installDevDesktop } = await import('./ui/dev-mock-desktop.mjs');
    installDevDesktop();
  }
  createRoot(document.getElementById('root')).render(<App />);
}
start();
