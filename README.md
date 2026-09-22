# Ginni Steel — Order Desk (real, deployable version)

This is the working application version of the order-desk prototype: a real
Node.js server, a real SQLite database, and real login accounts — for your
649 customers and your order-desk staff. It's built to be handed to a
developer to put on real hosting, or run yourself if you're comfortable
with a terminal.

## What's real here (vs. the earlier browser-only prototype)

- **Real accounts.** Every customer from `Ginni_Debtor_Contact_List_.xlsx`
  is a real login (by phone number), with a temporary password they must
  change the first time they log in. No customer can see any other
  customer's name, phone number, or orders.
- **A real shared database.** Orders placed by any customer, on any device,
  show up immediately for your staff — this was the piece the earlier
  browser-only prototype could not do.
- **A real staff login**, separate from customers, that can see every
  order and the full contact directory.

## Running it locally (to try it out)

You need [Node.js](https://nodejs.org) version 18 or later installed.

```bash
cd ginni-steel-app
npm install
cp .env.example .env
npm start
```

Then open **http://localhost:3000** in a browser.

The first time it starts, it automatically creates the database and loads:
- Your 13 product entries (from the catalogue), with sizes and bundle counts
- Your 649 customers, each with a temporary password: **ginni123**
- One staff login: **orders@ginnisteel.com** / **admin123**

Log in as a customer using any phone number from your contact list (e.g.
try `9305475724`) and the password `ginni123` — you'll be asked to set a
real password on first login. Log in as staff with the email/password
above to see the order desk and directory.

**Change the default passwords** (`DEFAULT_CUSTOMER_PASSWORD`,
`DEFAULT_STAFF_EMAIL`, `DEFAULT_STAFF_PASSWORD` in `.env`) before you
actually hand this to real customers — otherwise everyone starts with the
same guessable password until they change it.

## Deploying it for real

This is a standard Node.js + SQLite app, so it runs on almost any hosting
service that supports Node. Two straightforward options:

**Render.com** (free tier available, simplest for a small business):
1. Push this folder to a GitHub repository.
2. Create a new "Web Service" on Render, connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add the environment variables from `.env.example` in Render's dashboard
   (especially `SESSION_SECRET` — generate a real random one).
5. Add a persistent disk (Render calls this "Disks") mounted at the path
   your `DB_PATH` points to, so the database survives restarts.

**Railway.app** works almost identically, with its own persistent volumes.

Either way, once deployed you'll get a real web address (e.g.
`https://ginnisteel-orders.onrender.com`) that you can share with all 500+
customers — no Claude account, no sign-in wall, works on any phone.

## Things a developer should tighten before a full public launch

- **Passwords by SMS, not a shared default.** Right now every customer
  starts with the same temporary password. For real rollout, send each
  customer their own one-time password by SMS (using a gateway like
  Twilio or an Indian SMS provider) instead of telling them "ginni123."
- **HTTPS.** Render/Railway provide this automatically; just make sure
  `NODE_ENV=production` is set so login cookies require it.
- **Backups.** Set up a periodic backup of the `ginni.db` file (or migrate
  to a managed Postgres database, which most hosts back up automatically).
- **Multiple staff logins.** Right now there's one shared staff account.
  Adding more `staff` rows (see `db/init.js`) is straightforward if you
  want individual logins per staff member.
- **Editing the catalogue.** Right now, products/sizes are only edited by
  changing `data/catalog.json` and re-seeding. A simple admin screen to
  edit products without touching code would be a good next addition.

## Project layout

```
server.js            – starts the app
db/init.js            – database schema + one-time seeding
routes/auth.js        – login, logout, forced password change
routes/products.js    – catalog API
routes/orders.js      – place orders, view orders, update status
routes/customers.js   – staff-only directory search
middleware/auth.js    – login checks for each route
public/               – the actual webpage (HTML/CSS/JS)
data/catalog.json     – product & size seed data
data/contacts.json    – your 649 customers' seed data
```
