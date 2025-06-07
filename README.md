# 🐨 Koala Code Reader

An AI-powered code analysis tool that helps you understand code repositories through intelligent summarization and analysis.

## Features

- **GitHub Integration**: Automatically fetch repository structure from GitHub URLs
- **AI-Powered Analysis**: Uses advanced AI models to analyze and summarize code
- **Real-time Updates**: WebSocket-based communication for live progress updates
- **Interactive UI**: Clean, modern interface with tabbed content display

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Copy the example environment file and configure your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
# Required: OpenAI API Key for AI analysis
OPENAI_API_KEY=your_openai_api_key_here

# Optional but recommended: GitHub Personal Access Token
# Helps avoid rate limits when fetching repository information
# Create at: https://github.com/settings/tokens
GITHUB_TOKEN=your_github_token_here
```

### 3. Development

```bash
npm run dev
```

### 4. Deployment

```bash
npm run deploy
```

## GitHub API Token (Recommended)

While the GitHub integration works without an API token for public repositories, adding a GitHub Personal Access Token provides several benefits:

- **Higher rate limits**: 5,000 requests per hour vs 60 for unauthenticated requests
- **Better reliability**: Avoid hitting rate limits during heavy usage
- **Access to private repos**: If you need to analyze private repositories

To create a GitHub token:

1. Go to [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select the `public_repo` scope for public repositories
4. Copy the token and add it to your `.env` file as `GITHUB_TOKEN`

## Usage

1. Open the application in your browser
2. Enter a GitHub repository URL in the setup modal
3. Click "Fetch Repo Info" to automatically populate the file structure
4. Customize the analysis goal and file structure if needed
5. Click "Start Analysis" to begin the AI-powered code analysis

## Type Generation

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```bash
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>();
```
