# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Backend (Node.js/Fastify)
- `npm start` - Start the production server
- `npm run dev:backend` - Start backend development server
- `npm run download` - Run wallpaper downloader to fetch images from providers
- `npm run update-dimensions` - Update image dimensions in database

### Frontend (React/Vite)
- `npm run dev:frontend` - Start frontend development server (runs in admin-panel/)
- `npm run dev` - Start both backend and frontend concurrently
- `cd admin-panel && npm run build` - Build React frontend for production
- `cd admin-panel && npm run lint` - Run ESLint on frontend code

## Architecture Overview

This is a wallpaper management system with two main components:

### Backend (Node.js)
- **server.js** - Main Fastify server with REST API endpoints
- **database.js** - SQLite database wrapper class for wallpaper metadata
- **downloader.js** - Multi-provider wallpaper downloader that fetches from GitHub repos
- **osu-provider.js** - Specialized provider for osu! game files
- **generate-thumbnails.js** - Utility to create image thumbnails
- **update-dimensions.js** - Utility to analyze and store image dimensions

### Frontend (React/Vite)
- Located in `admin-panel/` directory
- React SPA with components for Dashboard, Gallery, and Statistics
- Uses Axios for API communication with backend
- Vite for build tooling and development server

### Database Schema
SQLite database (`wallpapers.db`) with schema:
- `wallpapers` table: id, filename, provider, folder, file_size, dimensions, download_url, local_path, created_at, tags
- Indexed on provider, folder, and filename for efficient queries

### File Structure
- `/downloads/` - Original wallpaper images
- `/thumbnails/` - Generated thumbnail images (300x200px)
- `admin-panel/src/components/` - React components

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

- Backend runs on default Fastify port with CORS enabled for frontend
- Frontend development server runs on port 5173 (Vite default)
- Images are processed with Sharp library for thumbnails
- Database operations use sqlite3 with prepared statements
- Concurrent development mode runs both servers simultaneously