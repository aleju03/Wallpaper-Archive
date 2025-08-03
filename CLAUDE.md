# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Full Development Environment
- `npm run dev` - **Start all three components** (backend + admin panel + user frontend)
- `npm run dev:admin-only` - Start backend + admin panel only (legacy compatibility)
- `npm run dev:frontend` - Start both frontend applications only

### Individual Components
#### Backend (Node.js/Fastify)
- `npm start` - Start the production server
- `npm run dev:backend` - Start backend development server only
- `npm run download` - Run wallpaper downloader to fetch images from providers
- `npm run update-dimensions` - Update image dimensions in database

#### Admin Panel Frontend (React/Vite)
- `npm run dev:admin` - Start admin panel development server only
- `cd admin-panel && npm run build` - Build admin React frontend for production
- `cd admin-panel && npm run lint` - Run ESLint on admin frontend code

#### User Frontend (React/Vite)
- `npm run dev:user` - Start user frontend development server only
- `cd user-frontend && npm run build` - Build user React frontend for production
- `cd user-frontend && npm run lint` - Run ESLint on user frontend code

## Architecture Overview

This is a wallpaper management system with three main components:

### Backend (Node.js)
- **server.js** - Main Fastify server with REST API endpoints
- **database.js** - SQLite database wrapper class for wallpaper metadata
- **downloader.js** - Multi-provider wallpaper downloader that fetches from GitHub repos
- **osu-provider.js** - Specialized provider for osu! game files
- **generate-thumbnails.js** - Utility to create image thumbnails
- **update-dimensions.js** - Utility to analyze and store image dimensions

### Admin Panel Frontend (React/Vite)
- Located in `admin-panel/` directory
- React SPA with components for Dashboard, Gallery, Statistics, and Duplicates management
- Uses Axios for API communication with backend
- Vite for build tooling and development server
- Designed for administrators to manage wallpapers, view statistics, and handle duplicates

### User Frontend (React/Vite)
- Located in `user-frontend/` directory
- React SPA with components for Browse, Categories, and wallpaper viewing
- Uses Axios for API communication with backend
- Vite for build tooling and development server
- Designed for end users to discover, preview, and download wallpapers
- Features search, filtering, category browsing, and high-quality wallpaper previews

### Database Schema
SQLite database (`wallpapers.db`) with schema:
- `wallpapers` table: id, filename, provider, folder, file_size, dimensions, download_url, local_path, created_at, tags
- Indexed on provider, folder, and filename for efficient queries

### File Structure
- `/downloads/` - Original wallpaper images
- `/thumbnails/` - Generated thumbnail images (300x200px)
- `admin-panel/src/components/` - Admin panel React components
- `user-frontend/src/components/` - User frontend React components

## API Endpoints

The backend serves a REST API at:
- `GET /` - API documentation
- `GET /api/wallpapers` - List wallpapers with optional filters (provider, folder, search)
- `GET /api/wallpapers/:id` - Get single wallpaper details
- `GET /api/stats` - Database statistics
- `GET /images/:filename` - Serve original images
- `GET /thumbnails/:filename` - Serve thumbnail images

## Provider System

The downloader supports multiple wallpaper sources:
- GitHub repositories (BitterSweetcandyshop, D3Ext, dharmx)
- Local osu! installation files
- Each provider has configurable folders and API endpoints

## Development Notes

### Server Configuration
- **Backend**: Runs on port 3000 (Fastify default) with CORS enabled for frontends
- **Admin Panel**: Development server runs on port 5173 (Vite default)
- **User Frontend**: Development server runs on port 5174 (Vite default + 1)

### Development Workflow
- **Primary command**: `npm run dev` starts all three components simultaneously
- **Concurrent execution**: Uses `concurrently` package to run multiple dev servers
- **Individual testing**: Each component can be started independently for focused development
- **API sharing**: Both frontends consume the same backend API endpoints

### Technical Details
- Images are processed with Sharp library for thumbnails
- Database operations use sqlite3 with prepared statements
- Both frontends share the same dark, minimalistic aesthetic using SF Mono font
- Responsive design optimized for desktop and mobile devices
- Performance-optimized with lazy loading and efficient rendering

### Access URLs (when running `npm run dev`)
- **Backend API**: http://localhost:3000
- **Admin Panel**: http://localhost:5173
- **User Frontend**: http://localhost:5174

**Always assume the server is already running so you don't have to start it.**