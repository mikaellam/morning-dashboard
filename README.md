# Morning Dashboard

A personal morning dashboard built with React, hosted on Vercel. Designed to display at-a-glance information to start the day: weather, energy prices, calendar events, and more.

## Features (planned)

- Weather forecast via [Open-Meteo](https://open-meteo.com/) (free, no API key required)
- Electricity spot prices via [ENTSO-E Transparency Platform](https://transparency.entsoe.eu/)
- Upcoming calendar events via Google Calendar API
- Clean, minimal UI optimized for a morning glance

## Tech Stack

- [React](https://react.dev/) (Create React App)
- Hosted on [Vercel](https://vercel.com/)

## Getting Started

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

See `.env.example` for the required variables.

## Deployment

The app is deployed automatically to Vercel on every push to `main`.

## Build

```bash
npm run build
```

Produces an optimized production build in the `/build` folder.
