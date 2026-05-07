/** @jest-environment node */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCurrentUserAdmin } from "@/lib/auth/admin";

type PlayerRow = { is_admin: boolean } | null;
type QueryResult = { data: PlayerRow; error: unknown };

function makeClient(
  user: { id: string } | null,
  queryResult: QueryResult = { data: null, error: null },
): { client: SupabaseClient; getUserCalls: () => number } {
  let getUserCalls = 0;
  const singleResult = async (): Promise<QueryResult> => queryResult;
  const eqChain = { single: singleResult };
  const selectChain = { eq: () => eqChain };
  const fromChain = { select: () => selectChain };
  const fake = {
    auth: {
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user }, error: null };
      },
    },
    from: () => fromChain,
  };
  return { client: fake as unknown as SupabaseClient, getUserCalls: () => getUserCalls };
}

describe("isCurrentUserAdmin", () => {
  it("returns false when no user is logged in", async () => {
    const { client } = makeClient(null);
    await expect(isCurrentUserAdmin(client)).resolves.toBe(false);
  });

  it("returns false when the user's player row has is_admin = false", async () => {
    const { client } = makeClient(
      { id: "user-1" },
      { data: { is_admin: false }, error: null },
    );
    await expect(isCurrentUserAdmin(client)).resolves.toBe(false);
  });

  it("returns true when the user's player row has is_admin = true", async () => {
    const { client } = makeClient(
      { id: "user-1" },
      { data: { is_admin: true }, error: null },
    );
    await expect(isCurrentUserAdmin(client)).resolves.toBe(true);
  });

  it("returns false when the player row is missing (data = null)", async () => {
    const { client } = makeClient(
      { id: "user-1" },
      { data: null, error: null },
    );
    await expect(isCurrentUserAdmin(client)).resolves.toBe(false);
  });

  it("returns false when the query returns an error", async () => {
    const { client } = makeClient(
      { id: "user-1" },
      { data: null, error: new Error("boom") },
    );
    await expect(isCurrentUserAdmin(client)).resolves.toBe(false);
  });

  it("skips auth.getUser when a user is passed in", async () => {
    const { client, getUserCalls } = makeClient(
      null,
      { data: { is_admin: true }, error: null },
    );
    await expect(isCurrentUserAdmin(client, { id: "user-1" })).resolves.toBe(true);
    expect(getUserCalls()).toBe(0);
  });

  it("returns false without a DB call when a null user is passed in", async () => {
    const { client, getUserCalls } = makeClient(
      { id: "should-not-be-used" },
      { data: { is_admin: true }, error: null },
    );
    await expect(isCurrentUserAdmin(client, null)).resolves.toBe(false);
    expect(getUserCalls()).toBe(0);
  });
});
