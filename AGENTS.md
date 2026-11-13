# Catalog curation

- Read [README.md](README.md) before changing the catalog. Edit video URLs and mode assignments only in `videos.json`, grouped by the creator's YouTube handle.
- Use the creator's title, description and playlist context to assign `morning`, `day`, or both. Include stretching as well as mobility and general exercise. Morning sessions belong to `morning`; work or desk breaks belong to `day`; general routines suitable for either can use both.
- Prefer follow-along videos with a complete published runtime of at most 10 minutes, including intro and outro. This is editorial guidance. Longer videos can be included when requested; keep them as ordinary entries without ID-specific exceptions or application duration caps.
- Preserve original titles, creator names and runtimes returned by yt-dlp. Do not estimate runtime from a title or manually invent missing metadata. Fetch missing records with `npm run sync:videos`; use `npm run sync:videos -- --refresh` only for an intentional full refresh.
- Keep `video-metadata.json` in Git. After changing the list, synchronize metadata, run `npm run check:videos`, `npm test` and `npm run build`. Run `npm run test:e2e` after frontend, navigation, build-path or playback changes.
- Treat a playlist import as a one-time selection of explicit video URLs. Record the source, selection rule, counts and skipped entries in `docs/`. Metadata refresh must not silently add playlist uploads.
- Edit frontend source in `src/`. Publish generated `dist/`; preserve clean morning/day URLs and relative paths that work below a GitHub Pages repository prefix.
