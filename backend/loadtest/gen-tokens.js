// Pre-generate JWTs with the SAME secret as the load-test backend (localtest),
// so k6 never hits bcrypt on the hot path. Writes loadtest/tokens.json.
const jwt = require('../node_modules/jsonwebtoken');
const fs = require('fs');
const path = require('path');

const SECRET = 'localtest';
const sign = (id, role) => jwt.sign({ id, role }, SECRET, { expiresIn: '30d' });

// ID plan from seed.sql: owners 1..1000, drivers 1001..1300, customers 1301..201300
const NUM_CUST = 3000;      // sample of customers used by VUs
const NUM_DRIVER = 300;     // all drivers
const NUM_OWNER = 1000;     // all owners
const ADMIN_ID = 201301;

const customers = [];
for (let i = 0; i < NUM_CUST; i++) {
  const id = 1301 + Math.floor(Math.random() * 200000);
  customers.push({ id, token: sign(id, 'customer') });
}
const drivers = [];
for (let g = 1; g <= NUM_DRIVER; g++) {
  const id = 1000 + g;
  drivers.push({ id, token: sign(id, 'driver') });
}
const owners = [];
for (let g = 1; g <= NUM_OWNER; g++) {
  owners.push({ id: g, restaurant_id: g, token: sign(g, 'restaurant_owner') });
}
const admin = { id: ADMIN_ID, token: sign(ADMIN_ID, 'admin') };

const out = { secret_hint: 'localtest', customers, drivers, owners, admin };
fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(out));
console.log(`tokens.json written: ${customers.length} customers, ${drivers.length} drivers, ${owners.length} owners, 1 admin`);
