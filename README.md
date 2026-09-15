# Animal Picture App

A small microservice application that **downloads random pictures of animals**
(cats, dogs and bears), **stores them in a database**, and **shows them in a
simple web page**.

It's written in **TypeScript**, built with **npm**, and runs in **Docker
containers**.

> **Status:** all planned steps are done: the API, the database, the web page
> and the automated tests.
>
> **Source code:** https://github.com/thomasvanhavere/animal-picture-app

---

## TL;DR: run it

First get the code (skip if you already have the folder):

```powershell
git clone https://github.com/thomasvanhavere/animal-picture-app.git
cd animal-picture-app
```

No settings file is needed: the defaults in `.env.defaults` are used.

### Option A: with Docker

**You need:** Docker Desktop (running) and Git.

1. Start the app (the first time takes a few minutes):
   ```powershell
   docker compose up -d --build
   ```
2. Check that all three containers say `healthy`:
   ```powershell
   docker compose ps
   ```
3. Open the web page at **http://localhost:8080**. The API is at
   http://localhost:3000/health, which should show `{"status":"ok","database":"up"}`.
4. Stop it with `docker compose down`. Your saved pictures are kept.

### Option B: with npm (reloads when you change code)

**You need:** Node.js 24 (`node -v` must start with `v24`), Git, and a
PostgreSQL database. The easiest way to get the database is Docker, used for the
database only.

1. Install the packages:
   ```powershell
   npm run install:all
   ```
2. Start only the database. If you used Option A before, first run
   `docker compose stop animal-picture-api animal-picture-ui`, because they use
   the same ports.
   ```powershell
   docker compose up -d animal-picture-database
   ```
3. Start the API in terminal 1, and wait for
   `animal-picture-api is listening on port 3000.`:
   ```powershell
   npm run dev:api
   ```
4. Start the web page in a **second** terminal:
   ```powershell
   npm run dev:ui
   ```
5. Open the web page at **http://localhost:5173** (a different port from
   Docker). The API is at http://localhost:3000/health.
6. Stop with **Ctrl+C** in both terminals, then
   `docker compose stop animal-picture-database`.

