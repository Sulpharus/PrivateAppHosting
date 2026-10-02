import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api.ts';
import { dateTime } from './AdminLayout.tsx';

// What the NucBox uses and what is left: the Proxmox host, its VMs and storage, and the
// containers on the Linux VM (nucbox-control → GET /resources). Refreshes every 15 seconds.

interface Usage {
  used: number;
  total: number;
}

interface Report {
  at: string;
  host: {
    cpu: number;
    cores: number;
    memory: Usage;
    rootfs: Usage;
    uptimeSeconds: number;
    load: number[];
  } | null;
  storage: ({ name: string; type: string } & Usage)[];
  vms: { vmid: number; name: string; status: string; cpu: number; memory: Usage; disk: number }[];
  containers: { name: string; app: string | null; running: boolean; cpu: number; memory: Usage }[];
  errors: string[];
}

const GB = 1024 ** 3;
const gb = (bytes: number) =>
  `${(bytes / GB).toLocaleString('de-DE', { maximumFractionDigits: bytes < 10 * GB ? 1 : 0 })} GB`;
const mb = (bytes: number) =>
  bytes >= GB ? gb(bytes) : `${Math.round(bytes / 1024 ** 2).toLocaleString('de-DE')} MB`;
const pct = (share: number) => `${Math.round(Math.min(1, Math.max(0, share)) * 100)} %`;
const share = (u: Usage) => (u.total > 0 ? u.used / u.total : 0);

const STATUS: Record<string, string> = {
  running: 'Läuft',
  stopped: 'Aus',
  suspended: 'Ruht',
  paused: 'Pausiert',
};

/** A labelled bar; turns to warning at 80 % and bad at 95 %. */
function Bar({ label, value, detail }: { label: string; value: number; detail: string }) {
  const tone = value >= 0.95 ? ' bad' : value >= 0.8 ? ' warn' : '';
  return (
    <div className="usage">
      <div className="usage-top">
        <span>{label}</span>
        <span className="muted">
          {detail}
          {!detail.includes('%') && ` (${pct(value)})`}
        </span>
      </div>
      {/* The numbers above carry the value; the bar only shows it. */}
      <div className={`meter${tone}`} aria-hidden="true">
        <span style={{ width: pct(value).replace(' ', '') }} />
      </div>
    </div>
  );
}

export function NucBox() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReport(await api<Report>('/admin/nucbox/resources'));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Die NucBox ist gerade nicht erreichbar.');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const host = report?.host ?? null;
  const running = report?.containers.filter((c) => c.running) ?? [];
  const containerMemory = running.reduce((sum, c) => sum + c.memory.used, 0);
  const vmReserved = (report?.vms ?? [])
    .filter((vm) => vm.status === 'running')
    .reduce((sum, vm) => sum + vm.memory.total, 0);

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h2 style={{ fontSize: 24 }}>Auslastung</h2>
        <p className="muted">
          Auslastung von Host, VMs, Speicher und Container-Apps.
          {report && ` Stand ${dateTime(report.at)}, aktualisiert alle 15 Sekunden.`}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report?.errors.length ? (
        <p className="error" role="status">
          Nicht alles lesbar: {report.errors.join('; ')}
        </p>
      ) : null}
      {!report && !error && <p className="muted">Wird geladen …</p>}

      {host && (
        <div className="kpis">
          <div className="card kpi">
            <span className="muted">Prozessor ({host.cores} Kerne)</span>
            <strong>{pct(host.cpu)}</strong>
            <span className="muted">
              Last{' '}
              {host.load
                .map((l) =>
                  l.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                )
                .join(' · ')}
            </span>
          </div>
          <div className="card kpi">
            <span className="muted">Arbeitsspeicher frei</span>
            <strong>{gb(host.memory.total - host.memory.used)}</strong>
            <span className="muted">von {gb(host.memory.total)}</span>
          </div>
          <div className="card kpi">
            <span className="muted">Systemplatte frei</span>
            <strong>{gb(host.rootfs.total - host.rootfs.used)}</strong>
            <span className="muted">von {gb(host.rootfs.total)}</span>
          </div>
        </div>
      )}

      {host && (
        <section className="card" aria-labelledby="host-title">
          <h2 id="host-title" className="section-title">
            Host
          </h2>
          <Bar label="Prozessor" value={host.cpu} detail={pct(host.cpu)} />
          <Bar
            label="Arbeitsspeicher"
            value={share(host.memory)}
            detail={`${gb(host.memory.used)} von ${gb(host.memory.total)}`}
          />
          <Bar
            label="Laufende VMs (zugesagt)"
            value={host.memory.total ? vmReserved / host.memory.total : 0}
            detail={`${gb(vmReserved)} von ${gb(host.memory.total)}`}
          />
          {report?.storage.map((s) => (
            <Bar
              key={s.name}
              label={`Speicher ${s.name} (${s.type})`}
              value={share(s)}
              detail={`${gb(s.used)} von ${gb(s.total)}`}
            />
          ))}
        </section>
      )}

      {report && report.vms.length > 0 && (
        <section className="card" aria-labelledby="vms-title">
          <h2 id="vms-title" className="section-title">
            Virtuelle Maschinen
          </h2>
          {report.vms.map((vm) => (
            <div key={vm.vmid} className="usage-group">
              <div className="row">
                <strong style={{ flex: 1 }}>{vm.name}</strong>
                <span className={`pill${vm.status === 'running' ? ' ok' : ''}`}>
                  <span className="dot" />
                  {STATUS[vm.status] ?? vm.status}
                </span>
              </div>
              {vm.status === 'running' && (
                <>
                  <Bar
                    label={`${vm.name}: Arbeitsspeicher`}
                    value={share(vm.memory)}
                    detail={`${gb(vm.memory.used)} von ${gb(vm.memory.total)}`}
                  />
                  <Bar label={`${vm.name}: Prozessor`} value={vm.cpu} detail={pct(vm.cpu)} />
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {report && (
        <section className="card" aria-labelledby="containers-title">
          <h2 id="containers-title" className="section-title">
            Container
          </h2>
          <p className="muted">
            {running.length} laufen und nutzen zusammen {mb(containerMemory)} Arbeitsspeicher.
          </p>
          {report.containers.length === 0 && <p className="muted">Keine Container gefunden.</p>}
          {report.containers.length > 0 && (
            <div className="table-wrap">
              <table className="table table--cards">
                <thead>
                  <tr>
                    <th>Container</th>
                    <th>Status</th>
                    <th>Arbeitsspeicher</th>
                    <th>Prozessor</th>
                  </tr>
                </thead>
                <tbody>
                  {report.containers.map((c) => (
                    <tr key={c.name}>
                      <td>
                        <strong>{c.app ?? c.name}</strong>
                        {c.app && <div className="muted mono">{c.name}</div>}
                      </td>
                      <td data-label="Status">{c.running ? 'Läuft' : 'Gestoppt'}</td>
                      <td data-label="Arbeitsspeicher">
                        {c.running
                          ? c.memory.total > 0
                            ? `${mb(c.memory.used)} von ${mb(c.memory.total)}`
                            : mb(c.memory.used)
                          : '–'}
                      </td>
                      <td data-label="Prozessor" className="mono">
                        {c.running
                          ? `${c.cpu.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Kerne`
                          : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
