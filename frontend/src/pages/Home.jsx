import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMode } from '../context/ModeContext';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { switchToDemo, switchToLive } = useMode();

  const handleDemoMode = () => {
    if (user) {
      switchToDemo();
    } else {
      navigate('/login');
    }
  };

  const handleStartAnalysis = () => {
    if (user) {
      switchToLive();
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="home-landing min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-10 sm:px-8 lg:px-12">
        <header className="mb-12 flex flex-col gap-6 text-center mt-auto mb-auto">
          <span className="mx-auto inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-sm font-semibold text-cyan-200 backdrop-blur-sm">
            Premium Fleet Intelligence for Enterprise Teams
          </span>
          <div className="space-y-6">
            <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              FleetNimble
            </h1>
            <p className="mx-auto max-w-3xl text-2xl leading-8 text-slate-300 sm:text-3xl">
              AI-Powered Fleet Intelligence Platform
            </p>
            <p className="mx-auto max-w-3xl text-lg leading-8 text-slate-400 sm:text-xl">
              Monitor, analyze and optimize your fleet in real time using live OBD telemetry, predictive maintenance and AI-powered diagnostics.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row mt-12">
            <button
              type="button"
              onClick={handleStartAnalysis}
              className="btn-primary btn-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 shadow-lg shadow-cyan-500/25"
            >
              Start Analysis
            </button>
            <button
              type="button"
              onClick={handleDemoMode}
              className="btn-secondary btn-lg text-white border-cyan-400/30 bg-slate-900/50 hover:bg-slate-800/50"
            >
              Demo Experience
            </button>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 mt-6">
            {user ? (
              <p className="text-slate-400 text-sm">
                Welcome back, {user.name} • <button onClick={() => navigate('/')} className="text-cyan-400 hover:underline">Logout</button>
              </p>
            ) : (
              <p className="text-slate-400 text-sm">
                <button onClick={() => navigate('/login')} className="text-cyan-400 hover:underline">Login</button> or <button onClick={() => navigate('/register')} className="text-cyan-400 hover:underline">Register</button> to get started
              </p>
            )}
          </div>
        </header>
      </div>
    </div>
  );
}
