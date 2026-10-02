// Entry for the standalone bundle: exposes the SDK as `window.mininode` for script-tag apps.
export { AiError } from './ai.ts';
export { ExternalApiError } from './api.ts';
export { GoogleError } from './google.ts';
export {
  createMininode,
  installLocalStorageSync,
  installMiniNodeCompat,
  mininode,
} from './index.ts';
