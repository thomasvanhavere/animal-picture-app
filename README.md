# Animal Picture App

A small microservice application that **downloads random pictures of animals**
(cats, dogs and bears), **stores them in a database**, and **shows them in a
simple web page**.

It's written in **TypeScript**, built with **npm**, and runs in **Docker
containers**.

> **Status:** work in progress. See the [Roadmap](#roadmap) for what's already
> built and what's next.

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
10. [How the code is documented](#how-the-code-is-documented)
11. [Roadmap](#roadmap)

---

## What does it do?

1. **Fetch new pictures.** The app asks a free public picture service for a
   random picture of a cat, dog or bear, downloads it, and saves it in the
   database. You can say which animal you want and how many pictures (one,
   if you don't say). Which service to use and what size the pictures are
   is set with environment variables.
2. **Show the latest picture.** You can ask for the most recently saved
   picture, either of one kind of animal or of any animal.
3. **A web page.** At http://localhost:8080 you see the latest saved picture,
   and a button that fetches as many random pictures as you ask for. Several
   pictures are shown in a carousel.
4. **More to come.** The design leaves room for new features, such as running
   the picture fetch as a step in a Camunda process.

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

| Service | Job | Built with |
|---|---|---|
| **animal-picture-ui** | Shows the web page. Passes every `/api/...` request on to the API, so the browser only ever talks to one address. | TypeScript, Nginx |
| **animal-picture-api** | Fetches pictures from the internet, saves them, and hands them back out. Knows nothing about the web page. | TypeScript, Node.js, Express, TypeORM |
| **animal-picture-database** | Keeps the saved pictures, even after a restart. | PostgreSQL |

### Why these choices?

- **Separate UI and API.** Each part can be changed, restarted or replaced on
  its own. The API can also be used by other programs (for example a Camunda
  worker) in exactly the same way the web page uses it.
- **Express.** A small, widely known web framework. We give it a clear
  structure of our own: *routes → controllers → services → repositories*.
- **TypeORM.** Maps database tables to TypeScript classes. It works much like
  JPA/Hibernate in Java, so Java developers will recognise it right away.
- **PostgreSQL in its own container.** Runs locally, needs no cloud account,
  and keeps its data in a Docker volume.
- **npm.** The standard build tool for TypeScript. Each service has its own
  `package.json`, so it can be installed, built and containerised on its own.

---

## Project layout

```
animal-picture-app/
├── .env.example         All settings, with explanations (copy to .env to use)
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
│   ├── postman/         A Postman collection with every request, for trying the API by hand
│   ├── src/
│   │   ├── main.ts               Starting point: reads settings, connects, starts listening
│   │   ├── app.ts                Wires the pieces into one Express app
│   │   ├── application.ts        Builds the complete app from the settings and the database
│   │   ├── config/               Reads and checks the settings; the animal and service lists
│   │   ├── database/             The picture table (entity), the connection, the migrations
│   │   ├── pictures/             The picture feature, in layers (see below)
│   │   ├── health/               The GET /health endpoint
│   │   └── errors/               Error types and the central error handler
│   └── test/                     Unit tests, one file per piece
│       └── integration/          Tests against a real database and the whole running API
│
└── ui/                  The web page service
    ├── package.json     Its own packages and commands
    ├── Dockerfile       How to build its container image (the page, served by Nginx)
    ├── nginx/           Nginx settings: serve the page, pass /api on to the API
    ├── index.html       The page's structure
    ├── src/
    │   ├── main.ts               Starting point: starts the page with the real API
    │   ├── app.ts                The page's behaviour: latest picture, fetch button, results
    │   ├── api/                  Talks to the API
    │   ├── components/           The picture card, the carousel and the "How many" box
    │   └── styles.css            How the page looks
    └── test/                     Automated tests, run in a simulated browser page
```

### How the API code is layered

A request travels down through these layers and the answer travels back up.
Each layer only knows the one below it:

```
routes       which address leads to which controller method     picture.routes.ts
controller   reads the request, checks the input, sends the answer   picture.controller.ts
service      the business rules (which animal, how many, ...)    picture.service.ts
repository   reads and writes the database                       picture.repository.ts
downloader   fetches a picture from the internet                 picture-downloader.ts
```

The service is the only layer with rules in it, and it has no idea it's
reached over HTTP. That makes it easy to reuse from somewhere else later, for
example from a Camunda job worker.

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
| **Docker Desktop** | Running the whole app with its database | recent version |
| **Git** | Version control | any recent version |

The project checks your Node.js version: npm refuses to install if you use a
version other than 24. If you use a Node version manager such as `nvm` or
`fnm`, running `nvm use` (or `fnm use`) picks the right version from `.nvmrc`.

---

## Configuration

All settings live in one environment file. To get started, copy the example:

```powershell
# Windows
Copy-Item .env.example .env
```

```sh
# Mac / Linux
cp .env.example .env
```

Then change `.env` as you like. It's ignored by Git, so personal settings and
passwords stay on your machine. Every setting is explained inside
`.env.example`.

### Picture services

Each animal can choose from a list of picture services. You select one with
`<ANIMAL>_PROVIDER`, and each service's web address is set with
`<ANIMAL>_PROVIDER_<NAME>_URL`.

| Animal | Setting | Allowed values | Default | Service |
|---|---|---|---|---|
| Cat | `CAT_PROVIDER` | `cataas`, `placecats`, `placekitten` | `cataas` | [Cataas](https://cataas.com/), [PlaceCats](https://placecats.com/), [PlaceKitten](https://placekitten.com/) (offline on 2026-09-14) |
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

Some services (PlaceBear, PlaceCats) pick their picture based on the size, so
the same size always gives the same picture. `PICTURE_SIZE_VARIATION` adds up
to that many random pixels to the width and height, so you get a different
animal each time. Set it to `0` for exact sizes.

### Other settings

| Setting | Meaning | Default |
|---|---|---|
| `ENABLED_ANIMALS` | Which animals can be fetched (comma-separated) | `cat,dog,bear` |
| `DEFAULT_ANIMAL` | Animal used when a request doesn't pick one (`cat`, `dog`, `bear` or `random`) | `random` |
| `PICTURE_SIZE_VARIATION` | How many random pixels may be added to a picture's width and height | `50` |
| `API_PORT` | The port the API listens on | `3000` |
| `MAX_PICTURES_PER_REQUEST` | The most pictures one request may fetch | `10` |
| `DOWNLOAD_TIMEOUT_MS` | How long to wait for a picture service, in milliseconds | `10000` |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | Where the database is and how to log in | see `.env.example` |

When the API starts, it checks every setting. If a value is misspelled or
missing, it stops right away and says which setting is wrong.

### Adding more animals or services

More free picture services are listed at
[public-apis](https://github.com/public-apis/public-apis) under *Animals*. The
bottom of `.env.example` explains step by step how to add a new service or a
new animal.

---

## Running

You need Docker Desktop running and a `.env` file (see
[Configuration](#configuration)). Then, from the project folder:

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

Once the API is healthy, the web page starts. Open **http://localhost:8080**
in your browser. To check the API on its own, open
http://localhost:3000/health; you should see `{"status":"ok","database":"up"}`.

| Command | What it does |
|---|---|
| `docker compose up --build` | Start everything, rebuilding the images first |
| `docker compose up -d` | Start everything in the background |
| `docker compose logs -f animal-picture-api` | Watch the API's log (or `animal-picture-ui` for the web page's) |
| `docker compose down` | Stop everything; the saved pictures are kept |
| `docker compose down -v` | Stop everything **and delete** the saved pictures |

### Looking inside the database

The database is reachable from your machine on port 5432 (user, password and
database name as in your `.env`). To run a quick query without any tools:

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

This works because `.env` says `DATABASE_HOST=localhost`, and the database
container exposes its port on your machine.

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

- **How many** is a number box that starts at 1. It only accepts whole
  numbers: keys like `-`, `e` or `.` do nothing, pasted text is cleaned up
  (`-5` becomes `5`), and an empty box or `0` goes back to 1 when you leave it.
- **Fetch random pictures** asks the API for that many pictures with
  `animal=random`, so each picture can be a cat, a dog or a bear, whatever
  `DEFAULT_ANIMAL` says. While fetching, the button is disabled.
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
{ "error": "Bad Request", "message": "\"fox\" is not a known animal. Choose one of: cat, dog, bear." }
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
GET /api/pictures/latest?animal=<cat|dog|bear>
```

Sends the newest saved picture **as a file**, so a browser shows it directly.
Leave `animal` out for the newest picture of any animal. Two extra headers,
`X-Picture-Id` and `X-Picture-Animal`, say which picture you got.

```
GET /api/pictures/latest/details?animal=<cat|dog|bear>
```

The same picture, but as JSON details (the same shape as above) instead of
the file.

Both answer `404` if nothing has been saved yet.

### Get one specific picture

```
GET /api/pictures/<id>
```

Sends the picture with that id as a file. `404` if there is none.

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
**File → Import** and pick that file. The requests are grouped in folders
(Health, Fetch and save, Latest picture, Errors), each has a description,
and each has a small check in its **Tests** tab so you can see at a glance
whether the answer was as expected. Use **Run collection** to run all 17 in
one go.

If your API isn't on port 3000, change the `baseUrl` variable in the
collection's **Variables** tab.

### Try it out in the browser

Open these one after the other:

1. http://localhost:3000/api/pictures/latest — `404`, nothing saved yet.
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
3. http://localhost:3000/api/pictures/latest?animal=dog — the newest dog.
4. http://localhost:3000/api/pictures/latest/details — its details as JSON.

---

## Building and testing

You don't need to build anything to run the app; Docker does it. These
commands are for working on the code. Run them from the project root:

| Command | What it does |
|---|---|
| `npm run install:all` | Install the packages of every service |
| `npm run build` | Compile the TypeScript of every service to JavaScript |
| `npm test` | Run the unit tests of every service |
| `npm run test:integration` | Run the integration tests of every service (needs Docker) |
| `npm run dev:api` | Run the API on your machine, restarting on every change |
| `npm run dev:ui` | Run the web page on your machine, reloading on every change |

Inside the `api/` and `ui/` folders, `npm run typecheck` checks the types
without producing files.

### The tests

The API has two kinds of automated tests, and the web page has its own.

**Unit tests** (`npm test`) live in `api/test/`, one file per piece of the
code. They need no database and no internet: the pieces around the code under
test are replaced by small fakes, so the tests run in well under a second.

| File | What it checks |
|---|---|
| `config.test.ts` | Settings are read correctly, and every wrong value gets a clear message |
| `picture-downloader.test.ts` | Addresses are built correctly and bad answers from a picture service are reported |
| `picture.service.test.ts` | The rules: default animal, counts, latest picture, errors |
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
| `picture.repository.test.ts` | Pictures are stored byte for byte, and the "latest" queries sort and filter correctly |
| `api.e2e.test.ts` | The whole API, from HTTP request to database: fetching, the latest picture, pictures by id, the health check, and every error answer |

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
| `count-input.test.ts` | The "How many" box refuses anything but whole numbers of 1 or more |
| `carousel.test.ts` | The carousel moves with buttons, dots, arrow keys and swipes, and wraps around |
| `picture-api.test.ts` | The right requests are sent, and error answers become readable messages |
| `app.test.ts` | The real `index.html`, used like a person would: latest picture, fetching one or several pictures, the busy state, and errors |

---

## How the code is documented

Every file in this project is written to be read by people, not just by
computers:

- **Every file starts with a short explanation** of what it is for.
- **Every function, class and setting has a comment** in plain language that
  explains *what* it does and *why* it's there.
- **Comments explain the reasoning.** The code already shows *how* something
  is done; the comments say why it's done that way.
- **Jargon is avoided or explained** the first time it's used.

JSON files such as `package.json` can't contain normal comments. Where an
explanation is useful, they use a `"//"` field instead, which npm ignores.

---

## Roadmap

| Step | What | Status |
|---|---|---|
| 1 | Repository skeleton: `package.json`, npm and Git settings, README | ✅ Done |
| 1b | Settings file (`.env.example`) with picture services for cats, dogs and bears | ✅ Done |
| 2 | API service: configuration, health check endpoint, Dockerfile | ✅ Done |
| 3 | animal-picture-database: PostgreSQL container, TypeORM picture table and repository | ✅ Done |
| 4 | Picture downloader (cat, dog, bear) and the "fetch new pictures" endpoint | ✅ Done |
| 5 | "Latest picture" endpoints | ✅ Done |
| 6 | UI service: web page, Nginx settings, Dockerfile | ✅ Done |
| 7 | Final documentation pass | ⏳ Next |
