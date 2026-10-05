import { admin, createUser } from './seed.ts';

// Apps with the data mode shared-account belong to an admin account, and `mininode dev` refuses
// to register them without one. The web servers start before any test creates users, so the
// config runs this first. It does nothing when an admin exists.
const { data, error } = await admin
  .schema('platform')
  .from('profiles')
  .select('user_id')
  .eq('role', 'admin')
  .limit(1);
if (error) throw error;
if (!data?.length) await createUser('e2e-owner@example.com', 'admin', 'E2E owner');
