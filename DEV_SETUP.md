# DelhiveryWay — Local Development Setup

This guide walks you through running the entire DelhiveryWay stack on your own
machine. The project is split across **five separate Git repositories**, each
checked out side-by-side under one parent folder (e.g. `D:\Delhiveryway`):

| Repo                | Role                        | Tooling             |
| ------------------- | --------------------------- | ------------------- |
| `backend`           | Node/Express + MongoDB API  | Node                |
| `client-customer`   | Customer web app            | CRA (react-scripts) |
| `client-admin`      | Admin web app               | CRA (react-scripts) |
| `client-shopper`    | Personal Shopper web app    | CRA (react-scripts) |
| `client-shop-owner` | Shop-owner / vendor web app | Vite                |

---

## Quick start — backend in one command (Docker) ⭐

The fastest way to get the **backend + database + mail catcher** running. From
the `backend` repo, with **Docker Desktop** and Git installed:

```bash
docker compose up
```

That single command builds the backend and starts everything, pre-wired:

| Service     | URL / port            | What it is                                 |
| ----------- | --------------------- | ------------------------------------------ |
| Backend API | http://localhost:5000 | Node/Express + Socket.IO (hot-reload)      |
| MongoDB     | localhost:27017       | Local dev database                         |
| Mongo UI    | http://localhost:8081 | Browse the DB in a browser (admin / admin) |
| Mailhog     | http://localhost:8025 | Catches every dev email                    |

The backend hot-reloads on file changes. Optionally seed sample data:

```bash
docker compose exec backend npm run seed:dev
```

Stop everything with `docker compose down`. No local Node / Mongo / Mailhog
install is required for the backend — only Docker Desktop and Git.

### No Docker? Point at a free MongoDB Atlas cluster

If you can't run Docker, use a free cloud dev database instead:

1. Create a free **Atlas M0** cluster at <https://www.mongodb.com/cloud/atlas/register>,
   add a database user, and allow your IP.
2. Install Node.js 18+ and, from the `backend` repo, run with your Atlas URI —
   this reuses all the dummy dev secrets from `.env.development` and only swaps
   the database:

   ```bash
   npm install
   # macOS / Linux:
   MONGO_URI="mongodb+srv://<user>:<pass>@<cluster>/delhiveryway_dev" npm run dev
   # Windows PowerShell:
   $env:MONGO_URI="mongodb+srv://<user>:<pass>@<cluster>/delhiveryway_dev"; npm run dev
   ```

   (`dotenv` does not override an already-set variable, so the `MONGO_URI` you
   export wins over the localhost default.)

---

## 1. Prerequisites

- **Node.js** 18 LTS or newer (includes `npm`).
- **npm** (bundled with Node).
- **MongoDB** — a local instance or any reachable connection string.
  - The default dev config points at `mongodb://localhost:27017/delhiveryway_dev`
    (see `backend/.env.development`). A local Docker container or a native
    MongoDB install both work.
- (Optional) **Mailhog** for catching outgoing email locally. The dev config
  sends SMTP to `localhost:1025` with a web UI at `http://localhost:8025`.
  In development, signup auto-verifies accounts and does **not** send a
  verification email, so Mailhog is only needed for password-reset emails.

---

## 2. Install dependencies (per repo)

Run `npm install` once inside **each** of the five repos:

```bash
cd backend            && npm install
cd ../client-customer && npm install
cd ../client-admin    && npm install
cd ../client-shopper  && npm install
cd ../client-shop-owner && npm install
```

> Each frontend has Husky pre-commit hooks; `npm install` wires them up via the
> `prepare` script.

---

## 3. Seed local dev data

The backend ships a seed script. **Always use the `:dev` variant locally** so it
targets the development database:

```bash
cd backend
npm run seed:dev
```

`seed:dev` runs with `NODE_ENV=development`, which loads `.env.development` and
therefore writes to the **local** dev database (`delhiveryway_dev`).

> [!WARNING]
> **Do NOT run plain `npm run seed`.** Without `NODE_ENV=development` it loads
> `.env` (production / Render variables) and seeds the **PRODUCTION** database.
> Only `npm run seed:dev` is safe for local work.

