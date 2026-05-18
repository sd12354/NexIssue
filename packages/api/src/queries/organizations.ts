import type { Tables } from "types";
import type { NexIssueSupabaseClient } from "../client";

export type Organization = Tables<"organizations">;
export type OrgMember = Tables<"org_members">;
export type UserProfile = Tables<"users">;

export type OrgMemberWithUser = OrgMember & {
  user: Pick<UserProfile, "id" | "email"> | null;
};

export type CurrentOrgResult = {
  membership: OrgMember;
  organization: Organization;
};

export async function getCurrentOrg(
  client: NexIssueSupabaseClient,
  userId: string,
): Promise<CurrentOrgResult | null> {
  const { data, error } = await client
    .from("org_members")
    .select("*, organizations(*)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { organizations, ...membership } = data;
  if (!organizations) return null;

  return {
    membership,
    organization: organizations,
  };
}

export async function listMembers(
  client: NexIssueSupabaseClient,
  orgId: string,
): Promise<OrgMemberWithUser[]> {
  const { data: members, error: membersError } = await client
    .from("org_members")
    .select("*")
    .eq("org_id", orgId)
    .order("joined_at", { ascending: true });

  if (membersError) throw membersError;
  if (members.length === 0) return [];

  const userIds = members.map((member) => member.user_id);
  const { data: users, error: usersError } = await client
    .from("users")
    .select("id, email")
    .in("id", userIds);

  if (usersError) throw usersError;

  const usersById = new Map(users.map((user) => [user.id, user]));

  return members.map((member) => ({
    ...member,
    user: usersById.get(member.user_id) ?? null,
  }));
}
