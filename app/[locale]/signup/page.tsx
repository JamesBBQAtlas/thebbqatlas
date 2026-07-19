import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Sign Up" };

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <AuthForm mode="signup" />
    </div>
  );
}