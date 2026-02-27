# IRC Memory Lane - Standalone React App

A standalone React application for browsing IRC logs. This app can be deployed **anywhere** - root domain, subdirectory, or even embedded in other applications.

## Architecture

- **Frontend**: React 19 + Vite  
- **Backend**: Tools API at `https://tools.tornevall.net` (production)  
- **Deployment**: Fully standalone (no Laravel dependency, no hardcoded paths!)  

## Quick Start

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Run development server
npm run dev

# Build for production
npm run build
```

## Features

- 🔍 Search IRC logs  
- 📌 Save highlights with permalinks  
- 📚 Create collections  
- 🎨 mIRC color rendering  
- 🔐 API key authentication  

## Configuration

### Environment Variables

Create `.env.local` for your deployment:

```env
# API Base URL
VITE_API_URL=https://tools.tornevall.net  # Production
# VITE_API_URL=https://tools.tornevall.com  # Staging
# VITE_API_URL=http://localhost:8000  # Local dev

# Base path (only needed for subdirectory deployment)
BASE_URL=/
# BASE_URL=/irclogs-react  # For subdirectory
```

### Deployment Options

#### **Option 1: Root Domain (Recommended)**

Deploy to root of any domain - fully flexible!

```bash
npm run build
# Deploy dist/ to: https://your-domain.com/
# No base path needed!
```

#### **Option 2: Subdirectory**

If you need subdirectory deployment:

```bash
# Edit .env.local:
BASE_URL=/irclogs-react

npm run build
# Deploy dist/ to: https://your-domain.com/irclogs-react/
```

#### **Option 3: Embed in Another App**

Completely standalone - can be embedded anywhere:

```html
<iframe src="https://irc-logs.example.com/" />
```

## API Configuration

### Production vs Staging

**Production (default):**
```javascript
VITE_API_URL=https://tools.tornevall.net  // .NET!
```

**Staging:**
```javascript
VITE_API_URL=https://tools.tornevall.com  // .COM is staging!
```

### Custom API Backend

Deploy with your own API backend:

```javascript
VITE_API_URL=https://your-api.example.com
```

## Differences from Laravel Viewer

| Feature | Laravel (`/irc`) | React App |
|---------|------------------|-----------|
| Integration | Laravel-integrated | **Fully standalone** |
| Auth | Laravel session | API key |
| Deployment | Requires PHP | **Any static host** |
| Base Path | Fixed | **Configurable** |
| API URL | Hardcoded | **Environment variable** |

## Development Notes

### Completely Flexible!

✅ **No hardcoded base path** - Deploy to root or subdirectory  
✅ **No hardcoded API URL** - Configure via .env  
✅ **No Laravel dependencies** - Pure React  
✅ **No build-time configuration** - Runtime config via env vars  

### Deployment Examples

**Vercel:**
```bash
# Set environment variables in Vercel dashboard
VITE_API_URL=https://tools.tornevall.net
npm run build
```

**Netlify:**
```bash
# netlify.toml
[build.environment]
  VITE_API_URL = "https://tools.tornevall.net"
```

**GitHub Pages:**
```bash
# For subdirectory deployment
BASE_URL=/repository-name
npm run build
```

**Docker:**
```dockerfile
ENV VITE_API_URL=https://tools.tornevall.net
RUN npm run build
```

## API Documentation

See `/docs/irclog-api-reference` on tools.tornevall.net

## Important: Production vs Staging

**Remember:**
- `.net` = Production API
- `.com` = Staging API

Default is `.net` (production).

