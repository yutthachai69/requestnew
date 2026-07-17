// PM2 config — รัน Next.js production server (deploy บนเครื่อง Windows เป็น server)
// ใช้:  npx pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'requestonline',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,
      interpreter: 'node',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0', // bind ทุก interface ให้เครื่องอื่นใน LAN เข้าได้
      },
    },
  ],
};
