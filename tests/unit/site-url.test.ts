/** @jest-environment node */
describe("getSiteOrigin", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  function load(): () => string | null {
    let fn!: () => string | null;
    jest.isolateModules(() => {
      fn = require("@/lib/site-url").getSiteOrigin;
    });
    return fn;
  }

  it("returns NEXT_PUBLIC_SITE_URL when set, stripping trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://oldmanhoops.example.com/";
    expect(load()()).toBe("https://oldmanhoops.example.com");
  });

  it("returns https://VERCEL_URL when NEXT_PUBLIC_SITE_URL is absent", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "oldmanhoops-git-main.vercel.app";
    expect(load()()).toBe("https://oldmanhoops-git-main.vercel.app");
  });

  it("returns null when neither env var is set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    expect(load()()).toBeNull();
  });

  it("prefers NEXT_PUBLIC_SITE_URL over VERCEL_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://oldmanhoops.example.com";
    process.env.VERCEL_URL = "should-be-ignored.vercel.app";
    expect(load()()).toBe("https://oldmanhoops.example.com");
  });
});
