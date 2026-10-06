import type { SupabaseClient } from '@supabase/supabase-js';

// Teams (ADR 0023): a project or a group of friends inside one app. The people in a team see the
// team's rows (tables of an app with data mode `team`, `team_id` column) and files according to
// their role: viewers read, editors write, owners also manage the team. Everything goes through
// database functions; the person must be allowed to use the app, and the call has to come from
// the app's own page. Who can be added comes from `mn.people()`.

export type TeamRole = 'viewer' | 'editor' | 'owner';

export interface Team {
  id: string;
  name: string;
  /** The caller's role in it. */
  role: TeamRole;
  memberCount: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
}

export function createTeams(supabase: SupabaseClient, appSlug: string) {
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.schema('platform').rpc(fn, args);
    if (error) throw error;
    return data as T;
  };
  return {
    /** The teams the signed-in person is in (for this app). */
    async list(): Promise<Team[]> {
      const rows = await call<
        { id: string; name: string; role: TeamRole; member_count: number }[] | null
      >('team_list', { p_slug: appSlug });
      return (rows ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        memberCount: row.member_count,
      }));
    },
    /** Creates a team; the caller is its owner. Returns the team id. */
    create: (name: string) => call<string>('team_create', { p_slug: appSlug, p_name: name }),
    async members(teamId: string): Promise<TeamMember[]> {
      const rows = await call<{ user_id: string; display_name: string; role: TeamRole }[] | null>(
        'team_members_of',
        { p_team: teamId },
      );
      return (rows ?? []).map((row) => ({
        id: row.user_id,
        name: row.display_name,
        role: row.role,
      }));
    },
    /** Adds a person (from `mn.people()`) or changes their role. Owners only. */
    async setMember(teamId: string, userId: string, role: TeamRole): Promise<void> {
      await call('team_set_member', { p_team: teamId, p_user: userId, p_role: role });
    },
    /** Removes a person (owners), or leaves the team when `userId` is the caller. */
    async removeMember(teamId: string, userId: string): Promise<void> {
      await call('team_remove_member', { p_team: teamId, p_user: userId });
    },
    async rename(teamId: string, name: string): Promise<void> {
      await call('team_rename', { p_team: teamId, p_name: name });
    },
    /** Deletes the team and every row of it in the app's tables. Owners only. */
    async remove(teamId: string): Promise<void> {
      await call('team_delete', { p_team: teamId });
    },
    /** A bell notification (and push) for a member, e.g. "assigned to you". Editors and owners. */
    async notify(
      teamId: string,
      userId: string,
      title: string,
      body?: string,
      url?: string,
    ): Promise<void> {
      await call('team_notify', {
        p_team: teamId,
        p_user: userId,
        p_title: title,
        p_body: body ?? null,
        p_url: url ?? null,
      });
    },
  };
}