**No Docker at all?** Install [PostgreSQL](https://www.postgresql.org/download/),
create the database and user once, and skip step 2. The default settings
already point to `localhost:5432` with this name, user and password.

```powershell
psql -U postgres -c "CREATE USER animal_picture_user WITH PASSWORD 'animal_picture_password';"
psql -U postgres -c "CREATE DATABASE animal_picture_database OWNER animal_picture_user;"
```

### Run the tests

After `npm run install:all`, from the project folder:

| Command | What it tests | Needs |
|---|---|---|
| `npm test` | Unit tests of the API and the web page | Nothing else |
| `npm run test:integration` | The API against a real database | Docker Desktop running |

### Something not working?

| Problem | Fix |
|---|---|
| `port is already allocated` or `EADDRINUSE` | Something else uses port 3000, 8080 or 5432. Stop it, or change `API_PORT`, `UI_PORT` or `DATABASE_PORT` in a `.env` file. |
| `npm` refuses to install ("engine" error) | You're not on Node.js 24. Install it, or run `nvm use`. |
| The page says the API is not available | Check the API is running: `docker compose ps` (Option A) or terminal 1 (Option B). |
| `Configuration error: … is not set` | A setting in your `.env` is empty or misspelled. Fix it, or delete `.env` to use the defaults. |
| `docker` command not found or cannot connect | Start Docker Desktop and wait until it's running. |
| `password authentication failed` or `database "…" does not exist` | You changed `DATABASE_NAME`, `DATABASE_USER` or `DATABASE_PASSWORD` after the database was created. Put the old values back, or run `docker compose down -v` (deletes the saved pictures). |

The rest of this README explains everything in more detail.

---

## Table of contents

1. [What does it do?](#what-does-it-do)
2. [How it's put together](#how-its-put-together)
3. [Project layout](#project-layout)
4. [What you need](#what-you-need)
5. [Configuration](#configuration)
6. [Running](#running)
7. [The web page](#the-web-page)
8. [The API](#the-api)
9. [Building and testing](#building-and-testing)


---

## What does it do?

1. **Fetch new pictures.** The app asks a free public picture service for a
   random picture of a cat, dog or bear, downloads it, and saves it in the
   database. You can say which animal you want (or a random one) and how
   many pictures (one, if you don't say). A request saves all its pictures or
   none. The service to use and the picture size are set with environment
   variables.
2. **Keep them in a database.** Every picture is stored in a PostgreSQL
   database, in one table called `animal_pictures`. The picture file itself
   is saved there too, not just a link to it, so a saved picture stays
   available even if the picture service goes offline or changes its
   pictures. Next to the file, each row records:

   | Column | What it holds | Example |
   |---|---|---|
   | `id` | A number that identifies the picture, handed out in order | `27` |
   | `animal` | Which animal is in the picture | `cat` |
   | `provider` | Which picture service it came from | `cataas` |
   | `source_url` | The exact address it was downloaded from | `https://cataas.com/cat?width=506` |
   | `content_type` | The kind of file | `image/jpeg` |
   | `size_bytes` | The size of the file | `34236` |
   | `image_data` | The picture file itself | *(binary data)* |
   | `created_at` | When it was saved | `2026-09-15 09:27:34+00` |

   The database runs in its own container and keeps its data in a Docker
   volume, so the pictures survive restarts and rebuilds. The API creates the
   table by itself the first time it starts. See
   [Looking inside the database](#looking-inside-the-database) to query it.
3. **Hand them out through a REST API.** The API, at
   **http://localhost:3000** once the app is running, fetches new pictures,
   sends back the latest one, and sends any saved picture by its id. Every
   request is described in [The API](#the-api), and there is a ready-made
   [Postman collection](#try-it-out-with-postman) to try them.
4. **Show them in a web page.** At **http://localhost:8080** you see the latest
   saved picture, and you can fetch as many pictures as you like, of a cat, a
   dog, a bear or a random animal. Several pictures are shown in a carousel.
   See [The web page](#the-web-page).


---

## How it's put together

The application is split into **three separate services**. Each one runs in
its own container and has one clear job.

```
┌──────────────────────── docker compose (your machine) ─────────────────────┐
│                                                                            │
│  Browser                                                                   │
│    │  http://localhost:8080                                                │
│    ▼                                                                       │
│  ┌───────────────────────────┐   /api/*    ┌───────────────────────────┐   │
│  │  animal-picture-ui        │ ──────────► │  animal-picture-api       │   │
│  │  (web page, served        │  forwarded  │  (TypeScript +            │   │
│  │   by Nginx)               │             │   Express)                │   │
│  └───────────────────────────┘             └─────────────┬─────────────┘   │
│                                                          │ TypeORM         │
│                                            ┌─────────────▼─────────────┐   │
│                                            │  animal-picture-database  │   │
│                                            │  (PostgreSQL)             │   │
│                                            └───────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
```

Not drawn: the API downloads the pictures from free services on the internet
(Cataas, Place.dog and PlaceBear). And with `npm run dev:ui`, Vite's
development server passes `/api` on to the API instead of Nginx.

| Service | Job | Built with |
|---|---|---|
| **animal-picture-ui** | Shows the web page. Passes every `/api/...` request on to the API, so the browser only ever talks to one address. | TypeScript, Vite, Nginx |
| **animal-picture-api** | Fetches pictures from the internet, saves them, and hands them back out. Knows nothing about the web page. | TypeScript, Node.js, Express, TypeORM |
| **animal-picture-database** | Keeps the saved pictures, even after a restart. | PostgreSQL |

### Why these choices?

- **Separate UI and API.** Each part can be changed, restarted or replaced on
  its own. The API can also be used by other programs (for example a Camunda
  worker) in exactly the same way the web page uses it.
- **Express.** A small, widely known web framework. We give it a clear
  structure of our own: *routes → controllers → services → repositories*.
- **TypeORM.** Maps database tables to TypeScript classes.
- **A web page without a framework.** The page is small: one form, a
  carousel and a picture. Plain TypeScript keeps it light (about 7 KB) and
  easy to follow. Vite turns it into ordinary files, and Nginx serves them.
- **PostgreSQL in its own container.** Runs locally, needs no cloud account,
  and keeps its data in a Docker volume.
- **npm.** The standard build tool for TypeScript. Each service has its own
  `package.json`, so it can be installed, built and containerised on its own.

---

## Project layout

```
animal-picture-app/
├── .env.defaults        All settings with their default values and explanations
├── docker-compose.yml   Starts all services together
├── package.json         Project description, required Node.js version, shortcut commands
├── .npmrc               npm settings: enforce the Node.js version, save exact versions
├── .nvmrc               The Node.js version to use (for nvm / fnm users)
├── .gitignore           Files Git should not save (build output, secrets, ...)
├── .gitattributes       Keeps line endings correct on every operating system
├── .editorconfig        Shared formatting rules for code editors
├── README.md            This file
│
├── api/                 The REST API service
│   ├── package.json     Its own packages and commands
│   ├── Dockerfile       How to build its container image
│   ├── .dockerignore    Files Docker leaves out of the build (packages, tests, secrets, ...)
│   ├── tsconfig.json    TypeScript settings; tsconfig.build.json builds only src/ with them
│   ├── vitest.config.ts Unit test settings; integration tests use vitest.integration.config.ts
│   ├── postman/         A Postman collection with every request, for trying the API by hand
│   ├── src/
│   │   ├── main.ts               Starting point: reads settings, connects, starts listening
│   │   ├── app.ts                Wires the pieces into one Express app
│   │   ├── request-logger.ts     Writes one line to the log for every request
│   │   ├── application.ts        Builds the complete app from the settings and the database
│   │   ├── config/               Reads and checks the settings; the animal and service lists
│   │   ├── database/             The picture table (entity), the connection, the migrations
│   │   ├── pictures/             The picture feature, in layers (see below)
│   │   ├── health/               The GET /health endpoint
│   │   └── errors/               Error types and the central error handler
│   └── test/                     Unit tests, one file per piece
│       ├── setup.ts              Loads reflect-metadata, which TypeORM needs, before the tests
│       └── integration/          Tests against a real database and the whole running API
│           └── helpers/          The test database connection and a fake picture service
│
└── ui/                  The web page service
    ├── package.json     Its own packages and commands
    ├── Dockerfile       How to build its container image (the page, served by Nginx)
    ├── .dockerignore    Files Docker leaves out of the build (packages, tests, secrets, ...)
    ├── nginx/           Nginx settings: serve the page, pass /api on to the API
    ├── vite.config.ts   Build and test settings; passes /api on to the API in development
    ├── tsconfig.json    TypeScript settings for checking the types; Vite does the building
    ├── index.html       The page's structure
    ├── public/          Files served as they are (the page icon)
    ├── src/
    │   ├── main.ts               Starting point: starts the page with the real API
    │   ├── app.ts                The page's behaviour: latest picture, fetch button, results
    │   ├── api/                  Talks to the API
    │   ├── components/           The picture card, the carousel, the animal choice and the "#Pictures" box
    │   └── styles.css            How the page looks
    └── test/                     Automated tests, run in a simulated browser page
```

### How the API code is layered

A request travels down through these layers and the answer travels back up.
Each layer only knows the one below it, except the service, which uses both
the repository and the downloader:

```
routes       which address leads to which controller method     picture.routes.ts
controller   reads the request, checks the input, sends the answer   picture.controller.ts
service      the business rules (which animal, how many, ...)    picture.service.ts
repository   reads and writes the database                       picture.repository.ts
downloader   fetches a picture from the internet                 picture-downloader.ts
```


### Why does each service have its own `package.json`?

Each service is built into its own Docker image. If a service lists only its
own dependencies, its image contains only what that service needs. It also
means a service can later be moved to its own repository without untangling
anything.

---

## What you need

| Tool | Needed for | Version |
|---|---|---|
| **Node.js** (includes npm) | Building and running the code on your machine | **24 LTS** |
| **Docker Desktop** | Running the whole app, and the API's integration tests | recent version |
| **Git** | Version control | any recent version |

The project checks your Node.js version: npm refuses to install if you use a
version other than 24. If you use a Node version manager such as `nvm` or
`fnm`, running `nvm use` (or `fnm use`) picks the right version from `.nvmrc`.

Node.js is only needed to work on the code. To just run the app, Docker
Desktop and Git are enough.

### Getting the code

```sh
git clone https://github.com/thomasvanhavere/animal-picture-app.git
cd animal-picture-app
```

---

## Configuration

The app works out of the box: every setting has a default in
`.env.defaults`, which Docker Compose and `npm run dev:api` read automatically.
Every setting is explained in that file.

To change a setting, don't edit `.env.defaults`. Create a file called `.env`
next to it and put only the settings you want to change in it:

```sh
# .env
UI_PORT=8081
DEFAULT_ANIMAL=dog
```

A setting in `.env` wins over its default. `.env` is ignored by Git, so
personal settings and passwords stay on your machine. After changing it,
restart with `docker compose up -d`.

One exception: PostgreSQL only reads `DATABASE_NAME`, `DATABASE_USER` and
`DATABASE_PASSWORD` while its data volume is still empty, to create the
database and user. To change them later, first run `docker compose down -v`,
which deletes the saved pictures.

### Picture services

Each animal gets its pictures from a picture service. You select it with
`<ANIMAL>_PROVIDER`, and its web address is set with
`<ANIMAL>_PROVIDER_<NAME>_URL`. Right now there is one service per animal; the
list of allowed services is in `api/src/config/animals.ts`.

| Animal | Setting | Allowed values | Default | Service |
|---|---|---|---|---|
| Cat | `CAT_PROVIDER` | `cataas` | `cataas` | [Cataas](https://cataas.com/) |
| Dog | `DOG_PROVIDER` | `placedog` | `placedog` | [Place.dog](https://place.dog/) |
| Bear | `BEAR_PROVIDER` | `placebear` | `placebear` | [PlaceBear](https://placebear.com/) |

### Picture sizes

Each animal has its own picture size, set with `<ANIMAL>_PICTURE_WIDTH` and
`<ANIMAL>_PICTURE_HEIGHT`. The web addresses use `{width}` and `{height}`
placeholders, which the app fills in with these values.

| Animal | Settings | Default | Resulting address |
|---|---|---|---|
| Cat | `CAT_PICTURE_WIDTH`, `CAT_PICTURE_HEIGHT` | 500 × 400 | `https://cataas.com/cat?width=500` |
| Dog | `DOG_PICTURE_WIDTH`, `DOG_PICTURE_HEIGHT` | 500 × 400 | `https://place.dog/500/400` |
| Bear | `BEAR_PICTURE_WIDTH`, `BEAR_PICTURE_HEIGHT` | 500 × 400 | `https://placebear.com/500/400` |

A service's address only needs the placeholders it uses. Cataas, for example,
only gets `{width}`: if it's also given a height, it stretches the picture to
fit.

Some services (such as PlaceBear) pick their picture based on the size, so
the same size always gives the same picture. `PICTURE_SIZE_VARIATION` adds up
to that many random pixels to the width and height, so you get a different
animal each time. Set it to `0` for exact sizes.

### Other settings

| Setting | Meaning | Default |
|---|---|---|
| `ENABLED_ANIMALS` | Which animals can be fetched (comma-separated) | `cat,dog,bear` |
| `DEFAULT_ANIMAL` | Animal used when a request doesn't pick one (`cat`, `dog`, `bear` or `random`) | `random` |
| `PICTURE_SIZE_VARIATION` | How many random pixels may be added to a picture's width and height | `50` |
| `UI_PORT` | The port the web page is opened on, on your machine | `8080` |
| `API_PORT` | The port the API listens on | `3000` |
| `MAX_PICTURES_PER_REQUEST` | The most pictures one request may fetch | `10` |
| `DOWNLOAD_TIMEOUT_MS` | How long to wait for a picture service, in milliseconds | `10000` |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | Where the database is and how to log in. In Docker, the API always uses port 5432, so `DATABASE_PORT` only changes the port opened on your machine. | see `.env.defaults` |

When the API starts, it checks every setting. If a value is misspelled or
missing, it stops right away and says which setting is wrong.

### Adding more animals or services

More free picture services are listed at
[public-apis](https://github.com/public-apis/public-apis) under *Animals*. The
bottom of `.env.defaults` explains step by step how to add a new service or a
new animal.

To choose a new animal on the web page too, add it to `ANIMAL_CHOICES` in
`ui/src/api/picture-api.ts` and as a radio button in `ui/index.html`. Its badge
colour (`--color-<animal>` and `.animal-<animal>`) is in `ui/src/styles.css`.

---

## Running

You need Docker Desktop running. No settings file is needed: the defaults
are used unless you add a `.env` (see [Configuration](#configuration)).
From the project folder:

```sh
docker compose up --build
```

The first time, this builds the API and UI images and downloads PostgreSQL,
which takes a few minutes. You'll see the database start, then the API create
its table and report:

```
animal-picture-api  | Applied 1 database migration(s).
animal-picture-api  | animal-picture-api is listening on port 3000.
```

On later starts the table already exists, and the API says
`Database is up to date.` instead.

Once the API is healthy, the web page starts. Open **http://localhost:8080**
in your browser. To check the API on its own, open
http://localhost:3000/health; you should see `{"status":"ok","database":"up"}`.

| Command | What it does |
|---|---|
| `docker compose up --build` | Start everything, rebuilding the images first |
| `docker compose up -d` | Start everything in the background |
| `docker compose up -d --build` | Rebuild and restart after changing the code; the saved pictures are kept |
| `docker compose logs -f animal-picture-api` | Watch the API's log (or `animal-picture-ui` for the web page's) |
| `docker compose down` | Stop everything; the saved pictures are kept |
| `docker compose down -v` | Stop everything **and delete** the saved pictures |

### Looking inside the database

The database is reachable from your machine on port 5432, or on your
`DATABASE_PORT` (user, password and database name as in `.env.defaults`,
unless you changed them in `.env`). To run a quick query without any tools:

```sh
docker exec animal-picture-database psql -U animal_picture_user -d animal_picture_database \
  -c "SELECT id, animal, provider, size_bytes, created_at FROM animal_pictures ORDER BY id"
```

### Running the API outside Docker (for development)

Start only the database in Docker, then run the API on your machine. It
restarts by itself every time you save a file:

```sh
docker compose up -d animal-picture-database
npm run install:all
npm run dev:api
```

This works because the default `DATABASE_HOST` is `localhost`, and the
database container exposes its port on your machine.

### Running the web page outside Docker (for development)

With the API running (in Docker or with `npm run dev:api`), start the page:

```sh
npm run dev:ui
```

Open http://localhost:5173. The page reloads by itself every time you save a
file. Vite, the development server, passes `/api` requests on to the API on
`localhost`, just like Nginx does in Docker.

---

## The web page

The page at http://localhost:8080 has two parts.

**Fetch new pictures** (left, or on top on a phone):

- **Animal** chooses what to fetch: **Random** (the default), **Cat**, **Dog**
  or **Bear**. With Random, each picture gets its own random animal,
  whatever `DEFAULT_ANIMAL` says. Choosing an animal that is switched off in
  `ENABLED_ANIMALS` shows the API's error message.
- **#Pictures** is a number box that starts at 1. It only accepts whole
  numbers: keys like `-`, `e` or `.` do nothing, pasted text is cleaned up
  (`-5` becomes `5`), and an empty box or `0` goes back to 1 when you leave it.
  A note underneath ("Max. 10 pictures") says how many can be fetched at once, the
  default `MAX_PICTURES_PER_REQUEST`. If you change that setting, change the
  note in `ui/index.html` too.
- **Fetch** asks the API for that many pictures of the chosen animal. The
  button says what it will do, for example "Fetch 3 dog pictures". While
  fetching, the button and the choices are disabled.
- The fetched pictures appear below. One picture is shown on its own;
  several are shown in a **carousel**. Move through it with the ‹ › buttons,
  the dots, the left and right arrow keys, or by swiping on a touch screen.
- If something goes wrong (for example a picture service is down), the
  API's message is shown in red, and nothing is saved.

**Latest saved picture** (right, or below on a phone) shows the newest
picture in the database when the page opens, and is updated after every fetch.

The browser only ever talks to the page's own address. Nginx, inside the UI
container, passes every `/api/...` request on to the API container.

---

## The API

The API lives at `http://localhost:3000`. Every answer is JSON, except the
ones that return a picture file. Errors always look like this:

```json
{ "error": "Bad Request", "message": "\"fox\" is not a known animal. Choose one of: cat, dog, bear, random." }
```

### Fetch and save new pictures

```
POST /api/pictures?animal=<cat|dog|bear|random>&count=<number>
```

| Parameter | Required? | Meaning |
|---|---|---|
| `animal` | no | Which animal. If left out, the `DEFAULT_ANIMAL` setting is used. With `random`, each picture gets its own random animal from `ENABLED_ANIMALS`. |
| `count` | no | How many pictures to fetch, from 1 to `MAX_PICTURES_PER_REQUEST`. Defaults to 1. |

Answers with `201 Created` and the details of every saved picture, oldest
first:

```json
{
  "count": 2,
  "pictures": [
    {
      "id": 5,
      "animal": "cat",
      "provider": "cataas",
      "sourceUrl": "https://cataas.com/cat?width=545",
      "contentType": "image/jpeg",
      "sizeBytes": 75262,
      "createdAt": "2026-09-14T11:59:58.628Z",
      "url": "/api/pictures/5"
    },
    { "id": 6, "animal": "bear", "...": "..." }
  ]
}
```

Possible errors: `400` for an unknown or disabled animal or a bad count,
`502` when the picture service is down or sends something that isn't a
picture.

A request saves all its pictures or none: if even one of them can't be
downloaded or saved, the answer is an error and nothing is added.

### Get the latest saved picture

```
GET /api/pictures/latest
```

Sends the newest saved picture, of any animal, **as a file**, so a browser
shows it directly.

```
GET /api/pictures/latest/details
```

The same picture, but as JSON details (the same shape as above) instead of
the file.

Both answer `404` if nothing has been saved yet.

### Get one specific picture

```
GET /api/pictures/<id>
```

Sends the picture with that id as a file. `400` if the id isn't a whole
number, `404` if there is no picture with that id. Every picture's details
contain this address as `url`.

### Addresses that don't exist, and unexpected errors

Any other address answers `404` in the same JSON shape. If something goes
wrong inside the API (a bug, the database failing mid-request), the answer is
`500` with a general message; the details are only written to the API's log.

### Health check

```
GET /health
```

`200 {"status":"ok","database":"up"}` when everything works, or
`503 {"status":"degraded","database":"down"}` when the database can't be
reached. Docker uses this to decide whether the container is healthy.

### Try it out with Postman

A ready-made collection with every request is in
`api/postman/animal-picture-api.postman_collection.json`. In Postman, choose
**File → Import** and pick that file. The 16 requests are grouped in folders
(Health, Fetch and save, Latest picture, One picture by id, Errors). Each has
a description, and a small check in its **Tests** tab that shows at a glance
whether the answer was as expected.

Use **Run collection** to run them all in one go. The "Fetch and save"
requests run first and remember the id of the picture they saved last, so
"One picture by id" always has a picture to find. They download real
pictures and save them in your database.

If your API isn't on port 3000, change the `baseUrl` variable in the
collection's **Variables** tab.

### Try it out in the browser

Open these one after the other:

1. http://localhost:3000/api/pictures/latest — the newest picture, or `404`
   if nothing has been saved yet.
2. Fetch a picture. Browsers can't send `POST` from the address bar, so use
   the command line:
   ```powershell
   # Windows (use curl.exe, not curl, which is a different command in PowerShell)
   curl.exe -X POST "http://localhost:3000/api/pictures?animal=dog&count=3"
   ```
   ```sh
   # Mac / Linux
   curl -X POST "http://localhost:3000/api/pictures?animal=dog&count=3"
   ```
3. http://localhost:3000/api/pictures/latest — the newest picture (a dog).
4. http://localhost:3000/api/pictures/latest/details — its details as JSON.

---

## Building and testing

You don't need to build anything to run the app; Docker does it. These
commands are for working on the code. Run them from the project root:

| Command | What it does |
|---|---|
| `npm run install:all` | Install the packages of every service |
| `npm run build` | Build every service: the API into `api/dist/`, the web page into `ui/dist/` |
| `npm test` | Run the unit tests of every service |
| `npm run test:integration` | Run the API's integration tests against a real database (needs Docker); the web page has none |
| `npm run dev:api` | Run the API on your machine, restarting on every change |
| `npm run dev:ui` | Run the web page on your machine, reloading on every change |

Inside the `api/` and `ui/` folders, `npm run typecheck` checks the types
without producing files. In `api/`, `npm run test:all` runs the unit and
integration tests together. In `ui/`, `npm run preview` serves the built
`dist/` folder, to try the build.

### The tests

The API has two kinds of automated tests, and the web page has its own.

**Unit tests** (`npm test`) live in `api/test/`, one file per piece of the
code. They need no database and no internet: the pieces around the code under
test are replaced by small fakes, so the tests run in well under a second.

| File | What it checks |
|---|---|
| `config.test.ts` | Settings are read correctly, and every wrong value gets a clear message |
| `picture-downloader.test.ts` | Addresses are built correctly and bad answers from a picture service are reported |
| `picture.service.test.ts` | The rules: default and random animal, counts, saving all or nothing, latest picture, errors |
| `app.test.ts` | The HTTP layer: parameters, status codes, headers, JSON shapes and error answers |

**Integration tests** (`npm run test:integration`) live in
`api/test/integration/`. They check that the pieces really work together.
Before they run, a temporary PostgreSQL container is started (with the same
image as in `docker-compose.yml`), and it is removed again afterwards. It is
separate from the Compose database, so your saved pictures are never touched.
**Docker Desktop must be running.** The first run downloads the PostgreSQL
image; after that the tests take a few seconds.

| File | What it checks |
|---|---|
| `migrations.test.ts` | The migration creates the right columns and index, matches the entity, and can be undone |
| `picture.repository.test.ts` | Pictures are stored byte for byte, and the "latest" queries sort correctly |
| `api.e2e.test.ts` | The whole API, from HTTP request to database: fetching (including random animals), saving nothing when a download fails, the latest picture, pictures by id, the health check, and every error answer |

The end-to-end tests don't use the real picture services, which change their
pictures and are sometimes offline. Instead they start a small fake picture
service on your machine (`helpers/fake-picture-service.ts`), point the
`<ANIMAL>_PROVIDER_<NAME>_URL` settings at it, and make it fail on purpose to
test the error cases.

**Web page tests** (`npm test`, which runs them together with the API's unit
tests) live in `ui/test/`. They run in a simulated browser page (jsdom), with
a fake API, so no server is needed.

| File | What it checks |
|---|---|
| `count-input.test.ts` | The "#Pictures" box refuses anything but whole numbers of 1 or more |
| `carousel.test.ts` | The carousel moves with buttons, dots, arrow keys and swipes, and wraps around |
| `picture-api.test.ts` | The right requests are sent, and error answers become readable messages |
| `app.test.ts` | The real `index.html`, used like a person would: latest picture, choosing an animal, fetching one or several pictures, the busy state, and errors |

---

