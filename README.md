<div align="center">
  <img src="https://github.com/user-attachments/assets/69bb5f6d-51c9-4d13-b753-4606f9d8cf11" width="100%">
  <br/><br/>
  
  <table>
    <tr>
      <td width="65%"><img src="https://github.com/user-attachments/assets/38babe57-b6ae-4d9e-bf2e-5b48e51b32c8" width="100%"></td>
      <td width="35%"><img src="https://github.com/user-attachments/assets/7f1d2c41-62b1-4671-83ef-73a9e394dc39" width="100%"></td>
    </tr>
  </table>
</div>

Wallpaper gallery I built by scraping various GitHub wallpaper repositories (and the local osu backgrounds if wanted) to get a faster way to view and download some wallpapers for myself. Includes a backend for data handling, an admin panel for curation, and a frontend for browsing. Now hosted on Vercel for others to use.

## Features

In the admin panel you can manage the collection, view statistics, and resolve duplicates. The user frontend is a simple gallery for browsing and downloading. I also added an Arena Mode where wallpapers fight 1v1 and get ranked by Elo.

The backend handles the heavy lifting like thumbnail generation, duplicate detection via hashing, and metadata extraction.

## Architecture

The system runs three things: a Node/Fastify backend deployed on Vercel, and two React/Vite frontends (Admin and User). Uses Turso for the database and Cloudflare R2 for image storage.

## Branches

- `main` - Production version deployed to Vercel (Turso + Cloudflare R2)
- `local-version` - Self-hosted variant (local SQLite + local file storage)

## Local Development

Install dependencies with `npm install` and start everything with `npm run dev`.
