# Wallpaper Archive Project

## Project Overview

**Wallpaper Archive** is a comprehensive, self-hosted wallpaper management system. It features a Node.js backend for managing metadata and files, an Admin Panel for curation and maintenance, and a User Frontend for browsing and downloading wallpapers.

The system includes advanced features like automated thumbnail generation, duplicate detection using perceptual hashing, and an "Arena" mode for Elo-based wallpaper ranking.

## Architecture

The project consists of three main components running concurrently:

### 1. Backend (Node.js)
*   **Path:** Root directory
*   **Port:** 3000
*   **Framework:** Fastify
*   **Database:** SQLite (`wallpapers.db`) managed via `database.js`.
*   **Key Responsibilities:**
    *   REST API for both frontends.
    *   Serving static images (`/downloads`) and thumbnails (`/thumbnails`).
    *   Background tasks: Downloading (`downloader.js`), Thumbnailing (`generate-thumbnails.js`), Duplicate detection (`image-hash.js`).
    *   Arena logic: Elo calculation and leaderboard management.

### 2. Admin Panel (Frontend)
*   **Path:** `admin-panel/`
*   **Port:** 5173
*   **Tech Stack:** React + Vite
*   **Purpose:** For administrators to manage the collection.
*   **Key Features:**
    *   Dashboard statistics.
    *   Duplicate management (view and resolve detected duplicates).
    *   Gallery view with administration tools.

### 3. User Frontend (Frontend)
*   **Path:** `user-frontend/`
*   **Port:** 5174
*   **Tech Stack:** React + Vite
*   **Purpose:** For end-users to discover wallpapers.
*   **Key Features:**
    *   **Browse:** Grid view of wallpapers with filtering.
    *   **Arena:** A "Hot or Not" style battle mode where users vote on wallpaper pairs.
    *   **Leaderboard:** Top-rated wallpapers based on Arena votes.
    *   **Wallpaper Modal:** Detailed view with download options.

## Key Files & Directories

*   **`server.js`**: Main backend entry point. Defines API routes and server configuration.
*   **`database.js`**: SQLite wrapper class. Handles all database interactions including the Arena Elo system.
*   **`downloader.js`**: Script to fetch wallpapers from configured providers (e.g., GitHub repositories).
*   **`image-hash.js`**: Implements perceptual hashing algorithms for finding duplicate images.
*   **`wallpapers.db`**: SQLite database file (ensure this is not committed if it contains large local data, though schema structure is relevant).
*   **`admin-panel/src/App.jsx`**: Main entry point for the Admin UI.
*   **`user-frontend/src/App.jsx`**: Main entry point for the User UI.

## Development & Usage

### Starting the Project
To start the full development environment (Backend + Admin + User):
```bash
npm run dev
```
*   Backend: http://localhost:3000
*   Admin: http://localhost:5173
*   User: http://localhost:5174

### Other Key Commands
*   **`npm run download`**: Runs the downloader script to fetch new wallpapers.
*   **`npm run update-dimensions`**: Scans files and updates width/height metadata in the database.
*   **`npm run dev:backend`**: Starts only the backend.
*   **`npm run dev:admin`**: Starts only the admin panel.
*   **`npm run dev:user`**: Starts only the user frontend.

## Coding Conventions

*   **Styling:** Dark, minimalist aesthetic using SF Mono font. CSS files (`App.css`, `index.css`) are used for styling.
*   **Frontend Structure:** React functional components with Hooks (`useState`, `useEffect`).
*   **Icons:** `lucide-react` is the standard icon library.
*   **API Communication:** `axios` is used in frontends to communicate with the Fastify backend.
*   **Database:** Raw SQL queries (via `sqlite3`) are encapsulated within `database.js` methods.

## Arena Mode Details
The "Arena" is a unique feature where wallpapers compete.
*   **Battle:** Two random wallpapers are presented.
*   **Vote:** User selects a winner.
*   **Ranking:** An Elo rating system updates the score of both wallpapers.
*   **Leaderboard:** Displays wallpapers sorted by their Elo rating.
