/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // EMRID Operations follows the patient platform's deployment shape: all
    // mutations run through Server Actions. Behind a proxy / custom domain
    // (AWS Amplify Hosting), Next verifies the request Origin against the
    // forwarded Host, so the deployment hosts must be allow-listed or every
    // Server Action is rejected as cross-origin. Wired up now so future sprints
    // inherit it; the placeholders in Sprint 1 do not yet use Server Actions.
    serverActions: {
      allowedOrigins: ["ops.emrid.co.za", "*.amplifyapp.com"],
    },
  },
};

export default nextConfig;
