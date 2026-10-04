// Written by `mininode integrate`: login first, then the compatibility layers, then the app.
import { installLocalStorageSync, installMiniNodeCompat, mininode } from '@mininode/sdk';

const mn = await mininode();
await mn.auth.requireLogin();
await installMiniNodeCompat(mn);
await installLocalStorageSync(mn);
