import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import VehicleDetails from './pages/VehicleDetails';
import Diagnostics from './pages/Diagnostics';
import DtcCodes from './pages/DtcCodes';
import Trips from './pages/Trips';
import FuelLogs from './pages/FuelLogs';
import Maintenance from './pages/Maintenance';
import Reports from './pages/Reports';
import Drivers from './pages/Drivers';
import WorkOrders from './pages/WorkOrders';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import LiveOBD from './pages/LiveOBD';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/vehicles/:id" element={<VehicleDetails />} />
          <Route path="/vehicles/:vehicleId/live" element={<LiveOBD />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/dtc" element={<DtcCodes />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/fuel" element={<FuelLogs />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/alerts" element={<Navigate to="/reports?tab=alerts" replace />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
