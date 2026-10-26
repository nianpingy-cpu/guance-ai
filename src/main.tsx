import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/noto-sans-sc';
import './styles/global.css';
import { initializeDesktop } from './desktop/client';

void initializeDesktop().then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)).catch(() => { const root = document.getElementById('root'); if (root) root.textContent = '本地数据服务未能启动。请保留数据目录，重启应用或从备份恢复。'; });
