const normalizeOrigin = (value = '') => String(value).trim().replace(/\/$/, '');

const envAllowedOrigins = [
  process.env.FRONTEND_URLS,
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGINS,
  process.env.CORS_ORIGIN
]
  .filter(Boolean)
  .flatMap((value) => String(value).split(','))
  .map((item) => normalizeOrigin(item))
  .filter(Boolean);

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://sida-cengkilung-frontend.vercel.app',
  ...envAllowedOrigins
].map(normalizeOrigin);

const allowedRegexOrigins = [
  /\.ngrok-free\.app$/,
  /\.vercel\.app$/
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const normalizedOrigin = normalizeOrigin(origin);
    const isAllowed =
      allowedOrigins.includes(normalizedOrigin) ||
      allowedRegexOrigins.some((pattern) => pattern.test(normalizedOrigin));

    if (isAllowed) return callback(null, true);

    console.log('Blocked by CORS:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-info']
};

module.exports = corsOptions;
