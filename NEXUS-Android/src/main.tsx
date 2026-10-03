import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { UpdatesProvider } from '../../NEXUS/src/renderer/components/updates';
import { updates } from './updates';
import './style.css';
import './styles.css';
import '../../NEXUS/src/renderer/components/design.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><UpdatesProvider api={updates}><App/></UpdatesProvider></React.StrictMode>);
