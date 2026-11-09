"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useState, type FormEvent } from "react"

import { authApi } from "@/api/account"
import { buttonVariants } from "@/components/ui/button-variants"
import { FormError, FormField, useSchemaForm } from "@/features/account/components/form-field"
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/features/account/schemas/auth"
import { useLogin, useRegister } from "@/hooks/api/account/queries"
import { useMutation } from "@tanstack/react-query"
import { cn } from "@/lib/utils"

const submit = cn(buttonVariants({ tone: "ink-light", size: "lg" }), "w-full 3xl:h-18")
const formClass = "flex flex-col gap-6 md:gap-8"

const values = (form: HTMLFormElement) => Object.fromEntries(new FormData(form)) as Record<string, string>

export function LoginForm({ next }: { next: string }) {
  const id = useId()
  const router = useRouter()
  const login = useLogin()
  const { errors, formError, validate, fail } = useSchemaForm(loginSchema)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = validate(event.currentTarget, values(event.currentTarget))
    if (!input) return
    login.mutate(input, {
      onSuccess: () => {
        router.replace(next)
        router.refresh()
      },
      onError: fail,
    })
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={login.isPending} className={formClass}>
      <FormField formId={id} name="email" type="email" label="Email" autoComplete="email" error={errors.email} />
      <FormField
        formId={id}
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        error={errors.password}
        hint={
          <Link href="/account/forgot-password" className="font-semibold text-foreground underline underline-offset-4">
            Forgot your password?
          </Link>
        }
      />
      <button type="submit" disabled={login.isPending} className={submit}>
        {login.isPending ? "Signing in…" : "Sign in"}
      </button>
      <FormError>{formError}</FormError>
      <p className="text-16 text-subtle-foreground md:text-18">
        New to Sole Drop?{" "}
        <Link href={`/account/register?next=${encodeURIComponent(next)}`} className="font-semibold text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  )
}

export function RegisterForm({ next }: { next: string }) {
  const id = useId()
  const router = useRouter()
  const register = useRegister()
  const { errors, formError, validate, fail } = useSchemaForm(registerSchema)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input = validate(form, { ...values(form), marketingOptIn: new FormData(form).get("marketingOptIn") === "on" })
    if (!input) return
    register.mutate(input, {
      onSuccess: () => {
        router.replace(next)
        router.refresh()
      },
      onError: fail,
    })
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={register.isPending} className={formClass}>
      <FormField formId={id} name="fullName" label="Full name" autoComplete="name" error={errors.fullName} />
      <FormField formId={id} name="email" type="email" label="Email" autoComplete="email" error={errors.email} />
      <FormField formId={id} name="password" type="password" label="Password" autoComplete="new-password" hint="At least 8 characters, with letters and a number." error={errors.password} />
      <label className="flex min-h-11 items-start gap-3 text-16 font-medium md:text-18">
        <input type="checkbox" name="marketingOptIn" className="mt-1 size-5 shrink-0 accent-foreground" />
        Email me new drops and offers. Unsubscribe any time.
      </label>
      <button type="submit" disabled={register.isPending} className={submit}>
        {register.isPending ? "Creating account…" : "Create account"}
      </button>
      <FormError>{formError}</FormError>
      <p className="text-16 text-subtle-foreground md:text-18">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-4">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          privacy policy
        </Link>
        . Already have one?{" "}
        <Link href={`/account/login?next=${encodeURIComponent(next)}`} className="font-semibold text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  )
}

export function ForgotPasswordForm() {
  const id = useId()
  const request = useMutation({ mutationFn: authApi.forgotPassword })
  const { errors, formError, validate, fail } = useSchemaForm(forgotPasswordSchema)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = validate(event.currentTarget, values(event.currentTarget))
    if (input) request.mutate(input.email, { onError: fail })
  }

  if (request.isSuccess) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="text-24 font-bold">Check your email</p>
        <p className="text-18 text-subtle-foreground">If {request.variables} has an account, we&rsquo;ve sent a link to choose a new password. It works for 30 minutes.</p>
      </div>
    )
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={request.isPending} className={formClass}>
      <FormField formId={id} name="email" type="email" label="Email" autoComplete="email" error={errors.email} />
      <button type="submit" disabled={request.isPending} className={submit}>
        {request.isPending ? "Sending…" : "Send reset link"}
      </button>
      <FormError>{formError}</FormError>
    </form>
  )
}

export function ResetPasswordForm({ token }: { token: string }) {
  const id = useId()
  const reset = useMutation({ mutationFn: (password: string) => authApi.resetPassword(token, password) })
  const { errors, formError, validate, fail } = useSchemaForm(resetPasswordSchema)
  const [shown, setShown] = useState(false)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = validate(event.currentTarget, { token, password: values(event.currentTarget).password })
    if (input) reset.mutate(input.password, { onError: fail })
  }

  if (reset.isSuccess) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-24 font-bold">Password changed</p>
        <p className="text-18 text-subtle-foreground">Sign in with your new password.</p>
        <Link href="/account/login" className={submit}>
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={reset.isPending} className={formClass}>
      <FormField formId={id} name="password" type={shown ? "text" : "password"} label="New password" autoComplete="new-password" hint="At least 8 characters, with letters and a number." error={errors.password ?? errors.token} />
      <label className="flex min-h-11 items-center gap-3 text-16 font-medium md:text-18">
        <input type="checkbox" checked={shown} onChange={(event) => setShown(event.target.checked)} className="size-5 accent-foreground" />
        Show password
      </label>
      <button type="submit" disabled={reset.isPending} className={submit}>
        {reset.isPending ? "Saving…" : "Save new password"}
      </button>
      <FormError>{formError}</FormError>
    </form>
  )
}
