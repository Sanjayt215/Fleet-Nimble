import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import api from "../services/api";
import DataTable from "../components/DataTable";
import VehicleStatusBadge from "../components/VehicleStatusBadge";
import { useMode } from "../context/ModeContext";
import { useSocket } from "../hooks/useSocket";
import { DEMO_FLEET } from "../data/demoData";

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, limit: 20 });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    vehicleName: "",
    registrationNumber: "",
    make: "",
    model: "",
    year: "",
    vin: "",
    fuelType: "",
    manufacturer: "",
    bodyClass: "",
    engineModel: "",
  });
  const { isDemo, isLive } = useMode();
  const location = useLocation();

  // Listen to vehicle-registered events from mobile app
  useSocket(
    {
      'vehicle-registered': (data) => {
        if (isDemo) return; // Don't update demo vehicles from socket
        const vehicle = data.vehicle || data;
        if (!vehicle?.id) return;
        
        // Add or update vehicle in list
        setVehicles((prev) => {
          const existing = prev.findIndex(v => v.id === vehicle.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], ...vehicle };
            return updated;
          }
          return [vehicle, ...prev];
        });
      },
    }
  );

  const filteredVehicles = useMemo(() => {
    if (!search) return vehicles;
    const lowerSearch = search.toLowerCase();
    return vehicles.filter(
      (v) =>
        (v.vehicleName?.toLowerCase() || "").includes(lowerSearch) ||
        (v.make?.toLowerCase() || "").includes(lowerSearch) ||
        (v.model?.toLowerCase() || "").includes(lowerSearch) ||
        (v.registrationNumber?.toLowerCase() || "").includes(lowerSearch) ||
        (v.plateNumber?.toLowerCase() || "").includes(lowerSearch) ||
        (v.vin?.toLowerCase() || "").includes(lowerSearch) ||
        (v.manufacturer?.toLowerCase() || "").includes(lowerSearch) ||
        (v.fuelType?.toLowerCase() || "").includes(lowerSearch) ||
        (v.bodyClass?.toLowerCase() || "").includes(lowerSearch) ||
        (v.engineModel?.toLowerCase() || "").includes(lowerSearch)
    );
  }, [vehicles, search]);

  const load = async () => {
    if (isDemo) {
      setVehicles(DEMO_FLEET);
      setMeta({ total: DEMO_FLEET.length, limit: 20 });
    } else {
      try {
        const res = await api.get("/mobile/vehicles/my");
        setVehicles(res.data?.data || []);
        setMeta({ total: (res.data?.data || []).length, limit: 20 });
      } catch (error) {
        console.error("Error loading vehicles:", error);
        setVehicles([]);
        setMeta({ total: 0, limit: 20 });
      }
    }
  };

  useEffect(() => {
    load();
  }, [isDemo]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (isDemo) {
      const newVehicle = {
        id: `demo-${Date.now()}`,
        ...form,
        plateNumber: form.registrationNumber,
        odometer: 0,
        status: "OFFLINE",
        telemetryOnline: false,
      };
      setVehicles([newVehicle, ...vehicles]);
    } else {
      try {
        await api.post("/mobile/vehicles/setup", form);
        load();
      } catch (error) {
        console.error("Error adding vehicle:", error);
      }
    }
    setShowForm(false);
    setForm({
      vehicleName: "",
      registrationNumber: "",
      make: "",
      model: "",
      year: "",
      vin: "",
      fuelType: "",
      manufacturer: "",
      bodyClass: "",
      engineModel: "",
    });
  };

  const getBasePath = () => {
    return location.pathname.startsWith("/demo") ? "/demo" : "/analysis";
  };

  const columns = [
    {
      key: "status",
      label: "Status",
      render: (v) => (
        <VehicleStatusBadge
          health={{
            telemetryHealth: {
              streamStatus: v.telemetryOnline ? "live" : "offline",
            },
          }}
          compact
        />
      ),
    },
    {
      key: "vehicleName",
      label: "Vehicle Name",
      render: (v) => v.vehicleName || `${v.make} ${v.model}` || "—",
    },
    {
      key: "registrationNumber",
      label: "Plate Number",
      render: (v) => (v.registrationNumber || v.plateNumber || "—"),
    },
    { key: "make", label: "Make", render: (v) => v.make || "—" },
    { key: "model", label: "Model", render: (v) => v.model || "—" },
    { key: "year", label: "Year", render: (v) => v.year || "—" },
    { key: "vin", label: "VIN", render: (v) => v.vin || "—" },
    {
      key: "odometer",
      label: "Odometer",
      render: (v) => (v.odometer ? `${v.odometer.toLocaleString()} km` : "—"),
    },
    {
      key: "actions",
      label: "",
      render: (v) => (
        <Link to={`${getBasePath()}/vehicles/${v.id}`} className="text-cyan-400 hover:underline">
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Vehicles</h2>
        {isDemo && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="btn-primary bg-gradient-to-r from-cyan-600 to-blue-600"
          >
            Add Vehicle
          </button>
        )}
      </div>

      {isLive && vehicles.length === 0 && (
        <div className="rounded-3xl border border-yellow-400/30 bg-yellow-500/10 px-6 py-4 text-yellow-100 shadow-inner">
          <h3 className="font-semibold mb-2">No vehicle connected yet.</h3>
          <p className="text-sm">
            Register your vehicle from the OpenOBD mobile app or add a vehicle manually.
          </p>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="card bg-slate-900/50 border border-slate-700 grid gap-4 sm:grid-cols-2"
        >
          <input
            className="input bg-slate-800 border border-slate-700"
            placeholder="Vehicle Name"
            value={form.vehicleName}
            onChange={(e) => setForm({ ...form, vehicleName: e.target.value })}
            required
          />
          <input
            className="input bg-slate-800 border border-slate-700"
            placeholder="Registration / Plate Number"
            value={form.registrationNumber}
            onChange={(e) =>
              setForm({ ...form, registrationNumber: e.target.value })
            }
            required
          />
          <input
            className="input bg-slate-800 border border-slate-700"
            placeholder="Make"
            value={form.make}
            onChange={(e) => setForm({ ...form, make: e.target.value })}
          />
          <input
            className="input bg-slate-800 border border-slate-700"
            placeholder="Model"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
          <input
            className="input bg-slate-800 border border-slate-700"
            placeholder="Year"
            type="number"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
          />
          <input
            className="input bg-slate-800 border border-slate-700"
            placeholder="VIN"
            value={form.vin}
            onChange={(e) => setForm({ ...form, vin: e.target.value })}
          />
          <input
            className="input bg-slate-800 border border-slate-700"
            placeholder="Fuel Type"
            value={form.fuelType}
            onChange={(e) => setForm({ ...form, fuelType: e.target.value })}
          />
          <input
            className="input bg-slate-800 border border-slate-700"
            placeholder="Manufacturer"
            value={form.manufacturer}
            onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
          />
          <input
            className="input bg-slate-800 border border-slate-700"
            placeholder="Body Class"
            value={form.bodyClass}
            onChange={(e) => setForm({ ...form, bodyClass: e.target.value })}
          />
          <input
            className="input bg-slate-800 border border-slate-700"
            placeholder="Engine Model"
            value={form.engineModel}
            onChange={(e) => setForm({ ...form, engineModel: e.target.value })}
          />
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="btn-primary bg-gradient-to-r from-cyan-600 to-blue-600"
            >
              Save Vehicle
            </button>
          </div>
        </form>
      )}

      <DataTable
        columns={columns}
        data={filteredVehicles}
        search={search}
        onSearchChange={setSearch}
        page={page}
        totalPages={Math.ceil((meta.total || 0) / meta.limit) || 1}
        onPageChange={setPage}
      />
    </div>
  );
}
