import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/fonts.css';
import './design/tokens.css';
import './design/base.css';
import { App } from './app/App';

// Защита от встраивания в чужие страницы: frame-ancestors в meta не работает (SPEC §11)
if (window.top !== window.self) {
  document.body.textContent = '';
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
