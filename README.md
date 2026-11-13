# Daily Movement

A static follow-along exercise picker with morning and daytime modes. Every visit picks a channel with equal probability, then picks a video from that channel with equal probability. Repeats are allowed. There are no accounts, workout logs, or saved history.

[Morning routines](https://zewelor.github.io/daily-movement/morning/) · [Daytime routines](https://zewelor.github.io/daily-movement/day/)

## Edit the catalog

Edit **`videos.json`**. It is the only editorial list, grouped by YouTube channel:

```json
{
  "@julia.reppel": [
    {
      "url": "https://www.youtube.com/watch?v=pOqgrQ8BuyU",
      "modes": ["morning", "day"]
    }
  ]
}
```

A video can belong to `morning`, `day`, or both. Titles, authors and durations come from YouTube; keep them out of this list. The one-time playlist import and its skipped entries are documented in [docs/playlist-import.md](docs/playlist-import.md).

## Synchronize metadata explicitly

Node.js and [yt-dlp](https://github.com/yt-dlp/yt-dlp) on `PATH` are needed for synchronization. No media is downloaded and no npm packages are required.

```sh
npm run sync:videos             # fetch only missing records
npm run sync:videos -- --refresh # explicitly refresh every configured video
npm run check:videos            # validate list and metadata offline
```

`video-metadata.json` is a generated snapshot, committed to Git so a fresh checkout can build offline. Ordinary synchronization reuses existing records; editing mode assignments does not fetch metadata. Removing a video from the list prunes its metadata at the next synchronization. A failed fetch or invalid record leaves the previous cache unchanged and exits with an error.

Video durations must be positive numbers. The application accepts longer routines as ordinary entries; editorial guidance for choosing new videos lives in [AGENTS.md](AGENTS.md).

## Build and preview offline

```sh
npm run build
python3 -m http.server 8000 --directory dist
```

Open <http://localhost:8000/morning/> or <http://localhost:8000/day/>. The root address also opens morning mode. Mode links use normal navigation, so bookmarks and browser Back/Forward work. Each visit chooses a new random routine.

`npm run build` validates the list and cached metadata, then generates the complete site in `dist/`, including a single `catalog.json`. It never fetches YouTube. Missing or invalid metadata fails the build before replacing the previous output. Edit source files in `src/`; `dist/` is generated and ignored by Git.

## Static hosting and GitHub Pages

Publish the **contents of `dist/`** as the static site. The build emits `index.html`, `morning/index.html`, `day/index.html`, shared assets and `.nojekyll`. It needs no backend or server-side routing.

For a GitHub Pages project site, the URLs are `https://OWNER.github.io/REPOSITORY/morning/` and `https://OWNER.github.io/REPOSITORY/day/`. Relative links and asset URLs preserve the repository prefix. These are actual directories, so direct visits do not depend on a custom 404 fallback.

### Automatic GitHub Pages deployment

The [GitHub Pages workflow](.github/workflows/pages.yml) validates the cached metadata, runs `npm test`, builds the site offline and publishes `dist/` after a successful push to `main`. Pull requests targeting `main` run the same checks and build without deploying. Documentation-only changes are skipped; changes to tests or workflow configuration also publish after verification.

To enable it:

1. Push this repository, including `.github/workflows/pages.yml`, to GitHub on `main`.
2. Open **Settings → Pages → Build and deployment** and select **GitHub Actions** as the source.
3. Run **Actions → GitHub Pages → Run workflow** on `main` for the first deployment, or push another application change. The completed deployment job shows the site URL.

After setup, application changes pushed to `main` publish automatically. The workflow uses the built-in `GITHUB_TOKEN`; no custom secrets, yt-dlp installation or metadata refresh are needed. It finishes an active deployment and keeps the latest pending run. Manual runs from other branches verify the build without publishing.

GitHub documents the required Pages setting in [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Playback starts muted when the browser permits autoplay. Sound uses YouTube's player controls. Browsers may require a click to start playback, and ads or buffering can add time.

## Checks

```sh
npm test
npm run test:e2e
```

Unit and CLI integration tests use Node's built-in test runner. End-to-end checks additionally need `agent-browser` and its Chrome installation; they build an isolated fixture, serve it under a repository prefix and exercise both mode URLs, channel filters, repeats, navigation, and failure paths. Browser results are written to the temporary directory printed by the check. External YouTube requests are blocked during that test; it verifies the application and player integration with a controlled API, not playback availability of every catalog item.

The original 18 videos retain their metadata and historical source notes in [docs/catalog-sources.json](docs/catalog-sources.json).
