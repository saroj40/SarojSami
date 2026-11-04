// Plain URL builders: no secrets, safe to import from client components.
// Grid tiles and the lightbox placeholder both use the same default width (480),
// so the lightbox can reuse the thumbnail the browser already cached.
//
// If thumbnails are slow or blank, try Google's image CDN instead:
//   `https://lh3.googleusercontent.com/d/${id}=w${width}`
// (unofficial pattern, Google may change it)

export const thumbUrl = (id, width = 480) => `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;

export const fullUrl = (id, width = 1600) => `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;

export const videoEmbedUrl = (id) => `https://drive.google.com/file/d/${id}/preview`;

export const downloadUrl = (id) => `https://drive.google.com/uc?export=download&id=${id}`;
