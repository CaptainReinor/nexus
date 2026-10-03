import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { UpdatesProvider } from './components/updates';
import './styles.css';
import './components/design.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><UpdatesProvider api={window.nexus.updates}><HashRouter><App/></HashRouter></UpdatesProvider></React.StrictMode>);
