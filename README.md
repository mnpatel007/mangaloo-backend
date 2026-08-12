# Mangaloo — Local Development Setup

Complete, start-to-finish setup for a brand new machine. Follow this in
order — each step assumes the previous one is done.

The project is split across **five separate Git repositories**, meant to be
cloned side-by-side under one parent folder:

| Repo (actual folder/GitHub name) | Role                        | Tooling             |
| -------------------------------- | --------------------------- | ------------------- |
| `mangaloo-backend`               | Node/Express + MongoDB API  | Node                |
| `mangaloo-customer`              | Customer web app            | CRA (react-scripts) |
| `mangaloo-admin`                 | Admin web app               | CRA (react-scripts) |
| `mangaloo-shopper`               | Personal Shopper web app    | CRA (react-scripts) |
| `mangaloo-shop-owner`            | Shop-owner / vendor web app | Vite                |

Everything below is written for **Windows + WSL2**, which is the supported
setup. (macOS/Linux users can skip straight to step 3 — you already have a
real Unix shell.)

---

## Step 0 — Install WSL with Ubuntu

Open **PowerShell as Administrator** and run:

```powershell
wsl --install -d Ubuntu
```

Restart your computer if prompted. On first launch, Ubuntu will ask you to
create a Linux username and password — these are local to WSL, unrelated to
your Windows login. Once you land on a `yourname@machine:~$` prompt, this
step is done.

From now on, **all commands in this guide run inside that Ubuntu shell**
(open it any time via `wsl` from PowerShell, or the "Ubuntu" app from the
Start menu) — not in PowerShell/cmd.

---

## Step 1 — Install Git and Docker Engine inside Ubuntu

Git usually comes preinstalled with Ubuntu on WSL. Confirm, and set your
identity (needed once per machine, or commits will fail):

```bash
git --version
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

Install Docker Engine directly inside WSL — **not Docker Desktop**. This is
lighter, more reliable on WSL, and is what the backend's `docker-compose.yml`
expects. These steps install Docker from its official apt repository, the
standard supported way to get it on Ubuntu:

**1. Add Docker's signing key**, so `apt` can verify the packages you're about
to install actually come from Docker:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc > /dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

**2. Add Docker's apt repository**, matched to your Ubuntu version:

```bash
CODENAME=$(grep -oP '(?<=^VERSION_CODENAME=).+' /etc/os-release)
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $CODENAME stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
```

**3. Install Docker itself** (the engine, CLI, and the `docker compose` plugin
this project's `docker-compose.yml` needs):

```bash
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

**4. Let your user run `docker` without typing `sudo` every time:**

```bash
sudo usermod -aG docker $USER
```

**Close and reopen your WSL shell** — group membership changes only apply to
new sessions, so this won't take effect in the terminal you're already in.
Then confirm it worked:

```bash
docker run --rm hello-world
```

If that prints "Hello from Docker!", Docker is installed and working.

---

## Step 2 — Pick where the repos live, and how you'll edit them

Clone into WSL's own Linux filesystem (e.g. `~/projects`) — **not** a Windows
drive path like `/mnt/c/...` or `/mnt/d/...`. This avoids an entire category
of line-ending and file-permission problems that come from crossing the
Windows/Linux filesystem boundary.

To edit these files, install the **"WSL"** extension in VS Code, then from
inside your WSL shell:

```bash
mkdir -p ~/projects
cd ~/projects
code .
```

