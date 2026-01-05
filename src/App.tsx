import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './config/firebase';
import { signInAnonymously } from './services/authService';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import './index.css';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTripId, setActiveTripId] = useState<string | null>(
    localStorage.getItem('tripsplit_active_trip')
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        // Auto sign-in anonymously for quick start
        try {
          const anonUser = await signInAnonymously();
          setUser(anonUser);
        } catch (err) {
          console.error('Failed to sign in:', err);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleTripSelect = (tripId: string) => {
    setActiveTripId(tripId);
    localStorage.setItem('tripsplit_active_trip', tripId);
  };

  const handleLeaveTrip = () => {
    setActiveTripId(null);
    localStorage.removeItem('tripsplit_active_trip');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading TripSplit...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center">
        <p className="text-gray-600">Authentication failed. Please refresh.</p>
      </div>
    );
  }

  if (!activeTripId) {
    return <LoginScreen user={user} onTripSelect={handleTripSelect} />;
  }

  return (
    <Dashboard
      user={user}
      tripId={activeTripId}
      onLeaveTrip={handleLeaveTrip}
    />
  );
}

export default App;
