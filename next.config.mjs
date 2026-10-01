/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg'],
  // The build does not stop on lint warnings; type errors still fail it.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
