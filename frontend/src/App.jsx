import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
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
import GpsTracking from './pages/GpsTracking';
import AIAssistant from './pages/AIAssistant';
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Demo routes */}
          <Route path="/demo" element={<Dashboard />} />
          <Route path="/demo/vehicles" element={<Vehicles />} />
          <Route path="/demo/vehicles/:id" element={<VehicleDetails />} />
          <Route path="/demo/vehicles/:vehicleId/live" element={<LiveOBD />} />
          <Route path="/demo/gps-tracking" element={<GpsTracking />} />
          <Route path="/demo/diagnostics" element={<Diagnostics />} />
          <Route path="/demo/dtc" element={<DtcCodes />} />
          <Route path="/demo/trips" element={<Trips />} />
          <Route path="/demo/fuel" element={<FuelLogs />} />
          <Route path="/demo/maintenance" element={<Maintenance />} />
          <Route path="/demo/reports" element={<Reports />} />
          <Route path="/demo/drivers" element={<Drivers />} />
          <Route path="/demo/work-orders" element={<WorkOrders />} />
          <Route path="/demo/settings" element={<Settings />} />
          <Route path="/demo/admin" element={<Admin />} />
          <Route path="/demo/ai-assistant" element={<AIAssistant />} />

          {/* Live Analysis routes */}
          <Route path="/analysis" element={<Dashboard />} />
          <Route path="/analysis/vehicles" element={<Vehicles />} />
          <Route path="/analysis/vehicles/:id" element={<VehicleDetails />} />
          <Route path="/analysis/vehicles/:vehicleId/live" element={<LiveOBD />} />
          <Route path="/analysis/gps-tracking" element={<GpsTracking />} />
          <Route path="/analysis/diagnostics" element={<Diagnostics />} />
          <Route path="/analysis/dtc" element={<DtcCodes />} />
          <Route path="/analysis/trips" element={<Trips />} />
          <Route path="/analysis/fuel" element={<FuelLogs />} />
          <Route path="/analysis/maintenance" element={<Maintenance />} />
          <Route path="/analysis/reports" element={<Reports />} />
          <Route path="/analysis/drivers" element={<Drivers />} />
          <Route path="/analysis/work-orders" element={<WorkOrders />} />
          <Route path="/analysis/settings" element={<Settings />} />
          <Route path="/analysis/admin" element={<Admin />} />
          <Route path="/analysis/ai-assistant" element={<AIAssistant />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
