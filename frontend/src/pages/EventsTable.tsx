import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function EventsTable({ tenantSlug }: { tenantSlug: string }) {
  const [events, setEvents] = useState<any[]>([]);

  const load = () => api.listEvents(tenantSlug).then(setEvents).catch(() => {});

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [tenantSlug]);

  if (events.length === 0) return <div className="empty">No events received yet for this tenant.</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>Received</th>
          <th>Source</th>
          <th>Event Type</th>
          <th>Status</th>
          <th>Dedupe Key</th>
          <th>Payload</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e._id}>
            <td>{new Date(e.createdAt).toLocaleString()}</td>
            <td>{e.source}</td>
            <td>{e.eventType}</td>
            <td><span className={`badge ${e.status}`}>{e.status}</span></td>
            <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{e.dedupeKey?.slice(0, 16)}…</td>
            <td><pre className="mini">{JSON.stringify(e.payload, null, 0)}</pre></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
