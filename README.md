# Wallpaper Archive

<div align="center">
  <table>
    <tr>
      <td width="42%"><img src="https://github.com/user-attachments/assets/69bb5f6d-51c9-4d13-b753-4606f9d8cf11" width="100%"></td>
      <td width="16%"><img src="https://github.com/user-attachments/assets/7f1d2c41-62b1-4671-83ef-73a9e394dc39" width="100%"></td>
      <td width="42%"><img src="https://github.com/user-attachments/assets/38babe57-b6ae-4d9e-bf2e-5b48e51b32c8" width="100%"></td>
    </tr>
  </table>
</div>

Wallpaper gallery I built by scraping various GitHub wallpaper repositories (and the local osu backgrounds if wanted) to get a faster way to view and download some wallpapers for myself. Includes a backend for data handling, an admin panel for curation, and a frontend for browsing.

## Features

In the admin panel you can manage the collection, view statistics, and resolve duplicates. The user frontend is a simple gallery for browsing and downloading. I also added an Arena Mode where wallpapers fight 1v1 and get ranked by Elo.

The backend handles the heavy lifting like thumbnail generation, duplicate detection via hashing, and metadata extraction.

## Architecture

The system runs three things at once: a Node/Fastify backend on port 3000 with SQLite, and two React/Vite frontends (Admin on 5173, User on 5174).

## Usage

Install dependencies with `npm install` and start everything with `npm run dev`.