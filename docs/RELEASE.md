# Releases

## Upload source to GitHub

```sh
node scripts/setup.mjs
npm run check
npm run package:source
```

Use the contents of `release-source/Guard-Lab-source.zip`. It contains one `guard-lab` directory, normalized ZIP metadata, and `SOURCE-MANIFEST.json` with SHA-256 hashes. `Guard-Lab-source.sha256` verifies the archive. The exporter selects only maintained source/docs/artwork/tests/workflows; it never recurses into the whole workspace, dependencies, logs, recordings, old history or app data. PNG and JPEG metadata are checked as part of the audit.

Create a new GitHub repository and upload these contents as its root, so `README.md`, `AGENTS.md` and `package.json` are at the root. Alternatively initialize a **fresh** Git repository in an audited clean source checkout. No original `.git` is distributed. Git commits/GitHub accounts create their own author identity; configure publication identity deliberately before committing if anonymity matters. The source package itself has no originating user's author, host or account metadata.

Do not upload `node_modules`, `dist`, native build directories, `.voice-runtime`, app data or an older development workspace. `.gitignore` is defense in depth; it is not a sanitizer for files already tracked. Add your repository URL to README later if desired; no personal URL is supplied in this package.

## Native packages

```sh
npm run dist
```

Build on the destination OS: Windows → portable `.exe`; macOS → app ZIP; Linux → AppImage. Output is under ignored `release`. Architecture follows the build machine by default. Electron-builder accepts `--x64`/`--arm64` for supported targets. Actual OS/display/architecture testing is still required for release claims; source tests do not prove GUI support on every machine.

The default build includes app code/artwork and upstream notices, with no user profiles, recordings or voice caches. It omits downloaded voices; first launch installs missing voices automatically in writable app data rather than inside the installation or packaged resources. Set `GUARD_LAB_BUNDLE_VOICES=1` only for a deliberately licensed voice bundle; consult THIRD_PARTY.md. Packaged apps can also use external assets through `GUARD_LAB_VOICES`.

The `.github/workflows/ci.yml` workflow runs tests, generated-doc checks, privacy audit and renderer build on Windows, macOS and Linux. The manual `desktop-build.yml` workflow builds each native target and uploads artifacts to that workflow run. It does not publish releases automatically and requires no signing credentials. Native packages are unsigned by default; distributing a trusted macOS/Windows release may require appropriate signing/notarization through your own publication setup. Do not embed personal signing material in the source.

## Brand assets

- `docs/cover.png`: README cover.
- `docs/social-preview.jpg`: compact GitHub social card; upload through repository settings if desired.
- `public/icon.png`: app/repository icon, used by desktop packaging and the renderer favicon.
- [BRAND.md](BRAND.md): asset provenance, identity rules and ImageGen prompt set.

No existing GitHub repository has been modified by these scripts. Publishing remains a separate user-directed action.
