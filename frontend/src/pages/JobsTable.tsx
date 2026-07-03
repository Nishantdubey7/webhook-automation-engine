import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function JobsTable({ tenantSlug }: { tenantSlug: string }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [replaying, setReplaying] = useState<Record<string, boolean>>({});

  const load = () => api.listJobs(tenantSlug).then(setJobs).catch(() => {});

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [tenantSlug]);

  const handleReplay = async (jobId: string) => {
    setReplaying((r) => ({ ...r, [jobId]: true }));
    try {
      await api.replayJob(tenantSlug, jobId);
      await load();
    } finally {
      setReplaying((r) => ({ ...r, [jobId]: false }));
    }
  };

  if (jobs.length === 0) return <div className="empty">No job runs yet for this tenant.</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>Ran</th>
          <th>Rule</th>
          <th>Status</th>
          <th>Attempts</th>
          <th>Actions</th>
          <th>Replay</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => {
          const canReplay = j.status === 'failed' || j.status === 'partial_failure';
          return (
            <tr key={j._id}>
              <td>{new Date(j.createdAt).toLocaleString()}</td>
              <td>{j.ruleName}</td>
              <td><span className={`badge ${j.status}`}>{j.status.replace('_', ' ')}</span></td>
              <td>{j.attempts}</td>
              <td>
                {j.actionResults?.map((a: any, i: number) => (
                  <div key={i} style={{ marginBottom: 4 }}>
                    <span className={`badge ${a.status}`}>{a.type}: {a.status}</span>
                    {a.error && <pre className="mini">{a.error}</pre>}
                  </div>
                ))}
              </td>
              <td>
                <button
                  className="replay"
                  disabled={!canReplay || replaying[j._id]}
                  onClick={() => handleReplay(j._id)}
                  title={canReplay ? 'Re-run failed actions' : 'Nothing to replay'}
                >
                  {replaying[j._id] ? '…' : 'Replay'}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
