import React from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
// Page views and the events in analytics.ts. No cookies, no personal data.
inject();
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

registerSW({ immediate: true });
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
