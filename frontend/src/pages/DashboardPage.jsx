import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState([]);

  useEffect(() => {
    api('/chat/campaigns').then(setCampaigns).catch(console.error);
    api('/chat/dashboard').then(setStats).catch(console.error);
  }, []);

  return (
    <div className="dashboard">
      <h2>Дашборд кампаний</h2>

      <div className="stats-grid">
        {stats.map((s) => (
          <div key={s.status} className="card">
            <strong>{s.status}</strong>
            <div>Кампаний: {s.count}</div>
            <div>Суммарный охват: {s.total_reach}</div>
          </div>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Статус</th>
            <th>Устройства</th>
            <th>Длительность</th>
            <th>Охват</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td>{c.status}</td>
              <td>{c.atm_count}</td>
              <td>{c.forecast_days} дней</td>
              <td>{c.forecast_reach}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
