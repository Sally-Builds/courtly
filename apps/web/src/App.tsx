import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { EmptyState, Loading } from './components/ui';
import { AdminCourtsPage } from './pages/AdminCourtsPage';
import { AdminDayPage } from './pages/AdminDayPage';
import { CourtBookingPage } from './pages/CourtBookingPage';
import { CourtsPage } from './pages/CourtsPage';
import { LoginPage } from './pages/LoginPage';
import { MyBookingsPage } from './pages/MyBookingsPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

/** UI-side guard for navigation only; the API enforces the admin role independently. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <EmptyState>This page is only available to administrators.</EmptyState>;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<CourtsPage />} />
        <Route path="courts/:courtId" element={<CourtBookingPage />} />
        <Route path="bookings" element={<MyBookingsPage />} />
        <Route path="admin/day" element={<RequireAdmin><AdminDayPage /></RequireAdmin>} />
        <Route path="admin/courts" element={<RequireAdmin><AdminCourtsPage /></RequireAdmin>} />
        <Route path="*" element={<EmptyState>Page not found.</EmptyState>} />
      </Route>
    </Routes>
  );
}
