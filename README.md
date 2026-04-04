<a href="https://chat.vercel.ai/">
  <img alt="Next.js 14 and App Router-ready AI chatbot." src="app/(chat)/opengraph-image.png">
  <h1 align="center">Chat SDK</h1>
</a>

<p align="center">
    Chat SDK is a free, open-source template built with Next.js and the AI SDK that helps you quickly build powerful chatbot applications.
</p>

<p align="center">
  <a href="https://chat-sdk.dev"><strong>Read Docs</strong></a> ·
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#model-providers"><strong>Model Providers</strong></a> ·
  <a href="#deploy-your-own"><strong>Deploy Your Own</strong></a> ·
  <a href="#running-locally"><strong>Running locally</strong></a>
</p>
<br/>

## Features

- [Next.js](https://nextjs.org) App Router
  - Advanced routing for seamless navigation and performance
  - React Server Components (RSCs) and Server Actions for server-side rendering and increased performance
- [AI SDK](https://ai-sdk.dev/docs/introduction)
  - Unified API for generating text, structured objects, and tool calls with LLMs
  - Hooks for building dynamic chat and generative user interfaces
  - Supports xAI (default), OpenAI, Fireworks, and other model providers
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - Component primitives from [Radix UI](https://radix-ui.com) for accessibility and flexibility
- Data Persistence
  - [Neon Serverless Postgres](https://vercel.com/marketplace/neon) for saving chat history and user data
  - [Vercel Blob](https://vercel.com/storage/blob) for efficient file storage
- [Auth.js](https://authjs.dev)
  - Simple and secure authentication

## Model Providers

This repo now defaults to [OpenRouter](https://openrouter.ai/) for model access. The chat UI sends a stable backend-owned alias (`auto`), and the server resolves that alias to whichever OpenRouter model you configure in `.env.local`.

### OpenRouter Configuration

Set `LLM_BACKEND=openrouter` and provide `OPENROUTER_API_KEY`. You can then configure the backend-owned model routes:

- `OPENROUTER_CHAT_MODEL`
- `OPENROUTER_TITLE_MODEL`
- `OPENROUTER_ARTIFACT_MODEL`
- `OPENROUTER_REASONING_MODEL`

If you want OpenRouter to target specific upstream providers or use provider-specific API keys without adding separate provider implementations in the app, use the routing envs in `.env.example`, especially `OPENROUTER_PROVIDER_ORDER` and `OPENROUTER_PROVIDER_API_KEYS`.

### Legacy Vercel Gateway Path

The old Vercel Gateway implementation is still in the codebase. Set `LLM_BACKEND=gateway` and provide `AI_GATEWAY_API_KEY` if you want to keep using that path.

## Internal Architecture Docs

- [Frontend Architecture Overview](docs/frontend-overview.md)
- [Backend Architecture Overview](docs/backend-overview.md)
- [Chat API and Agent Loop](docs/chat-api-agent-loop.md)

## Deploy Your Own

You can deploy your own version of the Next.js AI Chatbot to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/templates/next.js/nextjs-ai-chatbot)

## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run Next.js AI Chatbot. It's recommended you use [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) for this, but a `.env` file is all that is necessary.

> Note: You should not commit your `.env` file or it will expose secrets that will allow others to control access to your various AI and authentication provider accounts.

1. Install Vercel CLI: `npm i -g vercel`
2. Link local instance with Vercel and GitHub accounts (creates `.vercel` directory): `vercel link`
3. Download your environment variables: `vercel env pull`

```bash
pnpm install
pnpm db:migrate # Setup database or apply latest database changes
pnpm dev
```

Your app template should now be running on [localhost:3000](http://localhost:3000).

For this repo, the finance prototype backend is part of the same Next.js process, so there is no separate API server to launch. If you want one command that checks `.env.local`, runs migrations, and starts the app, use:

```bash
pnpm dev:local
```
