import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

import { enregistrerServiceWorker } from '@/outils/notifications';

import { App } from './App';
import './index.css';

// Le service worker affiche les notifications du navigateur, même site fermé.
enregistrerServiceWorker();

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <Toaster position="top-center" />
    </TooltipProvider>
  </StrictMode>,
);
