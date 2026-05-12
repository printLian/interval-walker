import { useState, useEffect } from 'react';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp } from "firebase/firestore";

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('timer'); // 'timer' or 'dashboard'
  
  // Timer State (30 mins = 1800 secs, 5 mins = 300 secs)
  const [totalTime, setTotalTime] = useState(1800); 
  const [phaseTime, setPhaseTime] = useState(300);
  const [isFastPhase, setIsFastPhase] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [workouts, setWorkouts] = useState([]);

  // --- NEW: FETCH WORKOUTS FROM CLOUD ---
  const fetchWorkouts = async (userId) => {
    try {
      // 1. Remove the 'orderBy' line. This is what's blocking the fetch.
      const q = query(
        collection(db, "workouts"), 
        where("userId", "==", userId)
      );
      
      const querySnapshot = await getDocs(q);
      
      const cloudData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        let displayDate = "Just now";

        // 2. Safety check for the date
        if (data.createdAt && data.createdAt.toDate) {
          displayDate = data.createdAt.toDate().toLocaleDateString();
        } else if (data.date) {
          displayDate = data.date;
        }

        return { ...data, date: displayDate };
      });

      // 3. Manually sort in JavaScript so you don't need a Firebase Index
      const sortedData = cloudData.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      
      setWorkouts(sortedData);
    } catch (error) {
      console.error("Error fetching workouts:", error);
    }
  };

  // Auth Listener & Initial Data Load
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Load cloud data instead of localStorage
        fetchWorkouts(currentUser.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // Text-to-Speech Helper
  const speak = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  // --- TIMER CONTROL FUNCTIONS ---

  const toggleTimer = () => {
    if (!isRunning && totalTime === 1800) {
      speak("Workout started. Begin with a slow walk.");
    }
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTotalTime(1800);
    setPhaseTime(300);
    setIsFastPhase(false);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // --- UPDATED: SAVE WORKOUT TO CLOUD ---
  const saveWorkout = async (rating) => {
    if (!user) return;

    const workoutData = {
      userId: user.uid,
      minutes: 30,
      rating: rating,
      createdAt: Timestamp.now() // Better for sorting in Firebase
    };

    try {
      await addDoc(collection(db, "workouts"), workoutData);
      // Refresh list from cloud and go to dashboard
      await fetchWorkouts(user.uid); 
      resetTimer(); // Clean up timer after save
      setView('dashboard');
    } catch (e) {
      console.error("Error adding document: ", e);
    }
  };

  // Timer Countdown Logic
  useEffect(() => {
    let interval = null;
    if (isRunning && totalTime > 0) {
      interval = setInterval(() => {
        setTotalTime((prev) => prev - 1);
        setPhaseTime((prev) => {
          if (prev <= 1) {
            const nextPhaseFast = !isFastPhase;
            setIsFastPhase(nextPhaseFast);
            speak(nextPhaseFast ? "Time to walk faster!" : "Catch your breath, walk slower.");
            return 300; 
          }
          return prev - 1;
        });
      }, 1000);
    } else if (totalTime === 0 && isRunning) {
      setIsRunning(false);
      speak("Workout complete. Great job!");
      saveWorkout('😌'); 
    }
    return () => clearInterval(interval);
  }, [isRunning, totalTime, isFastPhase]);

  // --- STAT HELPERS ---

  const calculateStreak = () => {
    if (workouts.length === 0) return 0;
    // Streak logic based on cloud data dates
    const uniqueDates = [...new Set(workouts.map(w => w.date))];
    return uniqueDates.length;
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- VIEWS ---

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
        <h1 className="text-5xl font-black mb-4 text-blue-600 tracking-tight">Interval Walker</h1>
        <p className="mb-10 text-slate-500 max-w-xs">Efficient 30-minute training based on Japanese research.</p>
        <button 
          onClick={() => signInWithPopup(auth, googleProvider)}
          className="bg-white border border-slate-200 text-slate-700 font-bold py-4 px-8 rounded-2xl shadow-sm hover:shadow-md transition flex items-center"
        >
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-6 h-6 mr-3" />
          Continue with Google
        </button>
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-slate-50 p-6 pb-24">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Your Progress</h1>
            <p className="text-slate-500">Welcome, {user.displayName.split(' ')[0]}!</p>
          </div>
          <button onClick={() => signOut(auth)} className="text-slate-400 text-sm font-medium">Sign Out</button>
        </header>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Streak</p>
            <p className="text-4xl font-black text-orange-500">{calculateStreak()}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Total Mins</p>
            <p className="text-4xl font-black text-blue-500">{workouts.length * 30}</p>
          </div>
        </div>

        <h3 className="text-lg font-bold text-slate-800 mb-4">Recent History</h3>
        <div className="space-y-3">
          {workouts.slice(0, 5).map((w, i) => (
            <div key={i} className="bg-white p-4 rounded-2xl flex justify-between items-center border border-slate-100">
              <div className="flex items-center">
                <span className="text-2xl mr-4">{w.rating}</span>
                <div>
                  <p className="font-bold text-slate-800">30 Min Walk</p>
                  <p className="text-xs text-slate-400">{w.date}</p>
                </div>
              </div>
              <div className="text-green-500 font-bold text-sm">+30m</div>
            </div>
          ))}
          {workouts.length === 0 && <p className="text-center text-slate-400 py-10 italic">No walks recorded yet.</p>}
        </div>

        <div className="fixed bottom-6 left-6 right-6 bg-white border border-slate-200 rounded-full p-2 shadow-xl flex justify-around">
          <button onClick={() => setView('dashboard')} className="bg-blue-50 text-blue-600 p-3 px-8 rounded-full font-bold">Stats</button>
          <button onClick={() => setView('timer')} className="text-slate-400 p-3 px-8 rounded-full font-bold">Timer</button>
        </div>
      </div>
    );
  }

  // --- TIMER VIEW ---
  return (
    <div className={`flex flex-col items-center justify-center min-h-screen p-6 transition-colors duration-700 ${isFastPhase ? 'bg-rose-50' : 'bg-sky-50'}`}>
      <div className="text-center mb-12">
        <h2 className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">Total Session</h2>
        <div className="text-4xl font-black text-slate-800 tracking-tighter">{formatTime(totalTime)}</div>
      </div>

      <div className={`w-72 h-72 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-500 border-[12px] ${isFastPhase ? 'bg-rose-500 border-rose-200 text-white' : 'bg-sky-500 border-sky-200 text-white'}`}>
        <p className="text-xs uppercase font-black tracking-widest opacity-70">{isFastPhase ? 'Fast Pace' : 'Slow Pace'}</p>
        <p className="text-7xl font-black leading-none my-2">{formatTime(phaseTime)}</p>
      </div>

      <div className="mt-16 flex flex-col gap-4 w-full max-w-xs">
        <button 
          onClick={toggleTimer}
          className={`w-full py-5 rounded-3xl font-black text-xl shadow-lg transform active:scale-95 transition-all ${isRunning ? 'bg-slate-800 text-white' : 'bg-green-500 text-white'}`}
        >
          {isRunning ? 'PAUSE' : 'START WORKOUT'}
        </button>

        <div className="flex justify-between gap-4">
          <button 
            onClick={resetTimer}
            className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-colors"
          >
            RESET
          </button>
          <button 
            onClick={() => setView('dashboard')}
            className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-colors"
          >
            STATS
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;