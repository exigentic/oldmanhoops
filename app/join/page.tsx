import Link from "next/link";
import Image from "next/image";
import { env } from "@/lib/env";
import { SignupForm } from "./SignupForm";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const signupCodeRequired = env.SIGNUP_CODE_REQUIRED;
  const description = signupCodeRequired
    ? "Enter the group's access code to request a sign-in link."
    : "Request a sign-in link.";
  return (
    <main className="min-h-screen flex flex-col items-center bg-stone-300 text-neutral-900 p-6 pt-8 gap-6">
      <header className="flex items-center gap-4">
        <Image src="/omh.svg" alt="" width={56} height={56} />
        <div className="flex flex-col leading-tight">
          <h1 className="text-2xl font-bold text-indigo-700">Join Old Man Hoops</h1>
          <Link href="/" className="text-sm text-neutral-600 hover:underline">
            ← Back to scoreboard
          </Link>
        </div>
      </header>

      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <p className="text-sm text-neutral-600 text-center">{description}</p>
        <SignupForm
          initialCode={code ?? ""}
          signupCodeRequired={signupCodeRequired}
        />
      </div>
    </main>
  );
}
