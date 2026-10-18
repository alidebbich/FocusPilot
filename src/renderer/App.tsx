import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AIAssistant from './pages/AIAssistant';
import InterviewPractice from './pages/InterviewPractice';
import CodingPractice from './pages/CodingPractice';
import Transcription from './pages/Transcription';
import ScreenAnalysis from './pages/ScreenAnalysis';
import NotesHistory from './pages/NotesHistory';
import Settings from './pages/Settings';
import About from './pages/About';
import { ToastProvider } from './components/Toast';
import { SettingsProvider } from './context/SettingsContext';

export default function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/assistant" element={<AIAssistant />} />
            <Route path="/interview" element={<InterviewPractice />} />
            <Route path="/coding" element={<CodingPractice />} />
            <Route path="/transcription" element={<Transcription />} />
            <Route path="/screen" element={<ScreenAnalysis />} />
            <Route path="/notes" element={<NotesHistory />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </SettingsProvider>
  );
}
