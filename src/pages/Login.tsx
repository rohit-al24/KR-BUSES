import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bus } from "lucide-react";
import { signInWithEmail, ensureProfile } from "@/lib/auth";

const Login = () => {
  const [role, setRole] = useState<"student" | "coordinator" | "admin">("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      const profile = await ensureProfile(role);
      localStorage.setItem("profile", JSON.stringify(profile));
      localStorage.setItem("userName", profile.full_name || profile.email || "");
      localStorage.setItem("userType", profile.role);
      let dest = '/seats';
      if (profile.role === 'coordinator') dest = '/coordinator';
      else if (profile.role === 'admin') dest = '/admin';
      navigate(dest);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-200 via-indigo-300 to-rose-200 p-6">
      <style>{`
        /* Static halo (no motion) behind the card; tinted but not animated */
        .vibrant-card{position:relative;border-radius:14px;isolation:isolate;padding:0.8rem;background:transparent}
        .vibrant-card::before{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:calc(100% + 72px);height:calc(100% + 72px);border-radius:22px;background:conic-gradient(from 200deg at 50% 50%, rgba(107,33,168,0.95), rgba(6,182,212,0.9), rgba(244,63,94,0.95), rgba(124,58,237,0.95), rgba(6,182,212,0.9));filter:blur(30px) saturate(150%);opacity:0.95;z-index:-1;pointer-events:none}
        .vibrant-card::after{content:'';position:absolute;inset:0;border-radius:14px;background:linear-gradient(180deg, rgba(255,255,255,0.92), rgba(250,250,255,0.80));z-index:0;pointer-events:none}
        .vibrant-card > *{position:relative;z-index:1}
        .vibrant-icon{background:linear-gradient(135deg,#3b82f6,#8b5cf6);box-shadow:0 12px 40px rgba(99,102,241,0.22);}
        /* stronger, static glow for buttons */
  .btn-vibrant { background: linear-gradient(90deg,#3b82f6,#6366f1); color: white; box-shadow: 0 10px 30px rgba(99,102,241,0.28); }
  .btn-vibrant-strong { background: linear-gradient(90deg,#2563eb,#7c3aed); color: white; box-shadow: 0 14px 50px rgba(124,58,237,0.28); }
  .role-outline { background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(245,246,255,0.95)); border: 1px solid rgba(15,23,42,0.06); color: #0f172a; }
  .role-outline .role-text { color: #0f172a !important; font-weight:600 }
        .label-vibrant { color: #0f172a; font-weight:600 }
      `}</style>
      <Card className="vibrant-card w-full max-w-md shadow-2xl border-0">
          <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center vibrant-icon">
            <Bus className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold">BusMate</CardTitle>
          <CardDescription className="text-base">Login with your email and password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">I am a</Label>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  type="button"
                  variant={role === "student" ? "default" : "outline"}
                  className={`h-14 text-base font-semibold ${role === 'student' ? 'btn-vibrant' : 'role-outline'}`}
                  onClick={() => setRole("student")}
                >
                  <span className={role === 'student' ? 'text-white' : 'role-text'}>Student</span>
                </Button>
                <Button
                  type="button"
                  variant={role === "coordinator" ? "default" : "outline"}
                  className={`h-14 text-base font-semibold ${role === 'coordinator' ? 'btn-vibrant' : 'role-outline'}`}
                  onClick={() => setRole("coordinator")}
                >
                  <span className={role === 'coordinator' ? 'text-white' : 'role-text'}>Coordinator</span>
                </Button>
                <Button
                  type="button"
                  variant={role === "admin" ? "default" : "outline"}
                  className={`h-14 text-base font-semibold ${role === 'admin' ? 'btn-vibrant' : 'role-outline'}`}
                  onClick={() => setRole("admin")}
                >
                  <span className={role === 'admin' ? 'text-white' : 'role-text'}>Admin</span>
                </Button>
              </div>
            </div>


            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold label-vibrant">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold label-vibrant">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 text-base"
              />
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}

              <div className="relative group overflow-hidden rounded-lg inline-block w-full">
              {/* soft radial white glow behind the button when clicked or hovered */}
              <span
                aria-hidden
                className={`opacity-0 group-hover:opacity-95 transition-opacity duration-150`}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 'calc(100% + 36px)',
                  height: 'calc(100% + 20px)',
                  borderRadius: '12px',
                  pointerEvents: 'none',
                  // stronger indigo-magenta radial glow (~+40% intensity), centered on button
                  background: 'radial-gradient(circle at 50% 42%, rgba(99,102,241,0.98) 0%, rgba(236,72,153,0.9) 36%, rgba(99,102,241,0.45) 68%, transparent 90%)',
                  filter: 'blur(20px) saturate(160%)',
                  zIndex: 0,
                }}
              />
              <Button type="submit" className="w-full h-12 text-base font-semibold relative z-10 btn-vibrant-strong" size="lg" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
