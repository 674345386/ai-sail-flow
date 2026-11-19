import file from '../shared/landing-playground-defaults.json';
import { playgroundSaveSchema } from '../shared/landing-playground';

const result = playgroundSaveSchema.partial().safeParse(file);
export const playgroundDefaults = result.success ? result.data : {};
