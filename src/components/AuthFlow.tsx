import React, { useState } from "react";
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Fingerprint,
  Github,
  Chrome,
  AlertCircle,
  CheckCircle2,
  Smartphone,
  Eye,
  EyeOff,
  ArrowLeft
} from "lucide-react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  updateProfile,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "../firebase";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Button, Checkbox, Dialog, Field, IconButton, Input, Logo, Spinner } from "../ui";

interface AuthFlowProps {
  theme: "light" | "dark";
  onAuthSuccess: (userEmail: string, isNewUser: boolean) => void;
  onBackToLanding: () => void;
  initialFlow?: "login" | "register";
}

export default function AuthFlow({
  theme,
  onAuthSuccess,
  onBackToLanding,
  initialFlow = "login",
}: AuthFlowProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const [flow, setFlow] = useState<
    "login" | "register" | "forgot" | "reset" | "verify" | "twofactor" | "magiclink"
  >(initialFlow);

  React.useEffect(() => {
    if (location.pathname === "/register") {
      setFlow("register");
    } else if (location.pathname === "/login") {
      setFlow("login");
    }
  }, [location.pathname]);

  // Input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code2fa, setCode2fa] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(true);

  // Form states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Passkey Simulation state
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<"idle" | "scanning" | "success" | "failed">("idle");

  // Compute Password Strength
  const getPasswordStrength = () => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  };

  const strengthScore = getPasswordStrength();
  const strengthLabels = ["Weak", "Medium", "Good", "Excellent"];

  const handleValidationAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setIsLoading(true);

    if (isFirebaseConfigured && auth) {
      try {
        if (flow === "login") {
          if (!email.includes("@")) {
            setErrorMsg("Please introduce a valid email address.");
            setIsLoading(false);
            return;
          }
          if (password.length < 6) {
            setErrorMsg("Password must be at least 6 characters.");
            setIsLoading(false);
            return;
          }
          await signInWithEmailAndPassword(auth, email, password);
          setIsLoading(false);
          onAuthSuccess(email, false);
        } else if (flow === "register") {
          if (!name.trim()) {
            setErrorMsg("Please introduce your full name.");
            setIsLoading(false);
            return;
          }
          if (!email.includes("@")) {
            setErrorMsg("Please introduce a valid email address.");
            setIsLoading(false);
            return;
          }
          if (strengthScore < 2) {
            setErrorMsg("Please choose a stronger password matching the indicators.");
            setIsLoading(false);
            return;
          }
          if (!acceptTerms) {
            setErrorMsg("Please accept our Terms and Privacy Policy first.");
            setIsLoading(false);
            return;
          }
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          if (userCredential.user) {
            await updateProfile(userCredential.user, { displayName: name });
          }
          setIsLoading(false);
          onAuthSuccess(email, true);
        } else if (flow === "forgot") {
          if (!email.includes("@")) {
            setErrorMsg("Please introduce a valid email address.");
            setIsLoading(false);
            return;
          }
          await sendPasswordResetEmail(auth, email);
          setIsLoading(false);
          setSuccessMsg("We sent a password reset email to your inbox.");
        }
      } catch (err: any) {
        setIsLoading(false);
        let msg = err.message || "An authentication error occurred.";
        if (msg.includes("auth/operation-not-allowed")) {
          msg = "Email/Password sign-in is not enabled in your Firebase Console. Please go to your Firebase project portal > Authentication > Sign-in method, and enable the Email/Password provider.";
        }
        setErrorMsg(msg);
      }
      return;
    } else {
      setIsLoading(false);
      setErrorMsg("Firebase Identity Service is not configured. Please define your environment credentials in .env to activate authentication features.");
    }
  };

  const handleBiometricTrigger = () => {
    setErrorMsg("Passkey authentication must be configured inside your workspace Settings > Privacy & Security panel first.");
  };

  const triggerSocialLogin = async (platform: string) => {
    if (isFirebaseConfigured && auth) {
      setIsLoading(true);
      setErrorMsg("");
      try {
        let provider;
        if (platform === "Google") {
          provider = new GoogleAuthProvider();
        } else if (platform === "GitHub") {
          provider = new GithubAuthProvider();
        }
        if (provider) {
          const result = await signInWithPopup(auth, provider);
          if (result.user && result.user.email) {
            onAuthSuccess(result.user.email, false);
          }
        }
      } catch (err: any) {
        console.error(`${platform} social login failed:`, err);
        let msg = err.message || `${platform} authentication failed.`;
        if (msg.includes("auth/unauthorized-domain")) {
          msg = `This domain (${window.location.hostname}) is not authorized for Firebase OAuth redirects. Please go to your Firebase Console > Authentication > Settings > Authorised domains, and add "${window.location.hostname}" to the list.`;
        }
        setErrorMsg(msg);
      } finally {
        setIsLoading(false);
      }
    } else {
      setErrorMsg("Firebase Identity Service is not configured. Social login is unavailable.");
    }
  };

  const titles: Record<typeof flow, string> = {
    login: "Sign in to Aura",
    register: "Create your account",
    forgot: "Reset your password",
    reset: "Choose a new password",
    verify: "Verify your email",
    twofactor: "Two-factor authentication",
    magiclink: "Email me a sign-in link",
  };
  const subtitles: Record<typeof flow, string> = {
    login: "Welcome back. Enter your details to continue.",
    register: "Start with a free workspace. No credit card needed.",
    forgot: "Enter your email and we will send a reset link.",
    reset: "Use at least 8 characters with a mix of letters and numbers.",
    verify: "Enter the 6-digit code we sent to your email.",
    twofactor: "Enter the 6-digit code from your authenticator app.",
    magiclink: "We will email you a link that signs you in.",
  };
  const submitLabels: Record<typeof flow, string> = {
    login: "Sign in",
    register: "Create account",
    forgot: "Send reset link",
    reset: "Save new password",
    verify: "Confirm",
    twofactor: "Verify code",
    magiclink: "Send sign-in link",
  };
  const strengthTone = strengthScore < 2 ? "bg-danger" : strengthScore < 3 ? "bg-warning" : "bg-success";
  const linkBtn =
    "rounded-sm py-1 text-[12px] font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <div
      id="auth-flow-viewport"
      className="flex min-h-screen w-full flex-col items-center bg-surface px-4 py-8 text-fg"
    >
      <div className="flex w-full max-w-[400px] flex-1 flex-col justify-center gap-6">
        <div className="flex flex-col items-center gap-5">
          <Logo size={32} />
          <div className="text-center">
            <h1 className="text-[20px] font-semibold tracking-tight">{titles[flow]}</h1>
            <p className="mt-1 text-[13px] text-fg-muted">{subtitles[flow]}</p>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-panel p-5 shadow-soft sm:p-6">
          {errorMsg && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div role="status" className="mb-4 flex items-start gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-[13px] text-success">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleValidationAndSubmit} className="flex flex-col gap-4">
            {flow === "register" && (
              <Field label="Full name">
                {(p) => (
                  <Input
                    {...p}
                    size="lg"
                    type="text"
                    autoComplete="name"
                    placeholder="Ada Lovelace"
                    leadingIcon={<User size={14} />}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                )}
              </Field>
            )}

            {flow !== "reset" && flow !== "verify" && flow !== "twofactor" && (
              <Field label="Email">
                {(p) => (
                  <Input
                    {...p}
                    size="lg"
                    type="email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    leadingIcon={<Mail size={14} />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                )}
              </Field>
            )}

            {(flow === "login" || flow === "register" || flow === "reset") && (
              <div className="flex flex-col gap-2">
                <Field label="Password" hint={flow === "register" ? "Minimum 8 characters." : undefined}>
                  {(p) => (
                    <Input
                      {...p}
                      size="lg"
                      type={showPassword ? "text" : "password"}
                      autoComplete={flow === "login" ? "current-password" : "new-password"}
                      placeholder="Password"
                      leadingIcon={<Lock size={14} />}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      trailing={
                        <IconButton
                          label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword}
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </IconButton>
                      }
                    />
                  )}
                </Field>
                {flow === "login" && (
                  <button type="button" onClick={() => setFlow("forgot")} className={`self-end ${linkBtn}`}>
                    Forgot password?
                  </button>
                )}
                {(flow === "register" || flow === "reset") && password.length > 0 && (
                  <div className="flex flex-col gap-1.5" aria-live="polite">
                    <div className="flex justify-between text-[12px] text-fg-muted">
                      <span>Password strength</span>
                      <span className="font-medium text-fg">{strengthLabels[Math.min(strengthScore, 3)]}</span>
                    </div>
                    <div className="grid h-1 grid-cols-4 gap-1" aria-hidden="true">
                      {[0, 1, 2, 3].map((val) => (
                        <div key={val} className={`h-full rounded-full ${val <= strengthScore ? strengthTone : "bg-active"}`} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {flow === "verify" && (
              <Field label="6-digit verification code">
                {(p) => (
                  <Input
                    {...p}
                    size="lg"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="text-center font-mono tracking-[0.4em]"
                    required
                  />
                )}
              </Field>
            )}

            {flow === "twofactor" && (
              <Field label="Authenticator code">
                {(p) => (
                  <Input
                    {...p}
                    size="lg"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    leadingIcon={<Smartphone size={14} />}
                    value={code2fa}
                    onChange={(e) => setCode2fa(e.target.value.replace(/\D/g, ""))}
                    className="font-mono tracking-widest"
                    required
                  />
                )}
              </Field>
            )}

            {flow === "login" && (
              <div className="flex items-center justify-between gap-3">
                <Checkbox checked={rememberMe} onChange={setRememberMe} label="Remember this device" />
                <button type="button" onClick={() => setFlow("magiclink")} className={linkBtn}>
                  Use a magic link
                </button>
              </div>
            )}

            {flow === "register" && (
              <div className="flex flex-col gap-1.5">
                <Checkbox checked={acceptTerms} onChange={setAcceptTerms} label="I agree to the Terms and Privacy Policy" />
                <p className="pl-6 text-[12px] text-fg-muted">
                  Read the{" "}
                  <Link to="/terms" className="font-medium text-accent hover:underline">Terms</Link> and{" "}
                  <Link to="/privacy" className="font-medium text-accent hover:underline">Privacy Policy</Link>.
                </p>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isLoading}
              trailingIcon={<ArrowRight size={15} />}
              className="mt-1 w-full max-sm:h-11"
            >
              {submitLabels[flow]}
            </Button>
          </form>

          {(flow === "login" || flow === "register") && (
            <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5">
              <p className="text-center text-[12px] text-fg-subtle">Or continue with</p>
              <Button variant="secondary" size="lg" className="w-full max-sm:h-11" onClick={handleBiometricTrigger} leadingIcon={<Fingerprint size={15} />}>
                Passkey
              </Button>
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="secondary" size="lg" className="max-sm:h-11" disabled={isLoading} onClick={() => triggerSocialLogin("Google")} leadingIcon={<Chrome size={14} />}>
                  Google
                </Button>
                <Button variant="secondary" size="lg" className="max-sm:h-11" disabled={isLoading} onClick={() => triggerSocialLogin("GitHub")} leadingIcon={<Github size={14} />}>
                  GitHub
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 text-[13px] text-fg-muted">
          {flow === "login" && (
            <p>
              New to Aura?{" "}
              <button type="button" onClick={() => navigate("/register")} className={linkBtn}>
                Create an account
              </button>
            </p>
          )}
          {flow === "register" && (
            <p>
              Already have an account?{" "}
              <button type="button" onClick={() => navigate("/login")} className={linkBtn}>
                Sign in
              </button>
            </p>
          )}
          {(flow === "forgot" || flow === "magiclink" || flow === "twofactor" || flow === "verify") && (
            <button type="button" onClick={() => setFlow("login")} className={linkBtn}>
              Back to sign in
            </button>
          )}
          <button
            type="button"
            onClick={onBackToLanding}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ArrowLeft size={13} /> Back to home
          </button>
        </div>
      </div>

      <Dialog
        open={showBiometrics}
        onClose={() => setShowBiometrics(false)}
        title="Passkey sign-in"
        description={biometricStatus === "success" ? "Passkey verified." : "Waiting for your device to confirm."}
        size="sm"
      >
        <div className="flex items-center justify-center gap-2 py-4 text-[13px] text-fg-muted">
          {biometricStatus === "scanning" && <Spinner />}
          {biometricStatus === "success" && <CheckCircle2 size={18} className="text-success" />}
          <Fingerprint size={18} />
        </div>
      </Dialog>
    </div>
  );
}
