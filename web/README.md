This directory contains Halberd's [Next.js](https://nextjs.org) website and browser policy playground.

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

Open [http://localhost:3000](http://localhost:3000) in your browser.

The homepage is in `src/app/page.tsx`. The development server updates it as you edit.

The playground runs the policy engine in WebAssembly; see the [architecture guide](../docs/FIREWALL_ARCHITECTURE.md) for its scope.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

The [root README](../README.md) covers Halberd's policy engine and transports.

## Deploy on Vercel

See the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for deployment options.
