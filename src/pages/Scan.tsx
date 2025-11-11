import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Scan = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('Checking...');
  const [serverResp, setServerResp] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      const parseErrorMessage = (text: string, status?: number) => {
        try {
          const j = JSON.parse(text);
          if (j && j.message) return `${j.message}${status ? ` (${status})` : ''}`;
        } catch (e) {}
        if (text) return `${text}${status ? ` (${status})` : ''}`;
        return status ? `Server responded with status ${status}` : 'Server error';
      };

      try {
        const params = new URLSearchParams(window.location.search);
        const route = params.get('route');
        let requestId = params.get('requestId');
        if (!route) {
          setStatus('Invalid scan URL (missing route)');
          return;
        }

        // read logged-in user. If not logged in as a student, prompt for a student id (testing helper)
        let user: any = null;
        const userJson = localStorage.getItem('user');
        if (userJson) {
          try { user = JSON.parse(userJson); } catch (e) { user = null; }
        }

        let simulatedStudent = false;
        if (!user || user.role !== 'student' || !user.id) {
          // helpful testing path: allow entering a student id or student name to simulate a student scan on this device
          const entered = window.prompt('Not logged in as a student. Enter a student ID or student name to simulate the scan (Cancel to open login):');
          if (!entered) {
            setStatus('Please login in the app first to mark attendance.');
            // redirect to login with redirect back to this scan URL
            setTimeout(() => navigate(`/?redirect=${encodeURIComponent(window.location.href)}`), 2500);
            return;
          }
          // If the user entered a name (not a UUID-like string), try to resolve it to an id by fetching route students
          let resolvedId: string | null = null;
          // quick heuristic: UUIDs have dashes; if entered contains spaces or letters and no dashes, treat as name
          if (entered.indexOf('-') === -1) {
            try {
              const rr = await fetch(`/routes/${route}`);
              if (rr.ok) {
                const jr = await rr.json();
                const candidates = jr?.route?.students || [];
                const found = candidates.find((s: any) => (s.name || '').toLowerCase().includes(entered.toLowerCase()));
                if (found) resolvedId = found.id;
              }
            } catch (e) {
              // ignore
            }
          }
          // fall back to using the raw entered value as id
          const finalId = resolvedId || entered;
          // create a minimal pseudo-user for the rest of the flow
          user = { id: finalId, role: 'student' };
          simulatedStudent = true;
        }

        setStatus('Looking up attendance request...');
        // if no requestId provided in QR, fetch latest active request for this route
        if (!requestId) {
          const getReq = await fetch(`/routes/${route}/attendance-request/latest`);
          if (!getReq.ok) {
            const txt = await getReq.text();
            const msg = parseErrorMessage(txt, getReq.status);
            setStatus(`Failed to fetch request: ${msg}`);
            setServerResp({ ok: false, status: getReq.status, message: msg });
            return;
          }
          const jr = await getReq.json();
          requestId = jr?.request?.id || null;
        }

        // If still no requestId, create one (fallback) so the QR works without scheduler
        if (!requestId) {
          setStatus('No active attendance request — creating one...');
          const createResp = await fetch(`/routes/${route}/attendance-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
          if (!createResp.ok) {
            const txt = await createResp.text();
            const msg = parseErrorMessage(txt, createResp.status);
            setStatus(`Failed to create request: ${msg}`);
            setServerResp({ ok: false, status: createResp.status, message: msg });
            return;
          }
          const jc = await createResp.json();
          requestId = jc?.request?.id || null;
        }

        if (!requestId) {
          setStatus('Unable to obtain an attendance request id');
          return;
        }

        // Check whether this request requires a PIN by fetching the latest request metadata
        setStatus('Checking request metadata...');
        const metaResp = await fetch(`/routes/${route}/attendance-request/latest`);
        if (!metaResp.ok) {
          const txt = await metaResp.text();
          const msg = parseErrorMessage(txt, metaResp.status);
          setStatus(`Failed to fetch request metadata: ${msg}`);
          setServerResp({ ok: false, status: metaResp.status, message: msg });
          return;
        }
        const meta = await metaResp.json();
        const reqMeta = meta?.request;
        const needsPin = reqMeta?.pinRequired;

        if (needsPin) {
          // Prompt the student to enter the bus PIN
          setStatus('This bus requires a PIN. Please enter the bus PIN to mark attendance.');
          // show a simple prompt input UI by replacing the page content
          // We'll create an input element dynamically here for minimal change
          const pin = window.prompt('Enter bus PIN shown inside the bus');
          if (!pin) {
            setStatus('PIN entry cancelled. Attendance not submitted.');
            return;
          }

          setStatus('Submitting attendance with PIN...');
          const res = await fetch(`/routes/${route}/students/${user.id}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response: 'yes', requestId, pin }),
          });

          if (!res.ok) {
            const txt = await res.text();
            const msg = parseErrorMessage(txt, res.status);
            setStatus(`Failed: ${msg}`);
            setServerResp({ ok: false, status: res.status, message: msg });
            return;
          }

          const data = await res.json();
          setServerResp(data);
          if (data && data.success) {
            if (simulatedStudent) {
              // show confirmation for simulated scan without changing logged-in user view
              try {
                const r = await fetch(`/routes/${route}`);
                if (r.ok) {
                  const jr = await r.json();
                  const stud = jr?.route?.students?.find((s: any) => s.id === user.id);
                  setStatus((stud && `Attendance marked present for ${stud.name}.`) || 'Attendance marked present.');
                } else {
                  setStatus('Attendance marked present.');
                }
              } catch (e) {
                setStatus('Attendance marked present.');
              }
            } else {
              setStatus('Attendance marked present. Thank you!');
              setTimeout(() => navigate('/seats'), 1500);
            }
          } else {
            setStatus('Unexpected response from server');
          }
        } else {
          // No PIN required, submit automatically
          setStatus('Submitting attendance...');
          const res = await fetch(`/routes/${route}/students/${user.id}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response: 'yes', requestId }),
          });

          if (!res.ok) {
            const txt = await res.text();
            const msg = parseErrorMessage(txt, res.status);
            setStatus(`Failed: ${msg}`);
            setServerResp({ ok: false, status: res.status, message: msg });
            return;
          }

          const data = await res.json();
          setServerResp(data);
          if (data && data.success) {
            if (simulatedStudent) {
              try {
                const r = await fetch(`/routes/${route}`);
                if (r.ok) {
                  const jr = await r.json();
                  const stud = jr?.route?.students?.find((s: any) => s.id === user.id);
                  setStatus((stud && `Attendance marked present for ${stud.name}.`) || 'Attendance marked present.');
                } else {
                  setStatus('Attendance marked present.');
                }
              } catch (e) {
                setStatus('Attendance marked present.');
              }
            } else {
              setStatus('Attendance marked present. Thank you!');
              setTimeout(() => navigate('/seats'), 1500);
            }
            } else {
              setStatus('Unexpected response from server');
            }
        }
      } catch (e: any) {
        setStatus('Error: ' + (e?.message || String(e)));
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Bus Scan</h2>
        <p>{status}</p>
        {serverResp && (
          <div className="mt-3 text-xs text-left bg-slate-50 p-2 rounded max-h-32 overflow-auto">
            {serverResp.message ? (
              <div><strong>Error:</strong> {serverResp.message}</div>
            ) : (
              <pre>{JSON.stringify(serverResp, null, 2)}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Scan;
