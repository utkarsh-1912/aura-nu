import React, { useState } from "react";
import {
  Sparkles,
  Mail,
  Lock,
  User,
  ArrowRight,
  ShieldAlert,
  Fingerprint,
  Github,
  Chrome,
  AlertCircle,
  CheckCircle2,
  Key,
  Smartphone,
  Eye,
  EyeOff,
  RefreshCw,
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
import { useNavigate, useLocation } from "react-router-dom";

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
          msg = "⚠️ Email/Password sign-in is not enabled in your Firebase Console. Please go to your Firebase project portal > Authentication > Sign-in method, and enable the Email/Password provider.";
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
          msg = `⚠️ This domain (${window.location.hostname}) is not authorized for Firebase OAuth redirects. Please go to your Firebase Console > Authentication > Settings > Authorised domains, and add "${window.location.hostname}" to the list.`;
        }
        setErrorMsg(msg);
      } finally {
        setIsLoading(false);
      }
    } else {
      setErrorMsg("Firebase Identity Service is not configured. Social login is unavailable.");
    }
  };

  return (
    <div
      id="auth-flow-viewport"
      className="min-h-screen w-screen flex overflow-hidden transition-colors duration-200"
    >
      {/* Left decorative half for large screens */}
      <div className="hidden lg:flex lg:w-1/2 h-screen bg-[#09090b] border-r border-zinc-800/60 flex-col justify-between p-16 text-zinc-100 relative overflow-hidden select-none">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-purple-500/10 via-blue-500/5 to-transparent blur-[100px] rounded-full pointer-events-none"></div>

        <div className="flex items-center gap-3 relative z-10">
          <img src="/logo.png" alt="Aura Logo" className="w-8 h-8 object-contain rounded-xl shadow-md" />
          <span className="font-tomorrow font-bold text-lg tracking-tight bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent uppercase">Aura Next</span>
        </div>

        <div className="max-w-md relative z-10 my-auto flex flex-col gap-6">
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full self-start">
            Enterprise Workspace
          </span>
          <h1 className="font-display font-extrabold text-3xl xl:text-4xl tracking-tight text-white leading-tight">
            Draft, align, & execute with intelligent context.
          </h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Fusing offline-first workspace replication pipelines with proxy-safe Gemini completions to power developer OKRs and system logs.
          </p>

          <ul className="flex flex-col gap-3.5 mt-4">
            {[
              "Gemini generative shortcuts & context outlines",
              "Microsecond local replication & cloud redundancy",
              "Passkey sign-in, MFA keys, & Magic Login links",
              "High-density spotlight palette navigation"
            ].map((feat, i) => (
              <li key={i} className="flex items-center gap-3 text-xs text-zinc-300 font-medium">
                <div className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  ✓
                </div>
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-zinc-800/80 pt-8 relative z-10">
          <p className="text-xs italic leading-relaxed text-zinc-300">
            "Aura Next's offline document replication is magic. We write markdown specs on flights and sync straight back to Stripe clusters seamlessly."
          </p>
          <div className="flex items-center gap-3 mt-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center font-bold text-white text-[10px]">
              SS
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-xs text-white">Sarah Sterling</span>
              <span className="text-[10px] text-zinc-500">Principal Architect, Stripe</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right form container half */}
      <div className="w-full lg:w-1/2 h-screen flex flex-col items-center p-4 overflow-y-auto transition-colors duration-200 bg-bg-primary text-text-primary">
        <div className="flex flex-col gap-4 items-center w-full max-w-md animate-fade-in relative z-10 py-8 my-auto">
        {/* Return banner */}
        <button
          onClick={onBackToLanding}
          className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border-primary bg-bg-secondary text-text-secondary hover:text-text-primary hover:shadow-xs transition-all cursor-pointer text-xs font-semibold"
        >
          <ArrowLeft size={13} />
          Back to Landing Page
        </button>

        {/* Main glassmorphism card wrapper */}
        <div
          className="w-full p-8 rounded-3xl border border-border-primary bg-bg-secondary text-text-primary shadow-xl dark:shadow-2xl dark:shadow-black/40 flex flex-col transition-all relative"
        >
        {/* Banner header logo */}
        <div className={`flex flex-col items-center text-center mb-8 ${(flow === "login" || flow === "register") ? "lg:hidden" : ""}`}>
          <img src="/logo.png" alt="Aura Logo" className="w-10 h-10 object-contain rounded-2xl mb-3 shadow-md shadow-blue-500/10" />
          <h2 className="font-display font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">
            {flow === "login" && "Welcome back to Aura"}
            {flow === "register" && "Form your strategy workspace"}
            {flow === "forgot" && "Reset your Security Credentials"}
            {flow === "reset" && "Establish New Password"}
            {flow === "verify" && "Verify your Identity"}
            {flow === "twofactor" && "Multi-Factor Authentication"}
            {flow === "magiclink" && "Request Magic Login link"}
          </h2>
          <p className="text-[11.5px] text-slate-400 dark:text-zinc-500 mt-1 max-w-[280px]">
            {flow === "login" && "Access your synchronized document vault with secure dual replication."}
            {flow === "register" && "Unlock instant Gemini assistant shortcuts and local-first persistence."}
            {flow === "forgot" && "Input your registered address to receive a validation token."}
            {flow === "reset" && "Choose a robust cryptographic password key combination."}
            {flow === "verify" && "A validation pin was transmitted to your address. Provide it below."}
            {flow === "twofactor" && "Provide the security pin from your Authenticator app device."}
            {flow === "magiclink" && "Sign-in without typing passwords. Click the link sent to your inbox."}
          </p>
        </div>

        {/* Global Errors and success markers */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 size={14} className="flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Dynamic Form Segment */}
        <form onSubmit={handleValidationAndSubmit} className="flex flex-col gap-4">
          
          {/* User Full Name (Registration only) */}
          {flow === "register" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                Full Name
              </label>
              <div className="relative flex items-center">
                <User size={13} className="absolute left-3.5 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-border-primary bg-bg-primary text-text-primary focus:bg-bg-secondary focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>
          )}

          {/* Email address input (Standard fields) */}
          {flow !== "reset" && flow !== "verify" && flow !== "twofactor" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail size={13} className="absolute left-3.5 text-slate-400 dark:text-zinc-500" />
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-border-primary bg-bg-primary text-text-primary focus:bg-bg-secondary focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>
          )}

          {/* Password field (Login, register, reset only) */}
          {(flow === "login" || flow === "register" || flow === "reset") && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                  Password
                </label>
                {flow === "login" && (
                  <button
                    type="button"
                    onClick={() => setFlow("forgot")}
                    className="text-[10.5px] text-blue-500 font-semibold hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <Lock size={13} className="absolute left-3.5 text-slate-400 dark:text-zinc-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={flow === "register" ? "Minimum 8 characters" : "Password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full text-xs pl-9 pr-10 py-2.5 rounded-xl border border-border-primary bg-bg-primary text-text-primary focus:bg-bg-secondary focus:border-blue-500 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {/* Password strength gauges (register/reset only) */}
              {(flow === "register" || flow === "reset") && password.length > 0 && (
                <div className="mt-1 flex flex-col gap-1.5">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Password Strength:</span>
                    <span className="font-semibold text-blue-500">{strengthLabels[Math.min(strengthScore, 3)]}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 h-1">
                    {[0, 1, 2, 3].map((val) => (
                      <div
                        key={val}
                        className={`h-full rounded-full transition-colors ${
                          val <= strengthScore
                            ? strengthScore < 2
                              ? "bg-rose-500"
                              : strengthScore < 3
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                            : "bg-slate-100 dark:bg-zinc-800"
                        }`}
                      ></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Verification Code Box (Verify Only) */}
          {flow === "verify" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                6-Digit Email Verification PIN
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="405111"
                className="w-full text-center tracking-widest text-lg font-mono py-2.5 rounded-xl border border-border-primary bg-bg-primary text-text-primary focus:bg-bg-secondary focus:border-blue-500 outline-none transition-all"
                required
              />
            </div>
          )}

          {/* MFA Authenticator Pin (Two-Factor Only) */}
          {flow === "twofactor" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                Authenticator App 6-digit Code
              </label>
              <div className="relative flex items-center">
                <Smartphone size={14} className="absolute left-3.5 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={code2fa}
                  onChange={(e) => setCode2fa(e.target.value.replace(/\D/g, ""))}
                  className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-border-primary bg-bg-primary text-text-primary focus:bg-bg-secondary focus:border-blue-500 outline-none font-mono tracking-widest transition-all"
                  required
                />
              </div>
            </div>
          )}

          {/* Remember Me Box & Accept Terms parameters */}
          {flow === "login" && (
            <div className="flex justify-between items-center text-[11px] text-slate-400 dark:text-zinc-500">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={() => setRememberMe(!rememberMe)}
                  className="rounded border-border-primary text-blue-500 focus:ring-0 cursor-pointer"
                />
                Remember my device
              </label>
              <button
                type="button"
                onClick={() => setFlow("magiclink")}
                className="text-blue-500 hover:underline font-semibold cursor-pointer"
              >
                Use Magic Link
              </button>
            </div>
          )}

          {flow === "register" && (
            <label className="flex items-start gap-2 text-[11px] leading-snug text-slate-400 dark:text-zinc-500 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={() => setAcceptTerms(!acceptTerms)}
                className="mt-0.5 rounded border-border-primary text-blue-500 focus:ring-0 cursor-pointer"
              />
              <span>
                I agree to the{" "}
                <span className="text-blue-500 hover:underline font-medium">Terms of Services</span> and{" "}
                <span className="text-blue-500 hover:underline font-medium">Privacy Policies</span> of Aura.
              </span>
            </label>
          )}

          {/* Core submit action */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-zinc-800 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md shadow-blue-500/10 cursor-pointer mt-2"
          >
            {isLoading ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <>
                <span>
                  {flow === "login" && "Authorize Workspace"}
                  {flow === "register" && "Form Workspace"}
                  {flow === "forgot" && "Send Reset Token"}
                  {flow === "reset" && "Commit New Password"}
                  {flow === "verify" && "Confirm & Access"}
                  {flow === "twofactor" && "Authorize 2FA"}
                  {flow === "magiclink" && "Transmit Magic Link"}
                </span>
                <ArrowRight size={13} />
              </>
            )}
          </button>
        </form>

        {/* Alternate Navigation helpers */}
        <div className="mt-6 flex flex-col gap-4 text-center text-[11px]">
          {flow === "login" && (
            <p className="text-slate-400">
              Need a professional cluster?{" "}
              <button
                onClick={() => navigate("/register")}
                className="text-blue-500 font-bold hover:underline cursor-pointer"
              >
                Create an account
              </button>
            </p>
          )}

          {flow === "register" && (
            <p className="text-slate-400">
              Already have a workspace credentials?{" "}
              <button
                onClick={() => navigate("/login")}
                className="text-blue-500 font-bold hover:underline cursor-pointer"
              >
                Log in instead
              </button>
            </p>
          )}

          {(flow === "forgot" || flow === "magiclink" || flow === "twofactor" || flow === "verify") && (
            <button
              onClick={() => setFlow("login")}
              className="text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white font-semibold transition-colors cursor-pointer"
            >
              Return to login portal
            </button>
          )}
        </div>

        {/* Social Logins + Passkey integration (Login and register only) */}
        {(flow === "login" || flow === "register") && (
          <div className="mt-6 pt-6 border-t border-border-primary flex flex-col gap-3">
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-center text-slate-400 dark:text-zinc-500 block mb-1">
              Enterprise Identity Providers
            </span>

            {/* Passkey Fast Access button */}
            <button
              onClick={handleBiometricTrigger}
              className="w-full py-2.5 border border-border-primary bg-bg-primary text-text-secondary hover:text-text-primary hover:bg-bg-secondary hover:shadow-xs transition-all flex items-center justify-center gap-2.5 text-xs font-semibold cursor-pointer rounded-xl"
            >
              <Fingerprint size={14} className="text-blue-500" />
              <span>Authenticate using Passkey</span>
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => triggerSocialLogin("Google")}
                className="py-2 border border-border-primary bg-bg-primary text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors flex items-center justify-center gap-2 text-xs cursor-pointer rounded-xl"
              >
                <Chrome size={12} className="text-red-500" />
                <span>Google</span>
              </button>

              <button
                type="button"
                onClick={() => triggerSocialLogin("GitHub")}
                className="py-2 border border-border-primary bg-bg-primary text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors flex items-center justify-center gap-2 text-xs cursor-pointer rounded-xl"
              >
                <Github size={12} />
                <span>GitHub</span>
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
      </div>

      {/* Biometric Scanning Pop-over Modal Dialog */}
      {showBiometrics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs select-none">
          <div
            className="w-[280px] p-6 rounded-2xl border border-border-primary bg-bg-secondary text-text-primary text-center flex flex-col items-center shadow-2xl"
          >
            <div className="relative mb-4 flex items-center justify-center">
              <div className="absolute inset-0 w-16 h-16 rounded-full border border-blue-500/30 animate-ping"></div>
              <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 relative">
                <Fingerprint size={28} className="animate-pulse" />
              </div>
            </div>

            <h4 className="font-semibold text-sm">Passkey Biometric Scan</h4>
            <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1">
              {biometricStatus === "scanning" && "Scanning FaceID / TouchID sensor..."}
              {biometricStatus === "success" && "Biometric signature authorized!"}
            </p>

            {biometricStatus === "scanning" && (
              <div className="w-24 h-1 bg-slate-200 dark:bg-zinc-800 rounded-full mt-4 overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-progress-bar"></div>
              </div>
            )}

            {biometricStatus === "success" && (
              <CheckCircle2 size={20} className="text-emerald-500 mt-3" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
