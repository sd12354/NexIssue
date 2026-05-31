/** @type {import('next').NextConfig} */

function supabaseImagePatterns() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  try {
    const { hostname } = new URL(url);
    return [
      {
        protocol: "https",
        hostname,
        pathname: "/storage/v1/object/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig = {
  transpilePackages: ["@app/api"],
  images: {
    remotePatterns: supabaseImagePatterns(),
  },
};

export default nextConfig;
