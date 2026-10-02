import { NavLink, Outlet } from 'react-router';

// Everything about the machine that runs containers and native programs: load, Remote-Apps and
// the App-Bibliothek. The pages themselves stay separate; this only gives them one home.
const TABS: [string, string, boolean][] = [
  ['/admin/hardware', 'Auslastung', true],
  ['/admin/hardware/remote', 'Remote-Apps', false],
  ['/admin/hardware/library', 'App-Bibliothek', false],
];

export function Hardware() {
  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Hardware-Server</h1>
        <p className="muted">
          Der eigene Server (Proxmox, Windows-VM, Container): wie ausgelastet er ist, welche
          Programme du im Browser öffnest und was du mit einem Klick installieren kannst.
        </p>
      </div>
      <nav className="chip-scroll" aria-label="Hardware-Server">
        {TABS.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end} className="chip">
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
