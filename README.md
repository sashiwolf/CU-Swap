# CU Swap

A campus-focused marketplace where students list items, buy items, handle payments with Stripe, and rate **sellers** (seller-focused reviews, not product reviews).

---

## Contributors
- Sashi Wolf
- Dylon Gregory
- Shon Butz
- Hayden Leovy
- Joe Young

---

## Project Structure
```
group-project-03/
├─ README.md
├─ TeamMeetingLogs/
├─ MilestoneSubmissions/
└─ ProjectSourceCode/
   ├─ docker-compose.yaml
   ├─ .gitignore
   ├─ package.json
   ├─ index.js
   ├─ init_db.sh
   ├─ clear_db.sh
   ├─ src/
   │  ├─ views/
   │  │  ├─ Layouts/
   │  │  │  └─ main.hbs
   │  │  ├─ pages/ (home, login, register, listings, checkout, etc.)
   │  │  ├─ partials/ (header, footer, nav, message)
   │  │  └─ Images/ (logo/background images)
   │  ├─ resources/
   │  │  ├─ css/style.css
   │  │  └─ js/script.js
   │  └─ init_data/
   │     ├─ create.sql
   │     └─ insert.sql
   ├─ test/
   │  └─ server.spec.js
   └─ node_modules/ (installed dependencies)
```
- `group-project-03/` is the repo root; this README lives here.
- `TeamMeetingLogs/` holds meeting notes.
- `MilestoneSubmissions/` stores course milestone deliverables.
- `ProjectSourceCode/` holds the runnable app. `index.js` boots Express; `docker-compose.yaml` starts up the app locally.
- `src/views/` contains Handlebars UI: layouts, shared partials, and page templates (main, home, discover, listings, checkout, profiles, reviews, etc).
- `src/resources/` serves static assets (CSS/JS).
- `src/init_data/` has SQL schema and seed data.
- `test/` contains Mocha integration tests.

---

## Technology Stack

- **Frontend:** Handlebars + JavaScript + CSS
- **Backend:** Node.js + Express  
- **DB:** PostgreSQL  
- **Auth/Session:** express-session (cookie-based sessions)  
- **Payments:** Stripe (test mode)  
- **Email:** Nodemailer (Gmail)  
- **CLI:** `psql` for DB ops  
- **(Optional) Containers:** Docker / Docker Compose

---

## Prerequisites

- **Node.js** v18+ and **npm**  
- **PostgreSQL** (local or via Docker)  
- **`psql`** client installed  
- **Stripe** account (for test keys)  
- **Gmail** with App Password for Nodemailer

---

## Running the Application Locally

After cloning the repository you can cd into the ProjectSourceCode directory then run docker compose up --build after creating the .env file in the same directory as the docker-compose.yaml file and then open it locally at localhost:3000

Create a `.env` file in the project root and paste:

```bash
# database credentials
POSTGRES_HOST=db
POSTGRES_PORT=5432

POSTGRES_USER="postgres"
POSTGRES_PASSWORD="pwd"
POSTGRES_DB="users_db"

# Node vars
SESSION_SECRET="super duper secret!"

# Email (Nodemailer via Gmail)
# Use any Gmail account as the sender. You MUST use a Gmail App Password
# (NOT your normal Google password). Create an app password in the Gmail
# account’s security settings and paste it below.

EMAIL_USER="example@gmail.com"      # The sender Gmail address
EMAIL_PASS="example_app_password"   # The 16-char Gmail App Password for EMAIL_USER


# Stripe
STRIPE_SECRET_KEY=sk_test_51SPq3M2fkfOLamLT0XFQNgg19K988KOaLgyDMHBor4o7UptGNulKjej1LIo5Vk9ousdv7ZTDSoU8hSLsIpHK4Hzj00348A55ZE
STRIPE_PUBLISHABLE_KEY=pk_test_51SPq3M2fkfOLamLTrVJnmVYkS04P36B5o3n7btXoU31IZCJ9WGDqZ9RZb6G02v3zpYBM81JT064hYNFCuT5A97qe00zcmvvvvf
```

---

## Stopping / Cleaning Up
- Stop containers: `docker compose down`
- Remove containers and volumes: `docker compose down -v`

---

## Running Tests
Automatic Testing will be completed upon composing up and shown as complete in the terminal.

Manual testing CU Swap is simple --- just use the website as you would any other online marketplace. Browse listings, post items, and interact with the platform.

## Deployed Application
Live App: https://cu-swap.onrender.com
