import { render, screen } from "@testing-library/react";
import { ConfirmationBanner } from "@/app/_components/ConfirmationBanner";

describe("ConfirmationBanner", () => {
  it("renders 'You're In!' when url status matches actual", () => {
    render(<ConfirmationBanner urlStatus="in" actualStatus="in" />);
    expect(screen.getByText(/you're in/i)).toBeInTheDocument();
  });

  it("renders 'You're Out' for out", () => {
    render(<ConfirmationBanner urlStatus="out" actualStatus="out" />);
    expect(screen.getByText(/you're out/i)).toBeInTheDocument();
  });

  it("renders 'Maybe' for maybe", () => {
    render(<ConfirmationBanner urlStatus="maybe" actualStatus="maybe" />);
    expect(screen.getByText(/maybe/i)).toBeInTheDocument();
  });

  it("renders nothing when url status does not match actual", () => {
    const { container } = render(<ConfirmationBanner urlStatus="in" actualStatus="out" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when url status is absent", () => {
    const { container } = render(<ConfirmationBanner urlStatus={null} actualStatus="in" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when actual is null (user has no rsvp)", () => {
    const { container } = render(<ConfirmationBanner urlStatus="in" actualStatus={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
