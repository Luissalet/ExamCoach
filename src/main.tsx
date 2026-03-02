import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './ui/routes';
import { PwaUpdateBanner } from './ui/components/PwaUpdateBanner';
import { PwaInstallBanner } from './ui/components/PwaInstallBanner';
import { StorageWarningBanner } from './ui/components/StorageWarningBanner';
import { ThemeProvider } from './ui/context/ThemeContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppRouter />
      <PwaUpdateBanner />
      <PwaInstallBanner />
      <StorageWarningBanner />
    </ThemeProvider>
  </React.StrictMode>
);
