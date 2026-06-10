import { memo } from 'react';

/**
 * Vehicle telemetry + MQTT device status badge.
 */
function VehicleStatusBadge({ health, compact = false }) {
  if (!health) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
        <span className="h-2 w-2 rounded-full bg-slate-400" />
        Unknown
      </span>
    );
  }

  const stream = health.streamStatus || 'offline';
  const mqtt = health.mqttStatus || 'none';

  const streamColors = {
    live: 'bg-green-500',
    stale: 'bg-yellow-500',
    offline: 'bg-slate-400',
  };

  const streamLabels = {
    live: 'Live',
    stale: 'Delayed',
    offline: 'Offline',
  };

  const mqttLabels = {
    online: 'MQTT Online',
    offline: 'MQTT Offline',
    none: 'No MQTT Device',
    revoked: 'Device Revoked',
    unknown: 'MQTT Unknown',
  };

  const mqttColors = {
    online: 'text-green-600 dark:text-green-400',
    offline: 'text-red-600 dark:text-red-400',
    none: 'text-slate-500',
    revoked: 'text-red-700',
    unknown: 'text-slate-500',
  };

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1.5"
        title={`Stream: ${streamLabels[stream]} | ${mqttLabels[mqtt]}`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${streamColors[stream]}`} />
        {!compact && <span className="text-xs text-slate-600 dark:text-slate-400">{streamLabels[stream]}</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-2.5 w-2.5 rounded-full ${streamColors[stream]}`} />
        <span className="font-medium">{streamLabels[stream]}</span>
      </span>
      <span className={`text-xs ${mqttColors[mqtt]}`}>{mqttLabels[mqtt]}</span>
      {health.lastHeartbeatAt && (
        <span className="text-xs text-slate-500">
          Heartbeat: {new Date(health.lastHeartbeatAt).toLocaleString()}
        </span>
      )}
      {health.lastObdAt && (
        <span className="text-xs text-slate-500">
          Telemetry: {new Date(health.lastObdAt).toLocaleString()}
        </span>
      )}
    </div>
  );
}

const MemoizedVehicleStatusBadge = memo(VehicleStatusBadge);

export default MemoizedVehicleStatusBadge;

export function TelemetryHealthCard({ health }) {
  if (!health) return null;

  return (
    <div className="card space-y-2">
      <h3 className="text-sm font-semibold text-slate-500">Telemetry Health</h3>
      <VehicleStatusBadge health={health} />
      {health.device && (
        <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
          <div>
            <dt className="text-slate-500">Device</dt>
            <dd className="font-mono">{health.device.deviceUid}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>{health.device.status}</dd>
          </div>
          {health.device.firmwareVersion && (
            <div>
              <dt className="text-slate-500">Firmware</dt>
              <dd>{health.device.firmwareVersion}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
