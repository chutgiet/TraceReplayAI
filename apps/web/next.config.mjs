/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Transpile internal workspace packages
  transpilePackages: ['@tracereplay/ui'],

  // Proxy API requests to the query-service backend
  async rewrites() {
    const queryServiceUrl =
      process.env.QUERY_SERVICE_URL ?? 'http://localhost:3002';

    return [
      {
        source: '/api/v1/:path*',
        destination: `${queryServiceUrl}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
