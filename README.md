# Singify (personal)

Static app (`public/`) + chhota Node server (`server.js`, koi npm package nahi).

- `api/music.js` -> `/api/music?p=/api/search/songs&query=...` ko `https://jio.shnwaz.dev` par proxy karta hai (cache + retry)
- `api/dl.js`    -> Download button ke liye audio proxy (sirf JioSaavn CDN hosts)
- `public/`      -> index.html, songs.js (tumhara), baaki helper files

## Railway par deploy
1. Is folder ko GitHub repo me push karo.
2. railway.com -> New Project -> Deploy from GitHub repo.
3. Deploy ke baad Settings -> Networking -> Generate Domain.
4. (Optional) Variables: `MUSIC_API_URL` (default https://jio.shnwaz.dev), `MUSIC_API_FALLBACKS` (comma separated backup API urls).
5. Firebase Console -> Authentication -> Settings -> Authorized domains me apna Railway domain add karo, warna Google login nahi chalega.

## Local run
`node server.js` -> http://localhost:3000

## Test
`curl "http://localhost:3000/api/music?p=/api/search/songs&query=kesariya&limit=5"`
