import '@fontsource/golos-text/cyrillic-400.css';
import '@fontsource/golos-text/cyrillic-500.css';
import '@fontsource/golos-text/cyrillic-600.css';
import '@fontsource/golos-text/cyrillic-700.css';
import '@fontsource/golos-text/cyrillic-800.css';
import '@fontsource/golos-text/latin-400.css';
import '@fontsource/golos-text/latin-600.css';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Admin from './components/Admin';
import Storefront from './components/Storefront';
import './styles.css';
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>Не удалось открыть страницу</h1>
        <p>Обновите страницу. Содержимое корзины сохранено в браузере.</p>
        <button onClick={() => location.reload()}>Обновить</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('kip-theme') === 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('kip-theme', dark ? 'dark' : 'light');
  }, [dark]);
  const props = { dark, onToggle: () => setDark(!dark) };
  return location.pathname.startsWith('/admin') ? <Admin {...props} /> : <Storefront {...props} />;
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
