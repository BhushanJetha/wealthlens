/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['lh3.googleusercontent.com', 'avatars.githubusercontent.com'],
  },
  experimental: {
    serverComponentsExternalPackages: ['unpdf', 'pdfjs-dist'],
  },
  // `npm run dev` only: keep pages compiled for an hour (default: 5 pages for
  // 60 s), so moving around the menu doesn't recompile each page every time
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 100,
  },
}
module.exports = nextConfig
