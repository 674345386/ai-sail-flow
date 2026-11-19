import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Express, Request } from 'express';
import type { ZodType } from 'zod';

export function registerLocalDefaultsRoutes(app: Express, endpoint: string, defaultsPath: string, schema: ZodType, canSave: (req: Request) => boolean) {
  app.get(endpoint, (req, res) => {
    if (!canSave(req)) return res.sendStatus(403);
    return res.sendFile(defaultsPath);
  });
  app.put(endpoint, (req, res) => {
    if (!canSave(req)) return res.sendStatus(403);
    const input = schema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: '默认配置无效，请检查后重试。' });
    const temporary = `${defaultsPath}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(input.data, null, 2)}\n`, { flag: 'wx' });
      fs.renameSync(temporary, defaultsPath);
      return res.sendStatus(204);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  });
}