**What `seed:dev` currently does:** it clears and re-creates the sample shops and
products and a sample vendor record. As of this writing it does **not** create
the named `*@dev.com` login accounts listed below — see the note under the
credentials table.

### Dev login credentials — **LOCAL DEV ONLY**

These are throwaway accounts intended purely for local development. **Never**
reuse these emails/passwords anywhere real. All four share the password
`Test@1234`:

| Email              | Portal                                    | Role / Notes                      |
| ------------------ | ----------------------------------------- | --------------------------------- |
| `customer@dev.com` | Customer (`client-customer`)              | role: `customer`                  |
| `vendor@dev.com`   | Shop-owner / vendor (`client-shop-owner`) | role: `vendor`                    |
| `admin@dev.com`    | Admin (`client-admin`)                    | role: `admin`                     |
| `shopper@dev.com`  | Personal Shopper (`client-shopper`)       | PersonalShopper account, verified |

> **Note on these accounts:** the current `seed:dev` script does not yet create
> the four `*@dev.com` accounts above. Until the seeder is updated, create them
> as needed. In **development** the backend auto-verifies new signups
> (`isVerified` is set to `true` and no email is sent), so a customer account can
> be made directly through the customer app's signup page. The admin, vendor, and
> verified Personal Shopper accounts may require seeding or manual DB/admin-panel
> setup because of role/verification gating.

---

## 4. Start each service

Open a separate terminal per service. **Start the backend first**, then the
frontends.

| Service             | Command (in repo dir) | URL                     | Port |
| ------------------- | --------------------- | ----------------------- | ---- |
| `backend` (API)     | `npm run dev`         | `http://localhost:5000` | 5000 |
| `client-customer`   | `npm start`           | `http://localhost:3000` | 3000 |
| `client-admin`      | `npm start`           | `http://localhost:3001` | 3001 |
| `client-shopper`    | `npm start`           | `http://localhost:3002` | 3002 |
| `client-shop-owner` | `npm run dev`         | `http://localhost:3003` | 3003 |

Notes on the ports above (these are the **actual** configured values, not
guesses):

- **Backend `5000`** — from `PORT=5000` in `backend/.env.development`.
- **Customer `3000`** — `PORT=3000` in `client-customer/.env.development`.
- **Admin `3001`** — `PORT=3001` in `client-admin/.env.development`.
- **Shopper `3002`** — `PORT=3002` in `client-shopper/.env.development`.
- **Shop-owner `3003`** — set in `client-shop-owner/vite.config.js`
  (`server.port: 3003`). This overrides Vite's default of 5173.

`npm run dev` on the backend uses `cross-env NODE_ENV=development nodemon`, so it
runs against the local dev DB and auto-reloads on changes.

---

## 5. How the frontends reach the backend

Every frontend is configured to talk to the local API at
**`http://localhost:5000/api`**:

- **CRA apps** (`client-customer`, `client-admin`, `client-shopper`) read
  `REACT_APP_API_URL=http://localhost:5000/api` from their `.env.development`
  (plus `REACT_APP_BACKEND_URL` / `REACT_APP_SOCKET_URL` =
  `http://localhost:5000` for Socket.io). In code the base URL falls back to
  `http://localhost:5000/api` if the env var is missing.
- **Vite app** (`client-shop-owner`) reads `VITE_API_URL=http://localhost:5000/api`
  and `VITE_SOCKET_URL=http://localhost:5000` from its `.env.development`.

The backend's CORS allow-list (`backend/server.js`) already includes
`http://localhost:3000`–`3003`, so all four frontends can call the API in
development without extra configuration.

---

## 6. Quick start (TL;DR)

```bash
# one-time
cd backend && npm install && npm run seed:dev

# install frontends (one-time)
cd ../client-customer   && npm install
cd ../client-admin      && npm install
cd ../client-shopper    && npm install
cd ../client-shop-owner && npm install

# then, each in its own terminal:
cd backend            && npm run dev    # http://localhost:5000
cd client-customer    && npm start      # http://localhost:3000
cd client-admin       && npm start      # http://localhost:3001
cd client-shopper     && npm start      # http://localhost:3002
cd client-shop-owner  && npm run dev    # http://localhost:3003
```
