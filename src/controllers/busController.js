import { buses } from '../data/dummyData.js';

export function listBuses(req, res) {
  res.json({ success: true, buses });
}

export function getBus(req, res) {
  const id = req.params.id;
  const bus = buses.find(b => b.id === id || b.number === id);
  if (!bus) return res.status(404).json({ success: false, message: 'Bus not found' });
  res.json({ success: true, bus });
}
