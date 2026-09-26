import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import { App } from './App.tsx';
import { registerOffline } from './app/offline.ts';

registerOffline();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
