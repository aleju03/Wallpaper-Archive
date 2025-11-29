<div align="center">
  <img src="https://github.com/user-attachments/assets/6596c24d-4919-477b-bfd2-327c5e2ebd56" width="100%">
  <img src="https://github.com/user-attachments/assets/34116e2b-65b5-468e-b265-33abc072bfbd" width="100%">
  <br/><br/>

  <table>
    <tr>
      <td width="50%"><img src="https://github.com/user-attachments/assets/160973f2-1f10-4491-9700-408548589906" width="100%"></td>
      <td width="50%"><img src="https://github.com/user-attachments/assets/247b3d6d-cf21-4974-acc2-5bc15a38e115" width="100%"></td>
    </tr>
  </table>
</div>

Wallpaper gallery app I built to get a faster way to view and download some wallpapers for myself. Now hosted on Vercel for others to use.

Got the wallpapers by scraping various GitHub wallpaper repositories (and my local osu backgrounds).

## Features

In the admin panel you can manage the collection, view statistics, and resolve duplicates. The user frontend is a simple gallery for browsing and downloading. I also added an Arena Mode where wallpapers fight 1v1 and get ranked by Elo.

The backend handles the heavy lifting like thumbnail generation, duplicate detection via hashing, and metadata extraction.

## Architecture

Local build runs three things: a Node/Fastify backend deployed on Vercel, and two React/Vite frontends (Admin and User). Uses Turso for the database and Cloudflare R2 for image storage.

## Branches

- `main` - Production version deployed to Vercel (Turso + Cloudflare R2)
- `local-version` - Self-hosted variant (local SQLite + local file storage)

## Local Development

Install dependencies with `npm install` and start everything with `npm run dev`.
