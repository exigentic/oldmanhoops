import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 p-6">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-amber-400">Sign in</h1>
        <p className="text-sm text-neutral-400 text-center">
          We&apos;ll email you a link to sign in.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
