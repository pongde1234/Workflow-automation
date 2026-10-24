import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@faclon-labs/fds/styles.css';
import '@faclon-labs/fds/fonts';
import './styles/global.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
