import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function RulesTable({ tenantSlug }: { tenantSlug: string }) {
  const [rules, setRules] = useState<any[]>([]);

  const load = () => api.listRules(tenantSlug).then(setRules).catch(() => {});

  useEffect(() => {
    load();
  }, [tenantSlug]);

  const toggle = async (rule: any) => {
    await api.toggleRule(tenantSlug, rule._id, !rule.enabled);
    load();
  };

  const remove = async (rule: any) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    await api.deleteRule(tenantSlug, rule._id);
    load();
  };

  if (rules.length === 0) return <div className="empty">No rules configured for this tenant yet.</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Trigger</th>
          <th>Conditions</th>
          <th>Actions</th>
          <th>Enabled</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rules.map((r) => (
          <tr key={r._id}>
            <td>{r.name}</td>
            <td>{r.source} / {r.eventType}</td>
            <td>
              <pre className="mini">
                {r.conditions.map((c: any) => `${c.field} ${c.operator} ${c.value}`).join('\nAND ') || '(always)'}
              </pre>
            </td>
            <td>
              <pre className="mini">{r.actions.map((a: any) => a.type).join(', ')}</pre>
            </td>
            <td>
              <button className="replay" onClick={() => toggle(r)}>
                {r.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </td>
            <td>
              <button className="replay" style={{ background: '#7f1d1d' }} onClick={() => remove(r)}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
