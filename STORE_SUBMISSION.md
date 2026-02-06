# Chrome Web Store Submission Guide

## 1. Pre-check

- Ensure extension loads in `chrome://extensions` without errors.
- Ensure `manifest.json` has correct `name`, `version`, `description`, `icons`.
- Confirm options page works (`Details` -> `Extension options`).

## 2. Build zip

From project root, create upload archive:

```bash
zip -r edvibe-sonaveeb-link.zip manifest.json src assets README.md PRIVACY_POLICY.md
```

## 3. Web Store listing data

Use these as draft values:

- Name: `Edvibe Sonaveeb Link`
- Summary: `Quick Sonaveeb link and 3 Estonian word forms for Edvibe word training.`
- Category: `Productivity` or `Education`
- Language: `Russian` + `English` (optional)

## 4. Required assets

- App icon: use `assets/icons/icon128.png`
- At least 1 screenshot (recommended 1280x800 or similar)
  - Show card + dictionary button + forms line.

## 5. Privacy

- Provide privacy policy URL in store listing.
- You can host `PRIVACY_POLICY.md` on GitHub and use raw/page URL.

## 6. Permissions explanation (store form)

- `storage`: saves user settings locally (block position and autoplay toggle).
- Host access `api.sonapi.ee`: fetches word forms for current word.

## 7. Publish flow

1. Create Chrome Web Store developer account.
2. Click `Add new item`.
3. Upload `edvibe-sonaveeb-link.zip`.
4. Fill listing details and policy URL.
5. Submit for review.

## 8. After release

- Bump `version` in `manifest.json` for each update.
- Rebuild zip and upload a new package.
