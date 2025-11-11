// Global error handler to log uncaught exceptions and prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});
import express from 'express';
import authRoutes from './routes/authRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import { students, staff, routes } from './data/dummyData.js';
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';

const app = express();

app.use(express.json());
app.use('/auth', authRoutes);
app.use('/routes', routeRoutes);

app.get('/', (req, res) => res.send('Bus Buddy Allocator - API'));

// Dev debug: list all registered routes including nested router routes
app.get('/debug/routes-full', (req, res) => {
  try {
    const routes = [];
    const stack = app._router && app._router.stack ? app._router.stack : [];
    function parseLayer(layer, prefix = '') {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods || {}).map(m => m.toUpperCase()).join(',');
        routes.push({ path: prefix + layer.route.path, methods });
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        const mountPath = layer.regexp && layer.regexp.fast_star ? '' : (layer.regexp && layer.regexp.source ? '' : '');
        // iterate nested stack
        layer.handle.stack.forEach((l) => parseLayer(l, prefix + (layer.regexp && layer.regexp.source ? '' : '')));
      }
    }
    stack.forEach((layer) => parseLayer(layer, ''));
    // Fallback: include the simple listing the server already prints
    return res.json({ success: true, routes });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to enumerate routes', error: e && e.message });
  }
});

// DEBUG helper - return in-memory students and staff (dev only)
app.get('/debug/students', (req, res) => {
  res.json({ students, staff });
});

// Return staff and route assignments (coordinators + faculty per route)
app.get('/api/staff', (req, res) => {
  // build a mapping of route -> staff assigned
  const routeMap = {};
  routes.forEach((r) => {
    routeMap[r.number] = {
      route: r.number,
      name: r.name,
      driver: r.driver || null,
      faculty: staff.filter(s => s && s.route === r.number),
    };
  });
  res.json({ routes: Object.values(routeMap), staff });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Debug: list registered routes
  try {
    const routesList = app._router && app._router.stack ? app._router.stack
      .filter((r) => r.route)
      .map((r) => Object.keys(r.route.methods).map(m => `${m.toUpperCase()} ${r.route.path}`).join(', ')) : [];
    console.log('Registered routes:', routesList);
  } catch (e) {
    console.error('Failed to list routes:', e && e.message ? e.message : e);
  }
  // Schedule daily attendance request at 08:00 local time
  try {
    // run at 08:00 every day
    cron.schedule('0 8 * * *', () => {
      // eslint-disable-next-line no-console
      console.log('Running scheduled attendance request job (08:00)');
      routes.forEach((r) => {
        const num = r.number;
        const assigned = students.filter(s => s.route === num);
        const now = new Date();
        const dateKey = now.toISOString().slice(0,10);
        r.attendanceRequests = r.attendanceRequests || [];

        const requestBatch = {
          id: uuidv4(),
          date: dateKey,
          createdAt: now.toISOString(),
          sent: true,
          responses: {},
        };
        assigned.forEach((s) => { requestBatch.responses[s.id] = { status: 'pending', respondedAt: null }; });
        r.attendanceRequests.push(requestBatch);
        // eslint-disable-next-line no-console
        console.log(`Created attendance request ${requestBatch.id} for route ${num}`);
      });
    }, { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  } catch (e) {
    console.error('Failed to schedule attendance job', e);
  }
});
