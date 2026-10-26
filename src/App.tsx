import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { SignalsPage } from '@/pages/SignalsPage';
import { StrategyPage } from '@/pages/StrategyPage';
import { ReviewPage } from '@/pages/ReviewPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="signals" element={<SignalsPage />} />
          <Route path="strategy" element={<StrategyPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
