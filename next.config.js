/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Exclude Android/TWA directories from Next.js build traces
  outputFileTracingExcludes: {
    '*': [
      '.gradle/**',
      'apk-extract/**',
      'scripts/**',
      'android.keystore',
      'app-release-*.apk',
      'app-release-*.aab',
      'app-release-*.zip',
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    // Ignore server-only modules in client bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@react-native-async-storage/async-storage': false,
        'pino-pretty': false,
        fs: false,
        net: false,
        tls: false,
      }
    }

    // Ignore pino-pretty module (used by Anchor but not needed in browser)
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^pino-pretty$/,
      })
    )

    return config
  },
  async headers() {
    return [
      {
        source: '/.well-known/assetlinks.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
