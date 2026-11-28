"use client";

import { Suspense, useEffect } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import API, { ensureCsrfToken, getLastCsrfError } from "@/api";
import Image from "next/image";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { FaApple } from "react-icons/fa";
import Microsoft from "@/assets/microsoft.svg";
import logo from "@/assets/logo.W.png";
import toast from "react-hot-toast";
import { reconnectSocketWithToken } from "@/socket/socket";

const DEFAULT_POST_LOGIN_PATH = "/dashboard/time-tracking/home";

function getSafeRedirectUrl(target) {
  if (!target || typeof target !== "string") {
    return DEFAULT_POST_LOGIN_PATH;
  }

  const trimmed = target.trim();

  // Guard against Open Redirects:
  // Must start with single "/", cannot start with "//" or "/\", and cannot contain protocol scheme
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("://") ||
    /^\/[/\\]/.test(trimmed)
  ) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  // Prevent defaulting to Team Report when landing or fallback was intended for Home
  if (
    trimmed === "/dashboard/time-tracking/overview" ||
    trimmed === "/dashboard/time-tracking"
  ) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  // Allow safe internal dashboard paths
  if (trimmed.startsWith("/dashboard")) {
    return trimmed;
  }

  return DEFAULT_POST_LOGIN_PATH;
}

const SignInContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified");
  const oauthRequiresTwoFactor = searchParams.get("requiresTwoFactor") === "true";
  const oauthEmail = searchParams.get("email") || "";
  const oauthError = searchParams.get("error");
  const returnUrlParam = searchParams.get("redirect") || searchParams.get("returnUrl") || searchParams.get("from");

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [formData, setFormData] = useState({
    email: oauthEmail,
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(oauthRequiresTwoFactor);
  const [otp, setOtp] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const isDesk = typeof window !== "undefined" && !!window.electronAPI;
    setIsDesktop(isDesk);
    ensureCsrfToken().catch(() => {});
  }, []);

  useEffect(() => {
    if (oauthRequiresTwoFactor) {
      setRequiresTwoFactor(true);
    }
    if (oauthEmail) {
      setFormData((prev) => ({ ...prev, email: prev.email || oauthEmail }));
    }
    if (oauthError) {
      const errorMessages = {
        account_archived: "Account is archived. Please contact your organization administrator.",
        google_auth_failed: "Google sign in failed. Please try again.",
        microsoft_auth_failed: "Microsoft sign in failed. Please try again.",
        apple_auth_failed: "Apple sign in failed. Please try again.",
      };
      toast.error(errorMessages[oauthError] || "Authentication failed. Please try again.");
    }
  }, [oauthRequiresTwoFactor, oauthEmail, oauthError]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isLoggingIn) return;

    setIsLoggingIn(true);

    const csrfReady = await ensureCsrfToken();
    if (!csrfReady) {
      const csrfErr = typeof getLastCsrfError === "function" ? getLastCsrfError() : null;
      if (csrfErr?.category === "network") {
        toast.error("Unable to connect to authentication server. Please ensure the backend is running and try again.");
      } else if (csrfErr?.category === "timeout") {
        toast.error("Connection timed out while initializing secure session. Please try again.");
      } else {
        toast.error("Unable to initialize secure session. Please refresh the page.");
      }
      setIsLoggingIn(false);
      return;
    }

    const electronAPI =
      typeof window !== "undefined" ? window.electronAPI : null;
    const deviceId = electronAPI?.getDeviceId
      ? await electronAPI.getDeviceId().catch(() => undefined)
      : undefined;

    if (requiresTwoFactor) {
      try {
        const res = await API.post("/auth/verify-two-factor", {
          email: formData.email,
          otp,
          ...(electronAPI ? { client: "desktop", ...(deviceId ? { deviceId } : {}) } : {}),
        });

        if (electronAPI) {
          await electronAPI.saveToken(res.data.accessToken, res.data.refreshToken);
        }

        if (res.data?.accessToken) {
          void reconnectSocketWithToken(res.data.accessToken);
        }

        toast.success("Signed in successfully!");

        if (electronAPI) {
          router.replace("/desktop");
        } else {
          router.push(getSafeRedirectUrl(returnUrlParam));
        }
      } catch (err) {
        toast.error(err.response?.data?.message || "Verification failed.");
        setOtp("");
      } finally {
        setIsLoggingIn(false);
      }

      return;
    }

    try {
      const res = await API.post("/auth/login", {
        ...formData,
        ...(electronAPI ? { client: "desktop", ...(deviceId ? { deviceId } : {}) } : {}),
      });

      if (res.data.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        return;
      }

      if (electronAPI) {
        await electronAPI.saveToken(res.data.accessToken, res.data.refreshToken);
      } else {
        console.info("ELECTRON API MISSING");
      }

      if (res.data?.accessToken) {
        void reconnectSocketWithToken(res.data.accessToken);
      }

      toast.success("Signed in successfully!");

      if (window.electronAPI) {
        router.replace("/desktop");
      } else {
        router.push(getSafeRedirectUrl(returnUrlParam));
      }
    } catch (err) {
      console.error("LOGIN ERROR:", err);

      toast.error(
        err.response?.data?.message ||
          "Unable to sign in. Please check your credentials and try again.",
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <>
      <div
        aria-live="assertive"
        className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 z-100"
      >
        <div className="flex w-full flex-col items-center space-y-4 sm:items-end"></div>
      </div>

      <div className="relative flex min-h-full flex-1 flex-col justify-center py-8 sm:py-10 px-2 sm:px-4 lg:px-6 bg-linear-to-b from-gray-50 to-white dark:from-slate-900 dark:to-[#090F1D] transition-colors duration-200">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex items-center justify-center space-x-4">
            <Image src={logo} alt="WorkComposer" width={120} />
            <div className="flex-1">
              <h2 className="text-2xl font-bold leading-7 text-gray-900 dark:text-white">
                Welcome back
              </h2>
              <p className="text-base text-gray-600 dark:text-gray-400 mt-0.5">
                Sign in to your account to continue
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-120">
          <div className="bg-white dark:bg-[#0F172A] px-6 py-8 sm:py-10 shadow-lg sm:rounded-2xl sm:px-10 border border-gray-100 dark:border-[#22324D] transition-all duration-300 hover:shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-600"></div>

            {verified && (
              <p className="text-green-600 text-center mb-4">
                Email verified successfully ✅
              </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-200"
                >
                  Email address
                </label>
                <div className="mt-2 relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail className="w-5 h-5 text-gray-400" />
                  </div>

                  <input
                    type="email"
                    name="email"
                    id="email"
                    autoComplete="email"
                    disabled={requiresTwoFactor}
                    placeholder="your.email@example.com"
                    required
                    aria-describedby="email-description"
                    tabIndex={1}
                    value={formData.email}
                    onChange={handleChange}
                    className="block w-full rounded-lg border-0 py-2 pl-12 pr-4 text-gray-900 dark:text-white bg-white dark:bg-[#1E293B] shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-all duration-200"
                  />
                  <div id="email-description" className="sr-only">
                    Enter your email address to sign in
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium leading-6 text-gray-900"
                  >
                    Password
                  </label>
                  <div className="text-sm">
                    <button
                      type="button"
                      onClick={() =>
                        router.push("/authenticate/forgot-password")
                      }
                      className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors duration-200"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                <div className="mt-2 relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none ">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>

                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    id="password"
                    disabled={requiresTwoFactor}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                    aria-describedby="password-description"
                    tabIndex={2}
                    value={formData.password}
                    onChange={handleChange}
                    className="block w-full rounded-lg border-0 py-2 pl-12 pr-4 text-gray-900 dark:text-white bg-white dark:bg-[#1E293B] shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    tabIndex={3}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                  <div id="password-description" className="sr-only">
                    Enter your password to sign in
                  </div>
                </div>
              </div>

              {requiresTwoFactor && (
                <div>
                  <label
                    htmlFor="otp"
                    className="block text-sm font-medium leading-6 text-gray-900"
                  >
                    Verification Code
                  </label>

                  <div className="mt-2">
                    <input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Enter 6-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="block w-full rounded-lg border-0 py-2 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-all duration-200"
                    />
                  </div>

                  <p className="mt-2 text-sm text-gray-500">
                    We&apos;ve sent a verification code to your email.
                  </p>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-500 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70"
                  aria-live="polite"
                  tabIndex={10}
                >
                  <span className="flex items-center justify-center gap-2">
                    {isLoggingIn ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>
                          {requiresTwoFactor ? "Verifying..." : "Signing in..."}
                        </span>
                      </>
                    ) : (
                      <span>
                        {requiresTwoFactor ? "Verify & Sign In" : "Sign in"}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            </form>

            <div className="relative mt-8">
              <div
                className="absolute inset-0 flex items-center"
                aria-hidden="true"
              >
                <div className="w-full border-t border-gray-200"></div>
              </div>

              <div className="relative flex justify-center text-sm font-medium">
                <span className="bg-white px-6 text-gray-500">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  const suffix = isDesktop ? "?client=desktop" : "";
                  window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/google${suffix}`;
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-800 ring-1 ring-gray-200 hover:bg-gray-800 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 active:bg-gray-100 transition-all duration-200 shadow-sm"
                tabIndex={11}
              >
                <FcGoogle className="w-5 h-5" aria-hidden="true" />
                <span>Google</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const suffix = isDesktop ? "?client=desktop" : "";
                  window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/microsoft${suffix}`;
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-800 ring-1 ring-gray-200 hover:bg-gray-800 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 active:bg-gray-100 transition-all duration-200 shadow-sm"
                tabIndex={12}
              >
                <Image src={Microsoft} alt="Microsoft" width={20} />
                <span>Microsoft</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const suffix = isDesktop ? "?client=desktop" : "";
                  window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/apple${suffix}`;
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-800 ring-1 ring-gray-200 hover:bg-gray-800 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 active:bg-gray-100 transition-all duration-200 shadow-sm"
                tabIndex={13}
              >
                <FaApple className="w-5 h-5" aria-hidden="true" />
                <span>Apple</span>
              </button>
            </div>
          </div>
        </div>

        {!isDesktop && (
          <div className="mt-6 text-center animate-fadeIn">
            <p className="text-sm text-gray-600">
              Not a member yet?{" "}
              <button
                onClick={() => router.push("/authenticate/signup")}
                className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors duration-200 inline-flex items-center group"
              >
                {" "}
                Start a 7 day trial
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform duration-200" />
              </button>
            </p>

            <p className="mt-2 text-xs text-gray-500">
              {" "}
              © 2026 WorkComposer. All rights reserved.{" "}
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default function SignInPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignInContent />
    </Suspense>
  );
}
