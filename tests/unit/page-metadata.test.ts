/** @jest-environment node */
import type { Metadata } from "next";

describe("home page generateMetadata", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  async function load(): Promise<() => Promise<Metadata>> {
    let fn!: () => Promise<Metadata>;
    await jest.isolateModulesAsync(async () => {
      fn = (await import("@/app/page")).generateMetadata;
    });
    return fn;
  }

  it("includes today's og image when site origin is known", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://oldmanhoops.example.com";
    const gen = await load();
    const md = await gen();
    const images = md.openGraph?.images;
    expect(Array.isArray(images)).toBe(true);
    const first = Array.isArray(images) ? images[0] : images;
    const url = typeof first === "object" && first && "url" in first ? first.url : first;
    expect(String(url)).toMatch(/^https:\/\/oldmanhoops\.example\.com\/og\/\d{4}-\d{2}-\d{2}$/);
    expect((md.twitter as { card?: string } | null | undefined)?.card).toBe("summary_large_image");
  });

  it("omits og image when site origin cannot be resolved", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    const gen = await load();
    const md = await gen();
    expect(md.openGraph?.images).toBeUndefined();
  });
});
