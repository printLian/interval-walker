import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { useState, useEffect, useRef } from 'react';
import { auth, googleProvider, db } from './firebase';

import {
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';

import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  Timestamp,
  doc,
  setDoc,
  getDoc
} from 'firebase/firestore';

import {
  Flame,
  Trophy,
  Moon,
  Sun,
  Activity,
  Timer,
  BarChart3,
  LogOut,
  Zap,
  Target,
  Settings,
  User,
  Star,
  Award,
  Heart,
  Weight,
  CalendarDays,
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
  TrendingUp,
  Medal
} from 'lucide-react';

import {
  CircularProgressbar,
  buildStyles
} from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

import {
  ResponsiveContainer,
  XAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';

import { motion, AnimatePresence } from 'framer-motion';

// ─── BADGE DEFINITIONS ────────────────────────────────────────────────────────
const BADGES = [
  { id: 'first_walk',   icon: '👟', label: 'First Step',  desc: 'Complete your first workout',      condition: (w) => w.length >= 1 },
  { id: 'three_streak', icon: '🔥', label: 'On Fire',      desc: '3-day streak',                     condition: (_, streak) => streak >= 3 },
  { id: 'five_streak',  icon: '💥', label: 'Unstoppable',  desc: '5-day streak',                     condition: (_, streak) => streak >= 5 },
  { id: 'ten_workouts', icon: '🏅', label: 'Dedicated',    desc: '10 total workouts',                condition: (w) => w.length >= 10 },
  { id: 'twenty_five',  icon: '🏆', label: 'Champion',     desc: '25 total workouts',                condition: (w) => w.length >= 25 },
  { id: 'early_bird',   icon: '🌅', label: 'Early Bird',   desc: 'Log a workout before 8AM',         condition: (w) => w.some(x => x.hour !== undefined && x.hour < 8) },
  { id: 'night_owl',    icon: '🦉', label: 'Night Owl',    desc: 'Log a workout after 8PM',          condition: (w) => w.some(x => x.hour !== undefined && x.hour >= 20) },
  { id: 'week_goal',    icon: '🎯', label: 'Goal Crusher', desc: 'Hit your weekly workout goal',     condition: (w, _, weeklyDone, weeklyGoal) => weeklyGoal > 0 && weeklyDone >= weeklyGoal },
];

// ─── AUDIO HELPERS ────────────────────────────────────────────────────────────
function playTone(freq = 440, duration = 0.3, type = 'sine') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function playFastCue()   { playTone(880, 0.2, 'square'); setTimeout(() => playTone(1100, 0.2, 'square'), 200); }
function playSlowCue()   { playTone(440, 0.4, 'sine'); }
function playFinishCue() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.3), i * 200)); }

// ─── FORMAT HELPERS ───────────────────────────────────────────────────────────
const fmtTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
const fmtDate = (ts) => ts?.toDate ? ts.toDate().toLocaleDateString() : 'Just now';
const getHour  = (ts) => ts?.toDate ? ts.toDate().getHours() : new Date().getHours();

