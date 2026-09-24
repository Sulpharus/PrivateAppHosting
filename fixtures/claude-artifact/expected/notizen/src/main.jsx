import { mininode } from '@mininode/sdk';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './app.css';

const mn = await mininode();
await mn.auth.requireLogin();
createRoot(document.getElementById('root')).render(<App mn={mn} />);
