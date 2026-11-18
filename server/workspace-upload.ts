import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { workspaceUploadDir } from './workspace-storage';

export function scopedMultipart(handler: RequestHandler): RequestHandler {
  return (req, res, next) => handler(req, res, AsyncLocalStorage.bind(next));
}

export function workspaceUploader(limits: NonNullable<multer.Options['limits']>) {
  const uploader = () => multer({ dest: workspaceUploadDir(), limits });
  return {
    single: (name: string) => scopedMultipart((req, res, next) => uploader().single(name)(req, res, next)),
    array: (name: string, count: number) => scopedMultipart((req, res, next) => uploader().array(name, count)(req, res, next)),
  };
}
