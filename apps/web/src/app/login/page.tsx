"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginRequestSchema, type LoginRequest } from "@cargolens/shared";
import { ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser, useLogin } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";

const DEMO_ACCOUNTS = [
  { label: "Documentation Executive", email: "executive@cargolens.demo", password: "Executive123!" },
  { label: "Documentation Manager", email: "manager@cargolens.demo", password: "Manager123!" },
];

export default function LoginPage() {
  const router = useRouter();
  const { data: me } = useCurrentUser();
  const login = useLogin();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) });

  useEffect(() => {
    if (me?.user) router.replace("/dashboard");
  }, [me, router]);

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => router.replace("/dashboard"),
      onError: (err) => {
        const message = err instanceof ApiError ? err.message : "Unable to sign in";
        toast.error(message);
      },
    });
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2 text-white">
          <ScanSearch className="size-6" strokeWidth={1.75} />
          <span className="text-lg font-semibold tracking-tight">CargoLens AI</span>
        </div>

        <div className="rounded-lg border border-white/10 bg-white p-6 shadow-xl">
          <h1 className="text-base font-semibold text-foreground">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Import documentation intelligence for your brokerage desk.</p>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@cargolens.demo" {...register("email")} />
              {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
              {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="mt-2 w-full" disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/60">Demo accounts</p>
          <div className="flex flex-col gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setValue("email", account.email);
                  setValue("password", account.password);
                }}
                className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/10"
              >
                <span>{account.label}</span>
                <span className="text-xs text-white/40">{account.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
