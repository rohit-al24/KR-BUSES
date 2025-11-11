import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Coordinator() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any | null>(null);
  const [route, setRoute] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [count, setCount] = useState<number | ''>('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [lastPin, setLastPin] = useState<string | null>(null);
  const [lastPinExpiry, setLastPinExpiry] = useState<string | null>(null);
  const [creatingQr, setCreatingQr] = useState(false);
  const [qrFallbackDataUrl, setQrFallbackDataUrl] = useState<string | null>(null);
  const pollingRef = React.useRef<number | null>(null);
  const backgroundPollingRef = React.useRef<number | null>(null);
  const lastPresentRef = React.useRef<number>(0);
  const lastStatusRef = React.useRef<Record<string, string>>({});
  const [notification, setNotification] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  // helper: fetch latest attendance request and merge student statuses into route.students
  const fetchLatestRequestAndMerge = async () => {
    if (!route) return;
    try {
      const resp = await fetch(`/routes/${route.number}/attendance-request/latest`);
      if (!resp.ok) return;
      const j = await resp.json();
      const req = j?.request;
      if (!req) return;
      const statusMap: Record<string, string> = {};
      (req.students || []).forEach((s: any) => { statusMap[s.id] = s.status; });
  // merge into route.students using functional updater to avoid stale closures
      const mergedStudents = (route.students || []).map((s: any) => ({ ...s, status: statusMap[s.id] || 'pending' }));
      // compute present count
      const present = Object.values(statusMap).filter((v) => v === 'present').length || 0;
      // update route state with merged students and latest summary
      setRoute((prev: any) => {
        const next = { ...(prev || route), students: mergedStudents, lastRequestId: req.id, lastRequestPresent: present, lastRequestFinalized: req.finalized || false, lastRequestFinalizedAt: req.finalizedAt || null };
        // debug log
        // eslint-disable-next-line no-console
        console.log('Merged attendance request', req.id, 'present=', present, 'mergedStudentsSample=', mergedStudents.slice(0,5).map((s:any)=>({id:s.id.slice(0,8),status:s.status}))); 
        return next;
      });
      // if the request has been finalized, close the QR modal automatically
      if (req.finalized && showQr) {
        setShowQr(false);
        setQrImageUrl(null);
        setScanUrl(null);
        setLastPin(null);
        setLastPinExpiry(null);
        setQrFallbackDataUrl(null);
      }
      // detect newly marked present students and notify with names
      try {
        const prevMap = lastStatusRef.current || {};
        const newlyPresent = Object.keys(statusMap).filter((id) => statusMap[id] === 'present' && prevMap[id] !== 'present');
        if (newlyPresent.length > 0) {
          const names = mergedStudents.filter((s: any) => newlyPresent.includes(s.id)).map((s: any) => s.name).slice(0, 3);
          const text = names.join(', ') + (newlyPresent.length > 3 ? ` +${newlyPresent.length - 3} more` : '');
          setNotification(`${text} marked present`);
          setTimeout(() => setNotification(null), 4000);
        }
        lastStatusRef.current = statusMap;
        lastPresentRef.current = present;
        setLastUpdatedAt(new Date().toLocaleTimeString());
      } catch (err) {}
    } catch (e) {
      // ignore errors
      // eslint-disable-next-line no-console
      console.error('Failed to fetch latest attendance request', e);
    }
  };

  // when modal is open, poll latest attendance request every 3 seconds so coordinator sees live responses
  useEffect(() => {
    if (showQr && route) {
      // fetch once immediately
      fetchLatestRequestAndMerge();
      // start polling
      pollingRef.current = window.setInterval(() => {
        fetchLatestRequestAndMerge();
      }, 3000) as unknown as number;
    } else {
      // stop polling
      if (pollingRef.current) {
        clearInterval(pollingRef.current as unknown as number);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current as unknown as number);
        pollingRef.current = null;
      }
    };
  }, [showQr, route]);

  // Background, low-frequency poll so coordinator sees updates even when modal is closed
  useEffect(() => {
    // only run background poll when route is loaded and modal is NOT open
    if (route && !showQr) {
      // run once immediately
      fetchLatestRequestAndMerge();
      backgroundPollingRef.current = window.setInterval(() => {
        fetchLatestRequestAndMerge();
      }, 10000) as unknown as number;
    } else {
      if (backgroundPollingRef.current) {
        clearInterval(backgroundPollingRef.current as unknown as number);
        backgroundPollingRef.current = null;
      }
    }
    return () => {
      if (backgroundPollingRef.current) {
        clearInterval(backgroundPollingRef.current as unknown as number);
        backgroundPollingRef.current = null;
      }
    };
  }, [route, showQr]);

  useEffect(() => {
    const ujson = localStorage.getItem('user');
    if (!ujson) {
      navigate('/');
      return;
    }
    let u = null;
    try {
      u = JSON.parse(ujson);
    } catch (e) {
      navigate('/');
      return;
    }
    // allow staff or coordinator
    if (!u || (u.role !== 'staff' && u.role !== 'coordinator')) {
      navigate('/');
      return;
    }
    setUser(u);

    const load = async () => {
      setLoading(true);
      try {
        const resp = await fetch(`/routes/${u.route}`);
        if (!resp.ok) {
          const txt = await resp.text();
          setError(txt || `Failed to load route (${resp.status})`);
          return;
        }
        const json = await resp.json();
        if (json && json.success) {
          setRoute(json.route);
        } else {
          setError(json?.message || 'Failed to load route');
        }
      } catch (e: any) {
        setError(e?.message || 'Network error');
      } finally {
        setLoading(false);
      }
    };

    load();

    try {
      const today = new Date().toISOString().slice(0, 10);
      setDate(today);
    } catch (e) {}
  }, [navigate]);

  const handleLogout = () => {
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('userName');
      localStorage.removeItem('userType');
    } catch (e) {}
    navigate('/');
  };

  const submitAttendance = async () => {
    setStatus(null);
    if (!route) return setStatus('No route loaded');
    if (!date || count === '') return setStatus('Please provide date and count');
    setIsSubmitting(true);
    try {
      const resp = await fetch(`/routes/${route.number}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, count: Number(count), submittedBy: user?.name || user?.email }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        setStatus(txt || `Submit failed (${resp.status})`);
        return;
      }
      const json = await resp.json();
      if (json && json.success) {
        setStatus('Submitted');
        setCount('');
        const r2resp = await fetch(`/routes/${route.number}`);
        if (r2resp.ok) {
          const r2 = await r2resp.json();
          if (r2 && r2.success) setRoute(r2.route);
        }
      } else {
        setStatus(json?.message || 'Failed');
      }
    } catch (e: any) {
      setStatus(e?.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gradient-to-b from-slate-50 via-white to-rose-50">
      {notification && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-emerald-600 text-white px-4 py-2 rounded shadow">{notification}</div>
        </div>
      )}
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Coordinator Dashboard</h1>
            <p className="text-sm text-slate-500">Manage your route, submit attendance and view recent activity.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-700">{user?.name || ''}</div>
            <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
          </div>
        </div>

        <Card className="shadow-lg">
          <div className="px-6 py-4 bg-gradient-to-r from-indigo-500 to-pink-500 rounded-t-lg text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm uppercase opacity-90">Route</div>
                <div className="text-2xl font-bold">{route?.number ?? '—'}</div>
                <div className="text-sm mt-1 opacity-90">{route?.name || ''}</div>
              </div>
              <div className="flex gap-3 items-center">
                <div className="text-right">
                  <div className="text-xs uppercase opacity-80">Bus</div>
                  <div className="font-semibold">{route?.busNumber ?? '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase opacity-80">QR</div>
                  <div>
                    <Button size="sm" onClick={async () => {
                      if (!route) return alert('No route loaded');
                      try {
                        setCreatingQr(true);
                        // create attendance request (server will create a batch and return id)
                        const resp = await fetch(`/routes/${route.number}/attendance-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                        if (!resp.ok) {
                          const txt = await resp.text();
                          alert(txt || `Failed to create request (${resp.status})`);
                          return;
                        }
                        const j = await resp.json();
                        const reqId = j?.request?.id;
                        const pin = j?.request?.pin || null;
                        const pinExpiresAt = j?.request?.pinExpiresAt || null;
                        if (!reqId) {
                          alert('Failed to get request id');
                          return;
                        }
                        const url = `${window.location.origin}/scan?route=${route.number}&requestId=${reqId}`;
                        const qr = `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(url)}`;
                        setScanUrl(url);
                        setQrImageUrl(qr);
                        setLastPin(pin);
                        setLastPinExpiry(pinExpiresAt);
                            setShowQr(true);
                            // fetch latest immediately so coordinator sees responses in modal
                            setTimeout(() => fetchLatestRequestAndMerge(), 200);
                      } catch (e: any) {
                        alert(e?.message || 'Network error');
                      } finally {
                        setCreatingQr(false);
                      }
                    }} className="btn-vibrant">{creatingQr ? 'Creating...' : 'Show QR'}</Button>
                  </div>
                </div>
                <div className="text-sm text-slate-400 pl-4">
                  {route?.lastRequestId ? (
                    <div className="flex items-center gap-2">
                      <div>Active request: <span className="font-mono text-xs">{(route.lastRequestId || '').slice(0,8)}</span></div>
                      {route?.lastRequestFinalized ? (
                        <div className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">Finalized</div>
                      ) : null}
                    </div>
                  ) : <div className="text-xs">No active request</div>}
                  {lastUpdatedAt && <div className="text-xs mt-1">Updated: {lastUpdatedAt}</div>}
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase opacity-80">Driver</div>
                  <div className="font-semibold">{route?.driver ?? '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase opacity-80">Capacity</div>
                  <div className="font-semibold">{route?.capacity ?? '—'}</div>
                </div>
              </div>
            </div>
          </div>

          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-slate-500">Loading...</div>
            ) : error ? (
              <div className="py-6 text-center text-destructive">{error}</div>
            ) : (
              <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left: staff & quick stats */}
                <div className="space-y-4">
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700">Staff on this bus</h3>
                    <div className="mt-3 space-y-2">
                      {(route?.staff || []).map((s: any) => (
                        <div key={s.id} className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold">{(s.name || 'U').slice(0,1)}</div>
                          <div className="flex-1">
                            <div className="font-medium text-slate-800">{s.name}</div>
                            <div className="text-xs text-slate-500">{s.email}</div>
                          </div>
                          {s.seatNumber ? <div className="text-sm text-slate-600">Seat {s.seatNumber}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700">Quick stats</h3>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div className="p-2 bg-indigo-50 rounded text-center">
                        <div className="text-xs text-slate-500">Students</div>
                        <div className="text-lg font-bold text-indigo-700">{(route?.students || []).length}</div>
                      </div>
                      <div className="p-2 bg-rose-50 rounded text-center">
                        <div className="text-xs text-slate-500">Attendance</div>
                        <div className="text-lg font-bold text-rose-600">{(route?.attendance || []).slice(-1)[0]?.count ?? '—'}</div>
                      </div>
                      <div className="p-2 bg-emerald-50 rounded text-center">
                        <div className="text-xs text-slate-500">Capacity</div>
                        <div className="text-lg font-bold text-emerald-700">{route?.capacity ?? '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Middle: students list */}
                <div className="md:col-span-2 space-y-4">
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-700">Students</h3>
                      <div className="text-xs text-slate-400">Total: {(route?.students || []).length}</div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 max-h-64 overflow-auto">
                      {(route?.students || [])
                        .slice()
                        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
                        .map((student: any) => (
                          <div
                            key={student.id}
                            className={
                              "flex items-center gap-3 p-2 rounded border border-slate-100 " +
                              (student.gender === 'female'
                                ? 'bg-gradient-to-r from-pink-50 via-pink-100 to-white text-pink-700'
                                : student.gender === 'male'
                                ? 'bg-gradient-to-r from-blue-50 via-blue-100 to-white text-blue-700'
                                : 'bg-white')
                            }
                          >
                            <div className={"w-10 h-10 rounded-full flex items-center justify-center font-semibold " + (student.gender === 'female' ? 'bg-pink-100 text-pink-700' : student.gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700')}>{(student.name||'').slice(0,1)}</div>
                            <div className="flex-1">
                              <div className="text-sm font-medium">{student.name}</div>
                              <div className="text-xs text-slate-500">Seat {student.seatNumber ?? '—'}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {student.paid ? (
                                <div className="flex items-center gap-2">
                                  <div className="text-xs text-emerald-700 font-semibold">Paid</div>
                                  <Button size="sm" onClick={async () => {
                                    try {
                                      const resp = await fetch(`/routes/${route.number}/students/${student.id}/mark-unpaid`, { method: 'POST' });
                                      if (!resp.ok) {
                                        const txt = await resp.text();
                                        alert(txt || `Failed (${resp.status})`);
                                        return;
                                      }
                                      const j = await resp.json();
                                      if (j && j.success) {
                                        // refresh route
                                        const r2 = await (await fetch(`/routes/${route.number}`)).json();
                                        if (r2 && r2.success) setRoute(r2.route);
                                      } else {
                                        alert(j?.message || 'Failed');
                                      }
                                    } catch (e: any) {
                                      alert(e?.message || 'Network error');
                                    }
                                  }} className="btn-ghost">Mark unpaid</Button>
                                </div>
                              ) : (
                                <Button size="sm" onClick={async () => {
                                  try {
                                    const resp = await fetch(`/routes/${route.number}/students/${student.id}/confirm-fee`, { method: 'POST' });
                                    if (!resp.ok) {
                                      const txt = await resp.text();
                                      alert(txt || `Failed (${resp.status})`);
                                      return;
                                    }
                                    const j = await resp.json();
                                    if (j && j.success) {
                                      // refresh route
                                      const r2 = await (await fetch(`/routes/${route.number}`)).json();
                                      if (r2 && r2.success) setRoute(r2.route);
                                    } else {
                                      alert(j?.message || 'Failed');
                                    }
                                  } catch (e: any) {
                                    alert(e?.message || 'Network error');
                                  }
                                }} className="btn-vibrant">Confirm paid</Button>
                              )}
                            
                              {/* status badge */}
                              <div className={"text-xs font-semibold px-2 py-1 rounded " + (student.status === 'present' ? 'bg-emerald-100 text-emerald-700' : student.status === 'absent' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600')}>
                                {student.status === 'present' ? 'Present' : student.status === 'absent' ? 'Absent' : 'Pending'}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700">Finalize attendance</h3>
                      <div className="mt-3 flex gap-3 items-center">
                        {route?.lastRequestId ? (
                          <>
                            <div className="text-sm text-slate-600">Active request: <span className="font-mono">{(route.lastRequestId||'').slice(0,8)}</span></div>
                            <Button onClick={async () => {
                              if (!route || !route.lastRequestId) return alert('No active request');
                              try {
                                setIsSubmitting(true);
                                const resp = await fetch(`/routes/${route.number}/attendance-request/${route.lastRequestId}/finalize`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ submittedBy: user?.name || user?.email || 'coordinator' }),
                                });
                                if (!resp.ok) {
                                  const txt = await resp.text();
                                  setStatus(txt || `Finalize failed (${resp.status})`);
                                  return;
                                }
                                const j = await resp.json();
                                if (j && j.success) {
                                  setStatus('Attendance finalized and sent');
                                  // refresh route data
                                  const r2 = await (await fetch(`/routes/${route.number}`)).json();
                                  if (r2 && r2.success) setRoute(r2.route);
                                } else {
                                  setStatus(j?.message || 'Failed to finalize');
                                }
                              } catch (e: any) {
                                setStatus(e?.message || 'Network error');
                              } finally {
                                setIsSubmitting(false);
                              }
                            }} className="btn-vibrant">{isSubmitting ? 'Finalizing...' : 'Finalize and send attendance'}</Button>
                          </>
                        ) : (
                          <div className="text-sm text-slate-500">No active attendance request. Click "Show QR" to start collecting responses, then finalize when ready.</div>
                        )}
                      </div>
                      {status && <div className="text-sm mt-2 text-slate-600">{status}</div>}
                  </div>

                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700">Attendance history</h3>
                    <ul className="mt-3 space-y-2 max-h-40 overflow-auto text-sm text-slate-600">
                      {(route?.attendance || []).slice().reverse().map((a: any, idx: number) => (
                        <li key={idx} className="flex justify-between">
                          <span>{a.date} — {a.count} students</span>
                          <span className="text-xs text-slate-400">by {a.submittedBy}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              </>
            )}
          </CardContent>
          {showQr && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full text-center">
                <h4 className="font-semibold mb-2">Scan to mark attendance</h4>
                {qrImageUrl || qrFallbackDataUrl ? (
                  <img
                    src={qrFallbackDataUrl || qrImageUrl || undefined}
                    alt="QR code"
                    className="mx-auto mb-3"
                    onError={async () => {
                      try {
                        if (!scanUrl) return;
                        if (qrFallbackDataUrl) return;
                        // dynamic import of QR lib from CDN
                        // @ts-ignore
                        const mod = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js');
                        const QRCode = mod && (mod.default || mod.QRCode || mod);
                        if (QRCode && QRCode.toDataURL) {
                          const dataUrl = await QRCode.toDataURL(scanUrl, { width: 300, margin: 1 });
                          setQrFallbackDataUrl(dataUrl);
                        }
                      } catch (err) {
                        // eslint-disable-next-line no-console
                        console.error('QR fallback generation failed', err);
                      }
                    }}
                  />
                ) : (
                  <div className="h-64 flex items-center justify-center mb-3 text-slate-500">QR unavailable</div>
                )}
                {scanUrl && (
                  <div className="text-xs break-words text-slate-600 mb-3">
                    <a href={scanUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline break-words">Open scan link / test on student device</a>
                  </div>
                )}
                {lastPin && (
                  <div className="mb-3">
                    <div className="text-sm uppercase opacity-80">Bus PIN</div>
                    <div className="text-3xl font-bold tracking-widest my-2">{lastPin}</div>
                    {lastPinExpiry && <div className="text-xs text-slate-500 mb-2">Valid until: {new Date(lastPinExpiry).toLocaleString()}</div>}
                    <div className="flex gap-2 justify-center mb-2">
                      <button className="px-3 py-2 rounded bg-indigo-600 text-white text-sm" onClick={async () => { try { await navigator.clipboard.writeText(lastPin || ''); alert('PIN copied'); } catch (e) { alert('Copy failed'); } }}>Copy PIN</button>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 justify-center">
                  <a href={qrImageUrl || qrFallbackDataUrl || '#'} download={`qr-route-${route?.number || '0'}.png`} className="px-3 py-2 rounded bg-indigo-600 text-white text-sm">Download</a>
                  <button className="px-3 py-2 rounded bg-slate-100 text-sm" onClick={async () => { try { await navigator.clipboard.writeText(scanUrl || ''); alert('Link copied'); } catch (e) { alert('Copy failed'); } }}>Copy link</button>
                  <button className="px-3 py-2 rounded bg-rose-100 text-sm" onClick={() => { setShowQr(false); setQrImageUrl(null); setScanUrl(null); setLastPin(null); setLastPinExpiry(null); setQrFallbackDataUrl(null); }}>Close</button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
