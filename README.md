This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Masoret automation queue

AI chat orders are created as safe drafts. A dashboard manager can approve a draft, which moves it to `ai_ready_for_source_submit`.

The automation API is protected with a bearer token from `AUTOMATION_API_SECRET`. If that value is not configured, it falls back to `DASHBOARD_AUTH_SECRET`.

Read approved orders:

```bash
curl -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  "https://masoret-dashboard.vercel.app/api/automation/orders?limit=10"
```

Run a safe simulation without submitting to any external site:

```bash
curl -X POST \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":10}' \
  "https://masoret-dashboard.vercel.app/api/automation/orders"
```

Simulation updates valid orders to `source_submit_simulated`, adds a simulation note, and never creates a real order on the source site.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

