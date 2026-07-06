import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ roles }) {
  const { user, loading, isAuthenticated, sessionExpired } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-fleet-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={sessionExpired ? '/login?expired=1' : '/login'} replace state={{ from: location }} />;
  }

  if (roles?.length && !roles.includes(user?.role?.name)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