This opens VS Code connected directly to the Linux filesystem (a "WSL:
Ubuntu" window) — editing, terminal, and git all stay on the Linux side, so
none of the CRLF/permission issues in `TROUBLESHOOTING.md` apply.

---

## Step 3 — Clone the five repos

From `~/projects` (or wherever you chose in Step 2):

```bash
git clone https://github.com/mnpatel007/mangaloo-backend.git
git clone https://github.com/mnpatel007/mangaloo-customer.git
git clone https://github.com/mnpatel007/mangaloo-admin.git
git clone https://github.com/mnpatel007/mangaloo-shopper.git
git clone https://github.com/mnpatel007/mangaloo-shop-owner.git
```

(Adjust repo URLs/names if they differ from the above — confirm with
`ls ~/projects` afterward.)

Each repo ships its own `.env.development` with dummy, non-secret dev config
already committed — **you don't need to create or edit any `.env` file** to
get local dev running.

---

## Step 4 — Install dependencies

Run `npm install` once inside **each** of the five repos:

```bash
cd ~/projects/mangaloo-backend    && npm install
cd ~/projects/mangaloo-customer   && npm install
cd ~/projects/mangaloo-admin      && npm install
cd ~/projects/mangaloo-shopper    && npm install
cd ~/projects/mangaloo-shop-owner && npm install
```

> Each frontend has Husky pre-commit hooks; `npm install` wires them up via
> the `prepare` script.

---

## Step 5 — Start the backend

The backend repo ships a `docker-compose.yml` with four services: `backend`,
`mongo`, `mongo-express`, and `mailhog`. **For local dev, only start the
infrastructure services in Docker — run the backend itself natively with
`npm run dev`.** Native Node gives you proper hot-reload and lets you attach
a debugger directly; running the backend _inside_ Docker too is redundant and
will conflict on port 5000 if you also try `npm run dev`.

**5a. Start just Mongo, mongo-express, and Mailhog:**

```bash
cd ~/projects/mangaloo-backend
docker compose up -d mongo mongo-express mailhog
```

Verify they're up:

```bash
docker ps
```

You should see `mangaloo_mongo`, `mangaloo_mongo_express`, and
`mangaloo_mailhog` running. (Leave out `backend` from that `up` command —
that's the container that runs the whole app in Docker, which we're not
using here.)

**5b. Seed the local dev database:**

```bash
npm run seed:dev
```

This creates sample shops/products and four ready-to-use dev login accounts
(all password `Test@1234`):

| Email              | Portal                                    | Role                             |
| ------------------ | ----------------------------------------- | -------------------------------- |
| `customer@dev.com` | Customer (`client-customer`)              | `customer`                       |
| `vendor@dev.com`   | Shop-owner / vendor (`client-shop-owner`) | `vendor` (owns the seeded shops) |
| `admin@dev.com`    | Admin (`client-admin`)                    | `admin`                          |
| `shopper@dev.com`  | Personal Shopper (`client-shopper`)       | pre-verified                     |

> **Never** run plain `npm run seed` for local work — without
> `NODE_ENV=development` it loads production config and seeds the
> **live** database instead. Only `seed:dev` is safe locally. Re-running
> `seed:dev` any time is safe — it resets shops/products and these four
> accounts' passwords, and doesn't touch anything else (orders, etc).

**5c. Start the backend itself:**

```bash
npm run dev
```

This runs `nodemon` against `.env.development`, connecting to the Mongo
container on `localhost:27017` and listening on `http://localhost:5000`,
with hot-reload on file changes. Leave this terminal running.

---

## Step 6 — Start the four frontends

Each one in its own terminal (open a new WSL shell tab/window per service):

```bash
cd ~/projects/mangaloo-customer   && npm start      # http://localhost:3000
cd ~/projects/mangaloo-admin      && npm start      # http://localhost:3001
cd ~/projects/mangaloo-shopper    && npm start      # http://localhost:3002
cd ~/projects/mangaloo-shop-owner && npm run dev    # http://localhost:3003
```

Every frontend is already configured (via its own `.env.development`) to
talk to the backend at `http://localhost:5000/api`, and the backend's CORS
allow-list already includes `localhost:3000`–`3003` — no extra config needed.

---

## Full service/port reference

| Service                     | Command                                                           | URL                                     |
| --------------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| MongoDB                     | `docker compose up -d mongo mongo-express mailhog` (in `backend`) | `localhost:27017`                       |
| Mongo UI                    | (same as above)                                                   | `http://localhost:8081` (admin / admin) |
| Mailhog (catches dev email) | (same as above)                                                   | `http://localhost:8025`                 |
| Backend API                 | `npm run dev` (in `backend`)                                      | `http://localhost:5000`                 |
| `client-customer`           | `npm start`                                                       | `http://localhost:3000`                 |
| `client-admin`              | `npm start`                                                       | `http://localhost:3001`                 |
| `client-shopper`            | `npm start`                                                       | `http://localhost:3002`                 |
| `client-shop-owner`         | `npm run dev`                                                     | `http://localhost:3003`                 |

---

## Quick reference — everything after Step 1 is already done

Once Steps 0–4 are done one time on a machine, here's the whole daily
start-up sequence:

```bash
# terminal 1 — infra + backend
cd ~/projects/mangaloo-backend
docker compose up -d mongo mongo-express mailhog
npm run dev

# terminal 2
cd ~/projects/mangaloo-customer && npm start

# terminal 3
cd ~/projects/mangaloo-admin && npm start

# terminal 4
cd ~/projects/mangaloo-shopper && npm start

# terminal 5
cd ~/projects/mangaloo-shop-owner && npm run dev
```

To stop the Docker infra services when you're done: `docker compose down`
(from `backend`).
