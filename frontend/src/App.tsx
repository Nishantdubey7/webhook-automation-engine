import { useEffect, useState } from 'react';
import { api } from './lib/api';
import EventsTable from './pages/EventsTable';
import JobsTable from './pages/JobsTable';
import RulesTable from './pages/RulesTable';

type Tab = 'events' | 'jobs' | 'rules';

export default function App() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [tenantSlug, setTenantSlug] = useState<string>('');
  const [tab, setTab] = useState<Tab>('jobs');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTenants()
      .then((list) => {
        setTenants(list);
        if (list.length > 0) setTenantSlug(list[0].slug);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Webhook Automation Engine</h1>
        <div>
          <span style={{ marginRight: 8, color: '#9aa0ab', fontSize: 13 }}>
            Logged in as (tenant):
          </span>
          <select value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)}>
            {tenants.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <nav>
        <button className={tab === 'jobs' ? 'active' : ''} onClick={() => setTab('jobs')}>
          Job Runs
        </button>
        <button className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>
          Incoming Events
        </button>
        <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>
          Rules
        </button>
      </nav>

      {tenantSlug ? (
        <>
          {tab === 'jobs' && <JobsTable tenantSlug={tenantSlug} />}
          {tab === 'events' && <EventsTable tenantSlug={tenantSlug} />}
          {tab === 'rules' && <RulesTable tenantSlug={tenantSlug} />}
        </>
      ) : (
        <div className="empty">No tenants yet — run the seed script in backend/.</div>
      )}
    </div>
  );
}
