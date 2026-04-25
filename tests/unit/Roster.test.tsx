import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Roster } from "@/app/_components/Roster";
import type { RosterEntry } from "@/lib/scoreboard";

describe("Roster", () => {
  const entries: RosterEntry[] = [
    { playerId: "p-alice", name: "Alice", status: "in", guests: 1, note: "15 min late" },
    { playerId: "p-bob", name: "Bob", status: "in", guests: 0, note: null },
    { playerId: "p-cat", name: "Cat", status: "maybe", guests: 0, note: null },
    { playerId: "p-dave", name: "Dave", status: "out", guests: 0, note: null },
  ];

  it("groups entries by status", () => {
    render(<Roster entries={entries} />);
    expect(screen.getByRole("heading", { name: /^in/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^maybe/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^out/i })).toBeInTheDocument();
  });

  it("shows guest count next to the name when > 0", () => {
    render(<Roster entries={entries} />);
    expect(screen.getByText(/alice/i)).toHaveTextContent("+1");
  });

  it("shows the note", () => {
    render(<Roster entries={entries} />);
    expect(screen.getByText(/15 min late/i)).toBeInTheDocument();
  });

  it("renders nothing when entries are empty", () => {
    render(<Roster entries={[]} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});

describe("Roster (admin mode)", () => {
  const adminId = "p-admin";
  const entries: RosterEntry[] = [
    { playerId: "p-alice", name: "Alice", status: "in", guests: 0, note: null },
    { playerId: adminId, name: "Admin Self", status: "in", guests: 0, note: null },
    { playerId: "p-bob", name: "Bob", status: "maybe", guests: 0, note: null },
  ];

  it("renders three buttons per row except for the admin's own row", () => {
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus: jest.fn() }}
      />
    );
    expect(screen.getAllByRole("button", { name: /set Alice/i })).toHaveLength(3);
    expect(screen.queryAllByRole("button", { name: /set Admin Self/i })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: /set Bob/i })).toHaveLength(3);
  });

  it("calls onSetStatus with the player's id and selected status when a button is clicked", async () => {
    const onSetStatus = jest.fn().mockResolvedValue(undefined);
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus }}
      />
    );
    const user = userEvent.setup();
    const outBtn = screen.getByRole("button", { name: /set Bob to out/i });
    await user.click(outBtn);
    expect(onSetStatus).toHaveBeenCalledWith("p-bob", "out");
  });

  it("disables the row's buttons while the request is in flight", async () => {
    let resolveFn: (() => void) | undefined;
    const onSetStatus = jest.fn(
      () => new Promise<void>((resolve) => { resolveFn = resolve; })
    );
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus }}
      />
    );
    const user = userEvent.setup();
    const outBtn = screen.getByRole("button", { name: /set Bob to out/i });
    await user.click(outBtn);
    expect(outBtn).toBeDisabled();
    resolveFn?.();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /set Bob to out/i })).not.toBeDisabled();
    });
  });

  it("shows an error message under the row when onSetStatus rejects", async () => {
    const onSetStatus = jest.fn().mockRejectedValue(new Error("boom"));
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus }}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /set Bob to out/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/failed/i);
    expect(screen.getByRole("button", { name: /set Bob to out/i })).not.toBeDisabled();
  });

  it("renders a 'Not yet responded' section when nonResponders are passed", () => {
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus: jest.fn() }}
        nonResponders={[{ playerId: "p-cat", name: "Cat" }]}
      />
    );
    expect(screen.getByRole("heading", { name: /not yet responded/i })).toBeInTheDocument();
    expect(screen.getByText("Cat")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /set Cat/i })).toHaveLength(3);
  });

  it("does not render a non-responders section when the prop is empty or undefined", () => {
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus: jest.fn() }}
        nonResponders={[]}
      />
    );
    expect(screen.queryByRole("heading", { name: /not yet responded/i })).not.toBeInTheDocument();
  });

  it("renders no admin buttons when no admin prop is passed", () => {
    render(<Roster entries={entries} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
