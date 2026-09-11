import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['openship-dev.staffx.dev'],
  // add your actual dev-server origins/IPs here, e.g.:
  // allowedDevOrigins: ['192.168.1.50', 'myhost.local'],
}

export default nextConfig
