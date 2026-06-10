# Human AI Platform

Human AI Platform is a full-stack application for exploring, storing, and analyzing human-AI conversations. It combines a React frontend, a FastAPI backend, Supabase authentication/database storage, and AI-assisted conversation analysis.

## Features

- Supabase authentication for sign up, sign in, password reset, and user sessions
- Chat workspace with sessions, folders, and realtime updates
- FastAPI backend for authenticated chat requests and analysis workflows
- Supabase database schema for chat sessions, messages, folders, analysis, and category metadata
- Dashboard views for reviewing conversation quality, prompt patterns, and response metrics

## Tech Stack

- React and Vite
- FastAPI
- Supabase
- Mistral AI
- Tailwind CSS
- uv for Python dependency management

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) LTS
- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- A [Supabase](https://supabase.com/) project
- A [Mistral AI](https://mistral.ai/) API key

### 1. Clone the repository

```bash
git clone https://github.com/rigers7/human-ai-platform.git
cd human-ai-platform
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Install backend dependencies

```bash
uv sync
```

### 4. Configure environment variables

Create a local environment file:

```bash
cp .env.example .env.local
```

Then replace every placeholder in `.env.local` with values from your own Supabase and Mistral projects.

Never commit `.env` or `.env.local`. The Supabase service role key is server-only and must stay private.

For production, set `VITE_API_BASE_URL` to your deployed backend URL and `CORS_ORIGINS` to your deployed frontend origin.

### 5. Set up Supabase

Apply the schema in `supabase/humanai_schema.sql` to your Supabase project before starting the app.

The simplest option is to open the Supabase SQL editor, paste the schema SQL, and run it.

Do not commit raw Supabase backups. Backups can include auth users, refresh tokens, chat history, and vault secrets.

### 6. Run the backend

```bash
uv run uvicorn backend.main:app --reload
```

The backend runs at `http://127.0.0.1:8000` by default.

### 7. Run the frontend

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

## Project Structure

```text
backend/              FastAPI backend, API routes, services, and Supabase repository code
src/                  React frontend source
supabase/             Public-safe database schema
.env.example          Environment variable template
```

## Security Notes

- Use `.env.local` for local secrets.
- Keep the Supabase service role key on the backend only.
- Rotate keys if they were ever committed to another repository or shared outside the deployment team.
- Do not publish raw database backups.

## License

MIT

## Contributors

- Rigers Budlla
- Manuel Heumann
