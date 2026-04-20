import Link from "next/link";
import Image from "next/image";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center bg-neutral-50 text-neutral-900 p-6 pt-8 gap-6">
      <header className="flex items-center gap-4">
        <Image src="/omh.svg" alt="" width={56} height={56} />
        <div className="flex flex-col leading-tight">
          <h1 className="text-2xl font-bold text-indigo-700">Sign in</h1>
          <Link href="/" className="text-sm text-neutral-500 hover:underline">
            ← Back to scoreboard
          </Link>
        </div>
      </header>

      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <p className="text-sm text-neutral-600 text-center">
          We&apos;ll email you a link to sign in.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
