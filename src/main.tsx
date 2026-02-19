import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Error handler for initialization errors
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  const root = document.getElementById('root');
  if (root && !root.querySelector('.error-message')) {
    root.innerHTML = `
      <div class="error-message" style="padding: 20px; text-align: center; color: red;">
        <h2>Application Error</h2>
        <p>${event.error?.message || 'Unknown error occurred'}</p>
        <p style="font-size: 12px; color: #666;">Check console for details</p>
      </div>
    `;
  }
});

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (error) {
  console.error('Failed to initialize app:', error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 20px; text-align: center; color: red;">
        <h2>Initialization Error</h2>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        <p style="font-size: 12px; color: #666;">Check console for details</p>
      </div>
    `;
  }
}
