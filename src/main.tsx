import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'

// Restaurar color de tema guardado (Cambio de color)
try {
  const themeId = localStorage.getItem('bv_theme_color') || 'green';
  const themes: Record<string, { from: string; to: string; light: string; soft: string }> = {
    green:  { from: '#16a34a', to: '#15803d', light: '#dcfce7', soft: '#bbf7d0' },
    blue:   { from: '#2563eb', to: '#1d4ed8', light: '#dbeafe', soft: '#bfdbfe' },
    purple: { from: '#7c3aed', to: '#6d28d9', light: '#ede9fe', soft: '#ddd6fe' },
    orange: { from: '#ea580c', to: '#c2410c', light: '#ffedd5', soft: '#fed7aa' },
    teal:   { from: '#0d9488', to: '#0f766e', light: '#ccfbf1', soft: '#99f6e4' },
  };
  const t = themes[themeId] || themes.green;
  const root = document.documentElement;
  root.style.setProperty('--bv-primary', t.from);
  root.style.setProperty('--bv-primary-dark', t.to);
  root.style.setProperty('--bv-primary-light', t.light);
  root.style.setProperty('--bv-primary-soft', t.soft);
  root.style.setProperty('--lottery-green', t.from);
  root.style.setProperty('--lottery-dark', t.to);
  root.style.setProperty('--lottery-light', t.light);
  root.style.setProperty('--lottery-accent', t.from);
} catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Register Service Worker for PWA (necesario para poder instalar la app)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('SW registered:', registration.scope);
        // Forzar busqueda de nueva version del SW
        registration.update().catch(() => {});
      })
      .catch((error) => {
        console.warn('SW registration failed:', error);
      });
  });
}
