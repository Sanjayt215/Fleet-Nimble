import { useEffect, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";
import { useSocket } from "../hooks/useSocket";
import { useMode } from "../context/ModeContext";
import { DEMO_FLEET, DEMO_DTCS } from "../data/demoData";

export default function DtcCodes() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState("");
  const [tab, setTab] = useState("active");
  const [codes, setCodes] = useState([]);
  const { isDemo, isLive } = useMode();

  useSocket({
    "dtc:new": (data) => {
      if (isDemo) return;
      if (!vehicleId || data.vehicleId === vehicleId) {
        if (tab === "active" && data.active) setCodes((prev) => [data, ...prev]);
        if (tab === "history") setCodes((prev) => [data, ...prev]);
      }
    },
  });

  useEffect(() => {
    if (isDemo) {
      setVehicles(DEMO_FLEET);
      if (DEMO_FLEET.length > 0) setVehicleId(DEMO_FLEET[0].id);
    } else {
      api.get("/mobile/vehicles/my").then((r) => {
        setVehicles(r.data?.data || []);
        if (r.data?.data?.[0]) setVehicleId(r.data.data[0].id);
      }).catch(() => setVehicles([]));
    }
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) {
      let filtered = tab === "active" ? DEMO_DTCS.filter((d) => d.active) : DEMO_DTCS;
      if (vehicleId) filtered = filtered.filter((d) => d.vehicleId === vehicleId);
      setCodes(filtered);
    } else {
      if (!vehicleId) return;
      setCodes([]);
    }
  }, [vehicleId, tab, isDemo]);

  const clearCodes = async () => {
    if (isDemo) {
      setCodes(codes.map((c) => ({ ...c, active: false })));
    }
  };

  const columns = [
    {
      key: "code",
      label: "Code",
      render: (r) => <span className="font-mono font-bold">{r.code}</span>,
    },
    { key: "description", label: "Description" },
    {
      key: "status",
      label: "Type",
      render: (r) => (
        <span className={r.status === "Pending" ? "text-yellow-400" : "text-slate-300"}>
          {r.status || "Confirmed"}
        </span>
      ),
    },
    { key: "severity", label: "Severity" },
    { key: "active", label: "Active", render: (r) => (r.active ? "Yes" : "Cleared") },
    {
      key: "detectedAt",
      label: "Detected",
      render: (r) => new Date(r.detectedAt).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">DTC Codes</h2>
          <p className="text-slate-400">Confirmed (Mode 03) and pending (Mode 07) fault codes</p>
        </div>
        {isDemo && (
          <button type="button" onClick={clearCodes} className="btn-secondary bg-slate-800 border-slate-700">
            Clear Active Codes
          </button>
        )}
      </div>
      {vehicles.length > 0 && (
        <select
          className="input max-w-xs bg-slate-800 border border-slate-700 text-white"
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.vehicleName || `${v.make} ${v.model}`}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        {["active", "history"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? "bg-cyan-600 text-white" : "btn-secondary"
            }`}
          >
            {t === "active" ? "Active Codes" : "History"}
          </button>
        ))}
      </div>
      {isLive && codes.length === 0 ? (
        <div className="card bg-slate-800/30 border border-slate-700 p-8 text-center">
          <h3 className="text-lg font-semibold text-white">No live DTCs received.</h3>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={codes}
          emptyMessage={tab === "active" ? "No active fault codes" : "No DTC history"}
        />
      )}
    </div>
  );
}
