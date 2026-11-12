import { createRoot } from 'react-dom/client';
import App from './App';
import { init } from './store/store';
import { registerSW } from './pwa';
import './styles.css';

registerSW();

createRoot(document.getElementById('root')!).render(<App />);
init().catch((e) => { document.getElementById('root')!.textContent = 'Не удалось открыть базу данных: ' + (e?.message ?? e); });
