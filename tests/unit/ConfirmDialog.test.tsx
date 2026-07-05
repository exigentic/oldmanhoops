import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "@/app/_components/ConfirmDialog";

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const props = {
    open: true,
    title: "You're currently In. Switch to Out?",
    confirmLabel: "Switch to Out",
    cancelLabel: "Keep In",
    onConfirm,
    onCancel,
    ...overrides,
  };
  render(<ConfirmDialog {...props} />);
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renders the title and both button labels when open", () => {
    setup();
    expect(screen.getByText(/you're currently in\. switch to out\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /switch to out/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep in/i })).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: /switch to out/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: /keep in/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel when the backdrop (dialog element itself) is clicked", async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    // A click landing on the <dialog> element itself (not its inner content)
    // is a backdrop click and should cancel.
    await user.click(screen.getByRole("dialog"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not open the dialog when open is false", () => {
    setup({ open: false });
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open");
  });
});
