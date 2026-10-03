import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { GrowthProvider } from './components/growth-ui';
import { UpdatesProvider } from './components/updates';
import './styles.css';
import './components/design.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><UpdatesProvider api={window.nexus.updates}><GrowthProvider api={window.nexus.growth}><HashRouter><App/></HashRouter></GrowthProvider></UpdatesProvider></React.StrictMode>);
