# SeekEatz Landing Static Bundle

This folder is a standalone S3-ready version of the landing page.

## Main files

- `index.html`
- `styles.css`
- `main.js`
- `hero-phone.mp4`
- `hero-poster.jpg`

## Before upload

Update `appBaseUrl` in `main.js` so the landing page buttons point to your real app domain.

Example:

```js
var config = {
  appBaseUrl: "https://seekeatz.com",
};
```

## Swapping the phone media

If you changed the UI and want a new hero video:

1. Replace `hero-phone.mp4` with the new file using the same filename.
2. Replace `hero-poster.jpg` with a matching poster image.

You can also change the filenames in `main.js`:

```js
var config = {
  heroVideoSrc: "my-new-video.mp4",
  heroPosterSrc: "my-new-poster.jpg",
};
```

If the video fails to load, the page will automatically fall back to the poster image.

## Upload to S3

From the repo root:

```powershell
aws s3 sync .\landing-static\ s3://YOUR_BUCKET_NAME\ --delete
```
