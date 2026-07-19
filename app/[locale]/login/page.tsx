import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Sign In" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <AuthForm mode="login" />
    </div>
  );
}