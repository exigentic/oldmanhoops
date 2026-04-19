import { SignupForm } from "./SignupForm";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 p-6">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-amber-400">Join OldManHoops</h1>
        <p className="text-sm text-neutral-400 text-center">
          Enter the group&apos;s access code to request a sign-in link.
        </p>
        <SignupForm initialCode={code ?? ""} />
      </div>
    </main>
  );
}
