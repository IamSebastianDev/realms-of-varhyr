import '../../../packages/ui/src/fonts';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ApplicationPreferences } from '../../../packages/ui/src';
import { App } from './App';
import './studio.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ApplicationPreferences><App/></ApplicationPreferences></React.StrictMode>);