// ─── RATING MODAL (outside App to prevent remount on every render) ────────────
function RatingModal({ show, darkMode, card, pendingRating, setPendingRating,
  heartRate, setHeartRate, weight, setWeight, notes, setNotes,
  onSave, onSkip }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className={`${card} rounded-[32px] p-6 w-full max-w-md`}
          >
            <h2 className="font-display text-2xl font-black mb-1">Workout Complete! 🎉</h2>
            <p className="opacity-60 text-sm mb-6">How did it feel?</p>

            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { key: 'easy',   emoji: '😊', label: 'Easy',   color: 'from-green-400 to-emerald-500' },
                { key: 'medium', emoji: '😤', label: 'Medium', color: 'from-yellow-400 to-orange-500' },
                { key: 'hard',   emoji: '🥵', label: 'Hard',   color: 'from-red-400 to-rose-600' }
              ].map(r => (
                <button
                  key={r.key}
                  onClick={() => setPendingRating(r.key)}
                  className={`py-4 rounded-2xl font-bold transition-all ${pendingRating === r.key ? `bg-gradient-to-br ${r.color} text-white scale-105 shadow-lg` : darkMode ? 'bg-white/10' : 'bg-white/50'}`}
                >
                  <div className="text-2xl">{r.emoji}</div>
                  <div className="text-xs mt-1">{r.label}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-xs opacity-60 mb-1 flex items-center gap-1"><Heart size={12}/> Heart Rate (bpm)</label>
                <input
                  type="number"
                  value={heartRate}
                  onChange={e => setHeartRate(e.target.value)}
                  placeholder="e.g. 130"
                  className={`w-full px-4 py-2 rounded-xl text-sm ${darkMode ? 'bg-white/10 text-white' : 'bg-white/70 text-slate-900'} outline-none border border-transparent focus:border-violet-400`}
                />
              </div>
              <div>
                <label className="text-xs opacity-60 mb-1 flex items-center gap-1"><Weight size={12}/> Weight (kg)</label>
                <input
                  type="number"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  placeholder="e.g. 68.5"
                  className={`w-full px-4 py-2 rounded-xl text-sm ${darkMode ? 'bg-white/10 text-white' : 'bg-white/70 text-slate-900'} outline-none border border-transparent focus:border-violet-400`}
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="text-xs opacity-60 mb-1 block">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="How did it go? Any aches, wins, etc."
                rows={2}
                className={`w-full px-4 py-2 rounded-xl text-sm resize-none ${darkMode ? 'bg-white/10 text-white' : 'bg-white/70 text-slate-900'} outline-none border border-transparent focus:border-violet-400`}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={onSkip}
                className="flex-1 py-3 rounded-2xl font-bold opacity-60 hover:opacity-100 transition border border-current"
              >
                Skip
              </button>
              <button
                onClick={onSave}
                disabled={!pendingRating}
                className={`flex-1 py-3 rounded-2xl font-bold text-white transition ${pendingRating ? 'bg-gradient-to-r from-violet-500 to-blue-500 hover:scale-105' : 'bg-gray-400 cursor-not-allowed'}`}
              >
                Save Workout
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── PROFILE AVATAR (outside App to prevent remount on every render) ──────────
function ProfileAvatar({ user, size = 'w-16 h-16', textSize = 'text-2xl', border = 'border-4 border-white/30' }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (!imgFailed && user.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt="avatar"
        className={`${size} rounded-full ${border} object-cover`}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div className={`${size} rounded-full ${border} bg-white/20 flex items-center justify-center ${textSize} font-black`}>
      {user.displayName?.charAt(0).toUpperCase() || '?'}
    </div>
  );
}

// ─── BOTTOM NAV (outside App to prevent remount on every render) ──────────────
const navItems = [
  { id: 'timer',     icon: <Timer size={18}/>,        label: 'Timer'    },
  { id: 'dashboard', icon: <Activity size={18}/>,     label: 'Stats'    },
  { id: 'calendar',  icon: <CalendarDays size={18}/>, label: 'Calendar' },
  { id: 'profile',   icon: <User size={18}/>,         label: 'Profile'  },
  { id: 'settings',  icon: <Settings size={18}/>,     label: 'Settings' },
];

function BottomNav({ view, setView, card }) {
  return (
    <div className={`fixed bottom-4 left-4 right-4 ${card} rounded-full p-2 flex justify-around z-40`}>
      {navItems.map(n => (
        <button
          key={n.id}
          onClick={() => setView(n.id)}
          className={`flex flex-col items-center px-3 py-2 rounded-full text-xs gap-1 transition-all ${view === n.id ? 'bg-gradient-to-r from-violet-500 to-blue-500 text-white' : 'opacity-50 hover:opacity-100'}`}
        >
          {n.icon}
          <span className="hidden sm:block">{n.label}</span>
        </button>
      ))}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('timer');

  // ── TIMER STATE ──────────────────────────────────────────────────────────
  const SESSION_DEFAULT = 1800;
  const [totalTime,   setTotalTime]   = useState(SESSION_DEFAULT);
  const [phaseTime,   setPhaseTime]   = useState(0);
  const [isFastPhase, setIsFastPhase] = useState(false);
  const [isRunning,   setIsRunning]   = useState(false);
  const isFastRef = useRef(false);

  // ── SETTINGS ─────────────────────────────────────────────────────────────
  const [darkMode,       setDarkMode]       = useState(false);
  const [fastDuration,   setFastDuration]   = useState(60);
  const [slowDuration,   setSlowDuration]   = useState(90);
  const [sessionMinutes, setSessionMinutes] = useState(30);
  const [weeklyGoal,     setWeeklyGoal]     = useState(3);
  const [tempSettings,   setTempSettings]   = useState(null);

  // ── USER DATA ─────────────────────────────────────────────────────────────
  const [workouts, setWorkouts] = useState([]);
  const [xp,       setXp]       = useState(0);
  const [level,    setLevel]    = useState(1);
  const [badges,   setBadges]   = useState([]);

  // ── RATING MODAL ─────────────────────────────────────────────────────────
  const [pendingRating, setPendingRating] = useState(null);
  const [heartRate,     setHeartRate]     = useState('');
  const [weight,        setWeight]        = useState('');
  const [notes,         setNotes]         = useState('');
  const [showRating,    setShowRating]    = useState(false);

  // ── SAVE USER SETTINGS TO FIRESTORE ──────────────────────────────────────
  const saveUserSettings = async (uid, settings) => {
    try {
      await setDoc(doc(db, 'userSettings', uid), settings, { merge: true });
    } catch (e) { console.error(e); }
  };

  // ── LOAD USER SETTINGS FROM FIRESTORE ────────────────────────────────────
  const loadUserSettings = async (uid) => {
    try {
      const snap = await getDoc(doc(db, 'userSettings', uid));
      if (snap.exists()) {
        const s = snap.data();
        if (s.darkMode       !== undefined) setDarkMode(s.darkMode);
        if (s.fastDuration)                 setFastDuration(s.fastDuration);
        if (s.slowDuration)                 setSlowDuration(s.slowDuration);
        if (s.sessionMinutes)               setSessionMinutes(s.sessionMinutes);
        if (s.weeklyGoal)                   setWeeklyGoal(s.weeklyGoal);
        if (s.sessionMinutes && !isRunning) setTotalTime(s.sessionMinutes * 60);
        if (s.slowDuration)                 setPhaseTime(s.slowDuration);
      }
    } catch (e) { console.error(e); }
  };

  // ── AUTH ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await loadUserSettings(u.uid);
        fetchWorkouts(u.uid);
      } else {
        setIsRunning(false);
        setTotalTime(SESSION_DEFAULT);
        setPhaseTime(90);
        setIsFastPhase(false);
        isFastRef.current = false;
        window.speechSynthesis?.cancel();
        setWorkouts([]);
        setXp(0);
        setLevel(1);
        setBadges([]);
        setDarkMode(false);
        setFastDuration(60);
        setSlowDuration(90);
        setSessionMinutes(30);
        setWeeklyGoal(3);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => { setPhaseTime(slowDuration); }, [slowDuration]);

  // ── FETCH WORKOUTS ────────────────────────────────────────────────────────
  const fetchWorkouts = async (userId) => {
    try {
      const q  = query(collection(db, 'workouts'), where('userId', '==', userId));
      const qs = await getDocs(q);
      const data = qs.docs.map((d) => ({
        ...d.data(),
        date: fmtDate(d.data().createdAt),
        hour: getHour(d.data().createdAt)
      })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      setWorkouts(data);
      const totalXP = data.length * 25;
      setXp(totalXP);
      setLevel(Math.floor(totalXP / 100) + 1);

      const streak     = calcStreak(data);
      const weeklyDone = getThisWeekCount(data);
      const earned = BADGES.filter(b => b.condition(data, streak, weeklyDone, weeklyGoal)).map(b => b.id);
      setBadges(earned);
    } catch (e) { console.error(e); }
  };

  // ── STREAK ────────────────────────────────────────────────────────────────
  const calcStreak = (data) => {
    const dates = [...new Set(data.map(w => w.date))];
    return dates.length;
  };

  const getThisWeekCount = (data) => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - now.getDay() + 1);
    mon.setHours(0, 0, 0, 0);
    return data.filter(w => {
      const d = w.createdAt?.toDate?.() || new Date();
      return d >= mon;
    }).length;
  };

  const streak     = calcStreak(workouts);
  const weeklyDone = getThisWeekCount(workouts);
  const weeklyPct  = Math.min((weeklyDone / Math.max(weeklyGoal, 1)) * 100, 100);

  // ── SPEECH ────────────────────────────────────────────────────────────────
  const speak = (text) => {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1; u.pitch = 1.1;
      window.speechSynthesis.speak(u);
    }
  };

  // ── DARK MODE TOGGLE ──────────────────────────────────────────────────────
  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (user) saveUserSettings(user.uid, { darkMode: next });
  };

  // ── TIMER TOGGLE ──────────────────────────────────────────────────────────
  const sessionSecs = sessionMinutes * 60;

  const toggleTimer = () => {
    if (!isRunning && totalTime === sessionSecs) {
      speak("Workout started. Let's go!");
      playSlowCue();
    }
    setIsRunning(r => !r);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTotalTime(sessionSecs);
    setPhaseTime(slowDuration);
    setIsFastPhase(false);
    isFastRef.current = false;
    window.speechSynthesis.cancel();
  };

  useEffect(() => { isFastRef.current = isFastPhase; }, [isFastPhase]);

  useEffect(() => {
    if (!isRunning) { setTotalTime(sessionMinutes * 60); }
  }, [sessionMinutes]);

  // ── TIMER LOOP ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) return;
    if (totalTime <= 0) {
      setIsRunning(false);
      speak('Workout complete! Great job!');
      playFinishCue();
      setShowRating(true);
      return;
    }

    const id = setInterval(() => {
      setTotalTime(t => t - 1);
      setPhaseTime(p => {
        if (p <= 1) {
          const next = !isFastRef.current;
          setIsFastPhase(next);
          isFastRef.current = next;
          if (next) {
            speak('Speed up! Fast walk!');
            playFastCue();
          } else {
            speak('Recover. Slow it down.');
            playSlowCue();
          }
          return next ? fastDuration : slowDuration;
        }
        return p - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [isRunning, totalTime, fastDuration, slowDuration]);

  // ── SAVE WORKOUT ──────────────────────────────────────────────────────────
  const saveWorkout = async () => {
    if (!user || !pendingRating) return;
    const efforts = { easy: 1, medium: 2, hard: 3 };
    const bonusXP  = efforts[pendingRating] * 5;
    const workoutData = {
      userId:    user.uid,
      minutes:   sessionMinutes,
      calories:  Math.round(sessionMinutes * 6),
      distance:  parseFloat((sessionMinutes * 0.083).toFixed(2)),
      rating:    pendingRating,
      heartRate: heartRate ? Number(heartRate) : null,
      weight:    weight    ? Number(weight)    : null,
      notes:     notes || null,
      bonusXP,
      createdAt: Timestamp.now()
    };
    try {
      await addDoc(collection(db, 'workouts'), workoutData);
      await fetchWorkouts(user.uid);
      setShowRating(false);
      setPendingRating(null);
      setHeartRate(''); setWeight(''); setNotes('');
      resetTimer();
      setView('dashboard');
    } catch (e) { console.error(e); }
  };

  // ── CHART DATA ────────────────────────────────────────────────────────────
  const chartData = [...workouts].reverse().slice(-7).map((w, i) => ({
    day:      `#${i+1}`,
    minutes:  w.minutes,
    calories: w.calories
  }));

  // ── CALENDAR DATES ────────────────────────────────────────────────────────
  const workoutDates = new Set(workouts.map(w => w.date));
  const tileClassName = ({ date }) => {
    const d = date.toLocaleDateString();
    return workoutDates.has(d) ? 'workout-day' : null;
  };

  // ── PROGRESS ──────────────────────────────────────────────────────────────
  const progress = ((sessionSecs - totalTime) / sessionSecs) * 100;

  // ── THEME ─────────────────────────────────────────────────────────────────
  const bg = darkMode
    ? 'bg-[#0a0a14] text-white'
    : 'bg-gradient-to-br from-slate-100 via-blue-50 to-violet-100 text-slate-900';

  const card = darkMode
    ? 'bg-white/5 border border-white/10 backdrop-blur-xl'
    : 'bg-white/60 border border-white/40 backdrop-blur-xl shadow-sm';

  // ── PERSONAL RECORDS ──────────────────────────────────────────────────────
  const longestStreak = streak;
  const totalMinutes  = workouts.reduce((a, w) => a + (w.minutes || 0), 0);
  const totalCalories = workouts.reduce((a, w) => a + (w.calories || 0), 0);
  const avgHeartRate  = (() => {
    const hrs = workouts.filter(w => w.heartRate).map(w => w.heartRate);
    return hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
  })();

  // ── SHARED MODAL PROPS ────────────────────────────────────────────────────
  const ratingModalProps = {
    show: showRating,
    darkMode,
    card,
    pendingRating,
    setPendingRating,
    heartRate,
    setHeartRate,
    weight,
    setWeight,
    notes,
    setNotes,
    onSave: saveWorkout,
    onSkip: () => { setShowRating(false); resetTimer(); },
  };

  // ── SHARED NAV PROPS ──────────────────────────────────────────────────────
  const bottomNavProps = { view, setView, card };

  // ══════════════════════════════════════════════════════════════════════════
  // LOGIN
  // ══════════════════════════════════════════════════════════════════════════
  if (!user) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${bg}`}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap');*{font-family:'DM Sans',sans-serif}h1,h2,h3,.font-display{font-family:'Syne',sans-serif}`}</style>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${card} p-10 rounded-[40px] text-center max-w-sm w-full`}
        >
          <div className="text-6xl mb-4">🚶</div>
          <h1 className="font-display text-4xl font-black mb-2">Interval Walker</h1>
          <p className="opacity-60 mb-8 text-sm">Smart interval training • Analytics • Streak tracking</p>
          <button
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="bg-gradient-to-r from-violet-500 to-blue-500 text-white px-8 py-4 rounded-2xl font-bold w-full hover:scale-105 transition-transform shadow-lg"
          >
            Continue with Google
          </button>
        </motion.div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIMER VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'timer') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 pb-28 transition-all duration-500 ${bg}`}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap');*{font-family:'DM Sans',sans-serif}h1,h2,h3,.font-display{font-family:'Syne',sans-serif}`}</style>
        <RatingModal {...ratingModalProps} />

        <motion.div
          key={isFastPhase ? 'fast' : 'slow'}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-8 px-6 py-2 rounded-full text-sm font-bold ${isFastPhase ? 'bg-rose-500 text-white' : 'bg-sky-500 text-white'}`}
        >
          {isFastPhase ? '⚡ FAST WALK' : '🌿 RECOVERY'}
        </motion.div>

        <motion.div
          animate={{ scale: isRunning ? [1, 1.02, 1] : 1 }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-64 h-64 mb-8"
        >
          <CircularProgressbar
            value={progress}
            text={fmtTime(phaseTime)}
            styles={buildStyles({
              pathColor: isFastPhase ? '#f43f5e' : '#0ea5e9',
              trailColor: darkMode ? '#1e293b' : '#dbeafe',
              textColor: darkMode ? '#ffffff' : '#0f172a',
              textSize: '14px',
              strokeLinecap: 'round'
            })}
          />
        </motion.div>

        <div className="w-64 mb-2">
          <div className="flex justify-between text-xs opacity-60 mb-1">
            <span>Session</span>
            <span>{fmtTime(totalTime)} left</span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-white/10' : 'bg-black/10'}`}>
            <motion.div
              className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="text-center mb-8 mt-4">
          <p className="opacity-60 text-sm">
            Phase ends in <span className="font-bold">{fmtTime(phaseTime)}</span> · Session <span className="font-bold">{Math.round(progress)}%</span> done
          </p>
        </div>

        <div className="w-full max-w-xs flex flex-col gap-3">
          <button
            onClick={toggleTimer}
            className={`py-5 rounded-[24px] text-xl font-black shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
              isRunning
                ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white'
                : 'bg-gradient-to-r from-violet-500 to-blue-500 text-white'
            }`}
          >
            {isRunning ? <><Pause size={24}/> PAUSE</> : <><Play size={24}/> START</>}
          </button>

          <div className="flex gap-3">
            <button onClick={resetTimer} className={`flex-1 py-3 rounded-[20px] ${card} font-bold flex items-center justify-center gap-2`}>
              <RotateCcw size={16}/> Reset
            </button>
            <button onClick={() => setView('dashboard')} className={`flex-1 py-3 rounded-[20px] ${card} font-bold flex items-center justify-center gap-2`}>
              <BarChart3 size={16}/> Stats
            </button>
          </div>
        </div>

        <BottomNav {...bottomNavProps} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'dashboard') {
    return (
      <div className={`min-h-screen p-5 pb-28 ${bg}`}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap');*{font-family:'DM Sans',sans-serif}h1,h2,h3,.font-display{font-family:'Syne',sans-serif}`}</style>

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="font-display text-3xl font-black">Hey {user.displayName.split(' ')[0]} 👋</h1>
            <p className="opacity-60 text-sm">Keep the momentum going.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={toggleDarkMode} className={`p-3 rounded-2xl ${card}`}>
              {darkMode ? <Sun size={18}/> : <Moon size={18}/>}
            </button>
            <button onClick={() => signOut(auth)} className="p-3 rounded-2xl bg-rose-500 text-white">
              <LogOut size={18}/>
            </button>
          </div>
        </div>

        {/* Level card */}
        <div className="bg-gradient-to-r from-violet-600 to-blue-500 rounded-[28px] p-5 text-white shadow-xl mb-4">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="text-xs opacity-80 uppercase tracking-widest">Level</p>
              <p className="text-5xl font-black tabular-nums">{level}</p>
            </div>
            <Trophy size={56} className="opacity-80"/>
          </div>
          <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden">
            <div className="bg-white h-full rounded-full transition-all" style={{ width: `${xp % 100}%` }}/>
          </div>
          <p className="text-xs mt-2 opacity-80">{xp} XP · {100 - (xp % 100)} XP to next level</p>
        </div>

        {/* Weekly Goal */}
        <div className={`${card} rounded-[28px] p-5 mb-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-violet-500"/>
              <h3 className="font-display font-black text-lg">Weekly Goal</h3>
            </div>
            <span className="text-sm font-bold">{weeklyDone}/{weeklyGoal} workouts</span>
          </div>
          <div className={`h-3 rounded-full overflow-hidden ${darkMode ? 'bg-white/10' : 'bg-black/10'}`}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${weeklyPct}%` }}
              className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
            />
          </div>
          {weeklyDone >= weeklyGoal && (
            <p className="text-emerald-500 font-bold text-sm mt-2">🎯 Goal achieved this week!</p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { icon: <Flame className="text-orange-400"/>,  value: streak,             label: 'Day Streak',      bg: 'from-orange-400/20 to-rose-400/20'  },
            { icon: <Zap className="text-yellow-400"/>,    value: `${totalMinutes}m`,  label: 'Total Minutes',   bg: 'from-yellow-400/20 to-amber-400/20' },
            { icon: <Activity className="text-blue-400"/>, value: workouts.length,     label: 'Workouts',        bg: 'from-blue-400/20 to-indigo-400/20'  },
            { icon: <Star className="text-pink-400"/>,     value: `${totalCalories}`,  label: 'Calories Burned', bg: 'from-pink-400/20 to-rose-400/20'    },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${card} rounded-[24px] p-4 bg-gradient-to-br ${s.bg}`}>
              <div className="flex justify-between items-start mb-2">
                {s.icon}
                <span className="text-2xl font-black tabular-nums leading-none">{s.value}</span>
              </div>
              <p className="opacity-60 text-xs">{s.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        <div className={`${card} rounded-[28px] p-5 mb-4`}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-violet-500"/>
            <h3 className="font-display font-black text-lg">Activity (Last 7)</h3>
          </div>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', background: darkMode ? '#1e293b' : '#fff' }}/>
                <Bar dataKey="minutes" fill="url(#grad)" radius={[6, 6, 0, 0]}/>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed"/>
                    <stop offset="100%" stopColor="#3b82f6"/>
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Badges */}
        <div className="mb-4">
          <h3 className="font-display font-black text-xl mb-3">Badges</h3>
          <div className="grid grid-cols-4 gap-2">
            {BADGES.map(b => {
              const earned = badges.includes(b.id);
              return (
                <div key={b.id} className={`${card} rounded-2xl p-3 text-center transition-all ${earned ? '' : 'opacity-30 grayscale'}`}>
                  <div className="text-2xl mb-1">{b.icon}</div>
                  <p className="text-[10px] font-bold leading-tight">{b.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Walks */}
        <div>
          <h3 className="font-display font-black text-xl mb-3">Recent Walks</h3>
          <div className="space-y-2">
            {workouts.slice(0, 5).map((w, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className={`${card} p-4 rounded-[20px] flex justify-between items-center`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{w.rating === 'easy' ? '😊' : w.rating === 'medium' ? '😤' : '🥵'}</span>
                    <span className="font-bold capitalize">{w.rating || 'Completed'}</span>
                  </div>
                  <p className="opacity-50 text-xs mt-1">{w.date} · {w.minutes} min</p>
                  {w.notes && <p className="opacity-60 text-xs mt-1 italic">"{w.notes}"</p>}
                </div>
                <div className="text-right text-sm">
                  <p className="font-black">{w.calories} cal</p>
                  {w.heartRate && <p className="opacity-50 text-xs">❤️ {w.heartRate} bpm</p>}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <BottomNav {...bottomNavProps} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CALENDAR VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'calendar') {
    return (
      <div className={`min-h-screen p-5 pb-28 ${bg}`}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap');
          *{font-family:'DM Sans',sans-serif}
          h1,h2,h3,.font-display{font-family:'Syne',sans-serif}
          .react-calendar{background:transparent!important;border:none!important;width:100%!important;font-family:inherit!important}
          .react-calendar__tile{border-radius:12px!important;padding:12px 4px!important;font-size:13px!important}
          .react-calendar__tile--active{background:linear-gradient(135deg,#7c3aed,#3b82f6)!important;color:#fff!important}
          .workout-day{background:rgba(16,185,129,0.25)!important;font-weight:bold!important;color:${darkMode ? '#6ee7b7' : '#065f46'}!important}
          .react-calendar__navigation button{font-family:'Syne',sans-serif!important;font-weight:800!important;font-size:15px!important}
        `}</style>

        <div className="flex items-center gap-3 mb-6">
          <CalendarDays size={24} className="text-violet-500"/>
          <h1 className="font-display text-3xl font-black">Calendar</h1>
        </div>

        <div className={`${card} rounded-[28px] p-4 mb-4`}>
          <Calendar tileClassName={tileClassName}/>
        </div>

        <div className={`${card} rounded-[28px] p-5 mb-4`}>
          <h3 className="font-display font-black text-lg mb-3">Month Summary</h3>
          <div className="flex gap-4">
            <div>
              <p className="text-3xl font-black tabular-nums text-violet-500">{workoutDates.size}</p>
              <p className="opacity-60 text-sm">Active days</p>
            </div>
            <div>
              <p className="text-3xl font-black tabular-nums text-emerald-500">{totalMinutes}m</p>
              <p className="opacity-60 text-sm">Total minutes</p>
            </div>
            <div>
              <p className="text-3xl font-black tabular-nums text-orange-500">{streak}</p>
              <p className="opacity-60 text-sm">Best streak</p>
            </div>
          </div>
        </div>

        <div className={`${card} rounded-[28px] p-5`}>
          <h3 className="font-display font-black text-lg mb-3">Workout Log</h3>
          <div className="space-y-2">
            {workouts.slice(0, 10).map((w, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${w.rating === 'hard' ? 'bg-rose-500' : w.rating === 'medium' ? 'bg-yellow-500' : 'bg-emerald-500'}`}/>
                <span className="text-sm opacity-60 w-24 flex-shrink-0">{w.date}</span>
                <span className="text-sm font-bold">{w.minutes} min</span>
                <span className="text-xs opacity-50 capitalize">{w.rating}</span>
                {w.heartRate && <span className="text-xs opacity-40">❤️{w.heartRate}</span>}
              </div>
            ))}
          </div>
        </div>

        <BottomNav {...bottomNavProps} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROFILE VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'profile') {
    return (
      <div className={`min-h-screen p-5 pb-28 ${bg}`}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap');*{font-family:'DM Sans',sans-serif}h1,h2,h3,.font-display{font-family:'Syne',sans-serif}`}</style>

        <div className="bg-gradient-to-br from-violet-600 to-blue-600 rounded-[28px] p-6 text-white mb-4">
          <div className="flex items-center gap-4 mb-4">
            <ProfileAvatar user={user} />
            <div>
              <h1 className="font-display text-2xl font-black">{user.displayName}</h1>
              <p className="opacity-70 text-sm">{user.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="font-black text-2xl tabular-nums">{level}</p>
              <p className="text-xs opacity-70">Level</p>
            </div>
            <div>
              <p className="font-black text-2xl tabular-nums">{xp}</p>
              <p className="text-xs opacity-70">XP</p>
            </div>
            <div>
              <p className="font-black text-2xl tabular-nums">{badges.length}</p>
              <p className="text-xs opacity-70">Badges</p>
            </div>
          </div>
        </div>

        <div className={`${card} rounded-[28px] p-5 mb-4`}>
          <div className="flex items-center gap-2 mb-4">
            <Medal size={18} className="text-yellow-500"/>
            <h3 className="font-display font-black text-lg">Personal Records</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Total Workouts',  value: workouts.length,                                              unit: 'sessions' },
              { label: 'Total Distance',  value: workouts.reduce((a, w) => a + (w.distance || 0), 0).toFixed(1), unit: 'km'    },
              { label: 'Total Time',      value: totalMinutes,                                                  unit: 'minutes' },
              { label: 'Calories Burned', value: totalCalories,                                                 unit: 'kcal'    },
              { label: 'Longest Streak',  value: longestStreak,                                                 unit: 'days'    },
              { label: 'Avg Heart Rate',  value: avgHeartRate || '–',                                           unit: avgHeartRate ? 'bpm' : '' },
            ].map((r, i) => (
              <div key={i} className="flex justify-between items-center">
                <span className="opacity-60 text-sm">{r.label}</span>
                <span className="font-black tabular-nums">{r.value} <span className="font-normal opacity-50 text-sm">{r.unit}</span></span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${card} rounded-[28px] p-5 mb-4`}>
          <div className="flex items-center gap-2 mb-4">
            <Award size={18} className="text-violet-500"/>
            <h3 className="font-display font-black text-lg">All Badges</h3>
          </div>
          <div className="space-y-3">
            {BADGES.map(b => {
              const earned = badges.includes(b.id);
              return (
                <div key={b.id} className={`flex items-center gap-3 ${earned ? '' : 'opacity-40'}`}>
                  <span className="text-2xl">{b.icon}</span>
                  <div className="flex-1">
                    <p className="font-bold text-sm">{b.label}</p>
                    <p className="opacity-50 text-xs">{b.desc}</p>
                  </div>
                  {earned ? <Check size={16} className="text-emerald-500"/> : <X size={16} className="opacity-30"/>}
                </div>
              );
            })}
          </div>
        </div>

        <BottomNav {...bottomNavProps} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SETTINGS VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'settings') {
    const draft = tempSettings || { fastDuration, slowDuration, sessionMinutes, weeklyGoal };

    const updateDraft = (key, val) => setTempSettings(prev => ({ ...(prev || draft), [key]: val }));

    const saveSettings = () => {
      if (!tempSettings) return;
      setFastDuration(tempSettings.fastDuration);
      setSlowDuration(tempSettings.slowDuration);
      setSessionMinutes(tempSettings.sessionMinutes);
      setWeeklyGoal(tempSettings.weeklyGoal);
      if (!isRunning) {
        setTotalTime(tempSettings.sessionMinutes * 60);
        setPhaseTime(tempSettings.slowDuration);
      }
      if (user) saveUserSettings(user.uid, tempSettings);
      setTempSettings(null);
    };

    return (
      <div className={`min-h-screen p-5 pb-28 ${bg}`}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap');*{font-family:'DM Sans',sans-serif}h1,h2,h3,.font-display{font-family:'Syne',sans-serif}`}</style>

        <div className="flex items-center gap-3 mb-6">
          <Settings size={24} className="text-violet-500"/>
          <h1 className="font-display text-3xl font-black">Settings</h1>
        </div>

        <div className={`${card} rounded-[28px] p-5 mb-4`}>
          <h3 className="font-display font-black text-lg mb-4">Interval Durations</h3>
          {[
            { label: '⚡ Fast Walk Duration', key: 'fastDuration', min: 10, max: 300, step: 5 },
            { label: '🌿 Recovery Duration',  key: 'slowDuration', min: 10, max: 300, step: 5 },
          ].map(s => (
            <div key={s.key} className="mb-5">
              <div className="flex justify-between mb-2">
                <label className="text-sm font-bold">{s.label}</label>
                <span className="font-black text-violet-500">{fmtTime(draft[s.key])}</span>
              </div>
              <input
                type="range"
                min={s.min} max={s.max} step={s.step}
                value={draft[s.key]}
                onChange={e => updateDraft(s.key, Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-xs opacity-40 mt-1">
                <span>{fmtTime(s.min)}</span>
                <span>{fmtTime(s.max)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className={`${card} rounded-[28px] p-5 mb-4`}>
          <h3 className="font-display font-black text-lg mb-4">Session</h3>
          <div className="mb-5">
            <div className="flex justify-between mb-2">
              <label className="text-sm font-bold">⏱ Session Length</label>
              <span className="font-black text-violet-500">{draft.sessionMinutes} min</span>
            </div>
            <input
              type="range" min={5} max={60} step={5}
              value={draft.sessionMinutes}
              onChange={e => updateDraft('sessionMinutes', Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-xs opacity-40 mt-1"><span>5 min</span><span>60 min</span></div>
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-bold">🎯 Weekly Goal</label>
              <span className="font-black text-violet-500">{draft.weeklyGoal}×/week</span>
            </div>
            <input
              type="range" min={1} max={7} step={1}
              value={draft.weeklyGoal}
              onChange={e => updateDraft('weeklyGoal', Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-xs opacity-40 mt-1"><span>1</span><span>7</span></div>
          </div>
        </div>

        <div className={`${card} rounded-[28px] p-5 mb-4`}>
          <h3 className="font-display font-black text-lg mb-4">Appearance</h3>
          <div className="flex items-center justify-between">
            <span className="font-bold">Dark Mode</span>
            <button
              onClick={toggleDarkMode}
              className={`w-12 h-6 rounded-full transition-all relative ${darkMode ? 'bg-violet-500' : 'bg-gray-300'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${darkMode ? 'left-6' : 'left-0.5'}`}/>
            </button>
          </div>
        </div>

        {tempSettings && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={saveSettings}
            className="w-full py-4 rounded-[24px] bg-gradient-to-r from-violet-500 to-blue-500 text-white font-black text-lg shadow-xl mb-4"
          >
            Save Changes
          </motion.button>
        )}

        <div className={`${card} rounded-[28px] p-5`}>
          <h3 className="font-display font-black text-lg mb-4 text-rose-500">Account</h3>
          <button onClick={() => signOut(auth)} className="flex items-center gap-2 text-rose-500 font-bold">
            <LogOut size={16}/> Sign Out
          </button>
        </div>

        <BottomNav {...bottomNavProps} />
      </div>
    );
  }

  return null;
}

export default App;