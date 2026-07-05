import "@testing-library/jest-dom";

// jsdom doesn't implement the native <dialog> imperative API (showModal/close),
// so components that drive a dialog via a ref can't be exercised without this.
// Force-assign (jsdom ships stubs that throw "Not implemented") to a minimal
// version that just toggles the `open` attribute — enough for assertions.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}
