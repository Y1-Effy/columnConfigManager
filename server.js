import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import compression from 'compression';
import dotenv from 'dotenv';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { RATE_LIMIT } from './src/constants.js';
import connectDB from './src/db.js';
import { nestedRouter as categoriesNested, router as categoriesRouter } from './src/routes/categories.js';
import { nestedRouter as columnsNested, router as columnsRouter } from './src/routes/columns.js';
import cssClassesRouter from './src/routes/cssClasses.js';
import exportRouter from './src/routes/export.js';
import formatsRouter from './src/routes/formats.js';
import operationLogsRouter from './src/routes/operationLogs.js';
import projectsRouter from './src/routes/projects.js';
import saveRouter from './src/routes/save.js';
import snapshotsRouter from './src/routes/snapshots.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      scriptSrc: ['\'self\''],
      styleSrc: ['\'self\'', '\'unsafe-inline\''],
      imgSrc: ['\'self\'', 'data:'],
      connectSrc: ['\'self\''],
      fontSrc: ['\'self\''],
      objectSrc: ['\'none\''],
      frameAncestors: ['\'none\''],
    },
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use(mongoSanitize());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', rateLimit({ windowMs: RATE_LIMIT.WINDOW_MS, limit: RATE_LIMIT.MAX }));

// プロジェクト配下のネストルートを projectsRouter にマウントする
// （mergeParams: true により :id が各ネストルートで参照可能になる）
projectsRouter.use('/:id/categories', categoriesNested);
projectsRouter.use('/:id/columns', columnsNested);
projectsRouter.use('/:id/export', exportRouter);
projectsRouter.use('/:id/operation-logs', operationLogsRouter);
projectsRouter.use('/:id/save', saveRouter);
projectsRouter.use('/:id/snapshots', snapshotsRouter);

app.use('/api/projects', projectsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/columns', columnsRouter);
app.use('/api/css-classes', cssClassesRouter);
app.use('/api/formats', formatsRouter);

app.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok' }, error: null });
});

// グローバルエラーハンドラ
// ValidationError / CastError はMongoose起因の入力エラーとして400を返す
// それ以外は予期しないサーバーエラーとして500を返す
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ data: null, error: 'リクエストボディのJSON形式が不正です' });
  }
  if (err.name === 'ValidationError') {
    const msg = Object.values(err.errors).map((e) => e.message).join('、');
    return res.status(400).json({ data: null, error: msg });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ data: null, error: 'IDの形式が正しくありません' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ data: null, error: '同じ値がすでに存在します' });
  }
  return res.status(500).json({ data: null, error: '予期しないエラーが発生しました' });
});

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err.message);
      process.exit(1);
    });
}

export default app;
