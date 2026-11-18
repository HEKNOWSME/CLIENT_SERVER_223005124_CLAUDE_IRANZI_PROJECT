'use client';
// This leaf checks the running API from the browser and lets the developer retry.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HealthResponse } from '@pmrms/contracts';
import { getHealth } from '../lib/api';

export function ConnectionStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const check = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setLoading(true); setError(null); setHealth(null);
    try { setHealth(await getHealth(controller.signal)); }
    catch { if (active.current === controller) setError('Connection failed. Make sure the API and PostgreSQL are running, then try again.'); }
    finally { clearTimeout(timeout); if (active.current === controller) setLoading(false); }
  }, []);
  useEffect(() => { void check(); return () => { active.current?.abort(); active.current = null; }; }, [check]);
  const ready = health?.status === 'ok';
  return <section className="connection-panel" aria-label="Local service connections">
    <div className="panel-heading"><div><p className="eyebrow">WORKSPACE STATUS</p><h2>{loading ? 'Checking your connections…' : ready ? 'Everything is connected.' : 'A connection needs attention.'}</h2></div>
      <button disabled={loading} onClick={() => void check()}>{loading ? 'Checking…' : 'Check again'}<span aria-hidden="true"> ↗</span></button>
    </div>
    <div className="services">
      <Service number="01" name="Frontend" detail="Next.js · React · Tailwind" status="Running" good />
      <Service number="02" name="Backend" detail="NestJS · REST API · OpenAPI" status={loading ? 'Checking' : health ? 'Connected' : 'Unavailable'} good={Boolean(health)} />
      <Service number="03" name="Database" detail="PostgreSQL · Prisma 7" status={loading ? 'Checking' : health?.database === 'connected' ? 'Connected' : 'Unavailable'} good={health?.database === 'connected'} />
    </div>
    <div className="connection-note" aria-live="polite">
      {loading ? 'Requesting a live database check through the API.' : error ?? (ready ? 'Verified through a real Prisma query to the local database.' : health?.setup === 'seed-required' ? 'Database connected. Run pnpm db:seed to finish setup.' : 'Database check failed. Check the database settings and run pnpm db:migrate.')}
    </div>
  </section>;
}

function Service({ number, name, detail, status, good }: { number: string; name: string; detail: string; status: string; good: boolean }) {
  return <article className="service"><span className="service-number">{number}</span><h3>{name}</h3><p>{detail}</p><span className={`status ${good ? 'connected' : 'pending'}`}><span aria-hidden="true">●</span> {status}</span></article>;
}
