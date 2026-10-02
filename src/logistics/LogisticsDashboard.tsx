import { useEffect, useState } from "react";
import { Activity, Cable, HardDrive, RefreshCw, Thermometer } from "lucide-react";
import type { LogisticsDrive, LogisticsSnapshot, LogisticsThunderboltDevice, LogisticsThunderboltPort } from "../vite-env";

const REFRESH_MS = 3000;

function healthClass(health: string | undefined) {
  if (health === "red") return "logistics-health-red";
  if (health === "yellow") return "logistics-health-yellow";
  return "logistics-health-green";
}

function formatIo(mbps: number | null | undefined, tps: number | null | undefined) {
  if (mbps == null && tps == null) return "—";
  const throughput = mbps == null ? "—" : `${mbps.toFixed(mbps >= 10 ? 0 : 2)} MB/s`;
  const rate = tps == null ? "" : ` · ${Math.round(tps)} tps`;
  return `${throughput}${rate}`;
}

function DeviceTree({ devices }: { devices: LogisticsThunderboltDevice[] }) {
  if (!devices.length) return <p className="logistics-empty">No device on this port.</p>;
  return (
    <ul className="logistics-tree">
      {devices.map((device) => (
        <li key={device.id}>
          <div className={`logistics-device ${healthClass(device.health)}`}>
            <strong>{device.name}</strong>
            <span>{device.vendor}</span>
            <span>{device.protocol}</span>
            <span>{device.currentSpeed || "no link"}</span>
            {device.firmware ? <span>fw {device.firmware}</span> : null}
            <code>{device.uid || "no uid"}</code>
          </div>
          {device.flags.map((flag) => (
            <p className={`logistics-flag ${healthClass(flag.level)}`} key={`${device.id}-${flag.code}`}>
              {flag.code === "capped-by-host" ? "Capped by host" : flag.code === "cable-or-device" ? "Cable/device" : flag.code}: {flag.message}
            </p>
          ))}
          {device.children?.length ? <DeviceTree devices={device.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

function PortCard({ port }: { port: LogisticsThunderboltPort }) {
  return (
    <article className={`logistics-port ${healthClass(port.health)}`}>
      <header>
        <div>
          <small>Host {port.name}</small>
          <h3>{port.connected ? port.devices[0]?.name || "Connected" : "Empty"}</h3>
        </div>
        <div className="logistics-speed">
          <span>{port.currentSpeed || "—"}</span>
          <small>expect 40 Gb/s</small>
        </div>
      </header>
      <DeviceTree devices={port.devices} />
    </article>
  );
}

function DriveCard({ drive }: { drive: LogisticsDrive }) {
  return (
    <article className={`logistics-drive ${healthClass(drive.health)}`}>
      <header>
        <div>
          <small>{drive.enclosure} · {drive.protocol}</small>
          <h3>{drive.name}</h3>
          <p>{drive.model}</p>
        </div>
        <span className={`logistics-pill ${healthClass(drive.health)}`}>{drive.health}</span>
      </header>
      <dl className="logistics-meta">
        <div>
          <dt>Advertised</dt>
          <dd>{drive.advertisedLink}</dd>
        </div>
        <div>
          <dt>Current</dt>
          <dd>{drive.currentLink}</dd>
        </div>
        <div>
          <dt>I/O</dt>
          <dd>{formatIo(drive.ioMBps, drive.ioTps)}</dd>
        </div>
        <div>
          <dt>Temp</dt>
          <dd>{drive.temperatureC != null ? `${drive.temperatureC}°C` : "—"}</dd>
        </div>
      </dl>
      <div className="logistics-volumes">
        {drive.volumes.map((volume) => (
          <div className="logistics-volume" key={volume.bsd}>
            <div className="logistics-volume-row">
              <strong>{volume.name}</strong>
              <span>{volume.usedLabel} / {volume.sizeLabel}</span>
            </div>
            <div className="logistics-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, volume.percentUsed || 0)}%` }} />
            </div>
            <small>
              {volume.mount || volume.bsd} · {volume.freeLabel} free{volume.role ? ` · ${volume.role}` : ""}
            </small>
          </div>
        ))}
      </div>
      {drive.flags.map((flag) => (
        <p className={`logistics-flag ${healthClass(flag.level)}`} key={`${drive.id}-${flag.code}`}>
          {flag.message}
        </p>
      ))}
    </article>
  );
}

export function LogisticsDashboard() {
  const [snapshot, setSnapshot] = useState<LogisticsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function refresh() {
      if (inFlight || cancelled) return;
      if (!window.ricky?.getLogisticsSnapshot) {
        setError("Logistics collector is only available inside the Jarvis Electron app.");
        setLoading(false);
        return;
      }
      inFlight = true;
      try {
        const next = await window.ricky.getLogisticsSnapshot();
        if (!cancelled) {
          setSnapshot(next);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const summary = snapshot?.summary;

  return (
    <main className="logistics-app">
      <div className="window-drag-strip" aria-hidden="true" />
      <header className="logistics-hero">
        <div>
          <p className="logistics-kicker">
            <Cable size={14} /> Thunderbolt fabric
          </p>
          <h1>Logistics</h1>
          <p>
            {snapshot?.host.machine || "Mac Studio"} · {snapshot?.host.chip || "M1 Max"} · TB{snapshot?.host.thunderboltGeneration || 4} host · {snapshot?.host.advertisedLinkGbps || 40} Gb/s ceiling
          </p>
        </div>
        <div className="logistics-hero-stats">
          <div>
            <strong>{summary ? `${summary.portsConnected}/${summary.portsTotal}` : "—"}</strong>
            <span>ports up</span>
          </div>
          <div>
            <strong>{summary?.driveCount ?? "—"}</strong>
            <span>volumes</span>
          </div>
          <div className={healthClass(summary?.overall)}>
            <strong>{summary?.overall || (loading ? "…" : "err")}</strong>
            <span>fabric</span>
          </div>
          <button className="simple-button" onClick={() => window.location.reload()} aria-label="Reload logistics" title="Reload logistics">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {error ? <p className="logistics-error">{error}</p> : null}

      <section className="logistics-section">
        <div className="section-title">
          <span>Thunderbolt 4 ports</span>
          <small>{snapshot ? new Date(snapshot.collectedAt).toLocaleTimeString() : "waiting"} · live {REFRESH_MS / 1000}s</small>
        </div>
        <div className="logistics-port-grid">
          {snapshot?.thunderbolt.map((port) => (
            <PortCard port={port} key={port.id} />
          ))}
        </div>
      </section>

      <section className="logistics-section">
        <div className="section-title">
          <span>
            <HardDrive size={14} /> Storage · SSD / SD
          </span>
          <small>
            <Activity size={12} /> iostat · <Thermometer size={12} /> NVMe temp {snapshot?.drives.some((drive) => drive.temperatureC != null) ? "live" : "unavailable"}
          </small>
        </div>
        <div className="logistics-drive-grid">
          {snapshot?.drives.map((drive) => (
            <DriveCard drive={drive} key={drive.id} />
          ))}
        </div>
      </section>

      <footer className="logistics-limits">
        {(snapshot?.limits || []).map((line) => (
          <p key={line}>{line}</p>
        ))}
        {summary?.warnings.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </footer>
    </main>
  );
}
