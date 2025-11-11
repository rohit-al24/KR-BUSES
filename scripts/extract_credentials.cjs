const fs = require('fs');
const path = require('path');

const csvPath = path.join(process.cwd(), 'src', 'data', 'Updated Bus comer list 2024-25.csv');
if (!fs.existsSync(csvPath)) {
  console.error('CSV not found at', csvPath);
  process.exit(1);
}
let text = fs.readFileSync(csvPath, 'utf8');
// Normalize common quoted newline issue in header: replace BUS\nNO. with BUS NO.
text = text.replace(/BUS\r?\nNO\./gi, 'BUS NO.');

const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
// find header line containing NAME (or NAME OF THE STUDENT)
const headerIndex = lines.findIndex(l => /NAME/i.test(l) && /BUS/i.test(l));
if (headerIndex === -1) {
  console.error('Could not find header line in CSV. Showing first 10 lines for debugging:');
  console.log(lines.slice(0, 10).join('\n'));
  process.exit(1);
}
const header = lines[headerIndex];
const headers = header.split(',').map(h => h.replace(/^"|"$/g, '').trim());
const idxName = headers.findIndex(h => /NAME/i.test(h));
const idxBus = headers.findIndex(h => /BUS/i.test(h));
const idxRoll = headers.findIndex(h => /ROLL/i.test(h));

if (idxName === -1) {
  console.error('Name column not found in headers:', headers);
  process.exit(1);
}

const creds = [];
for (let i = headerIndex + 1; i < lines.length; i++) {
  const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
  const name = cols[idxName] || '';
  if (!name) continue;
  const busRaw = idxBus >= 0 ? (cols[idxBus] || '') : '';
  const busNumber = busRaw ? busRaw.replace(/[^0-9]/g, '') : '';
  // generate safe email
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/(^\.|\.$)/g, '');
  const email = safe ? `${safe}@example.com` : `student${i}@example.com`;
  // deterministic DOB based on row number
  const year = 2003;
  const mm = String(((i % 12) + 1)).padStart(2, '0');
  const dd = String(((i % 27) + 1)).padStart(2, '0');
  const dob = `${year}-${mm}-${dd}`;
  creds.push({ name, email, dob, bus: busNumber || null });
}

// print first 20 credentials
const sample = creds.slice(0, 20);
console.log(JSON.stringify(sample, null, 2));
