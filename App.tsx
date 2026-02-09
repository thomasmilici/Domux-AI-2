import React, { useState, useEffect } from 'react';
import { auth, db, User, onAuthStateChanged, signOut, doc, getDoc } from './services/firebase';
import AuthPage from './components/auth/AuthPage';
import Header from './components/Header';
import Footer from './components/Footer';
import AdminDashboard from './components/admin/AdminDashboard';
import UserDashboard from './components/dashboard/UserDashboard';
import ProjectViewer from './components/ProjectViewer';
import InstallPrompt from './components/InstallPrompt';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdminDashboard, setShowAdminDashboard] = useState(true);
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userAuth) => {
      if (userAuth) {
        const userDocRef = doc(db, 'users', userAuth.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();

          // Check if user is disabled
          if (userData.disabled === true) {
            alert('Il tuo account è stato bloccato. Contatta l\'amministratore per maggiori informazioni.');
            await signOut(auth);
            setUser(null);
            setLoading(false);
            return;
          }

          setUser({ ...userAuth, ...userData } as User);
        } else {
          setUser(userAuth as User);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Wake Lock API to keep screen active
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('Wake Lock attivato - lo schermo rimarrà acceso');

          wakeLock.addEventListener('release', () => {
            console.log('Wake Lock rilasciato');
          });
        } else {
          console.log('Wake Lock API non supportata su questo dispositivo');
        }
      } catch (err: any) {
        console.error(`Errore Wake Lock: ${err.name}, ${err.message}`);
      }
    };

    // Request wake lock when app loads
    requestWakeLock();

    // Re-request wake lock when page becomes visible again
    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock !== null) {
        wakeLock.release().then(() => {
          console.log('Wake Lock rilasciato al cleanup');
        });
      }
    };
  }, []);

  const handleViewProject = (projectId: string) => {
    setViewingProjectId(projectId);
  };

  const handleBackToDashboard = () => {
    setViewingProjectId(null);
  };

  const renderMainContent = () => {
    if (!user) return null;

    // If viewing a specific project
    if (viewingProjectId) {
      return <ProjectViewer projectId={viewingProjectId} user={user} onGoBack={handleBackToDashboard} />;
    }

    const isAdminOrCollaborator = user.role === 'superadmin' || user.role === 'admin' || user.role === 'collaborator';

    // Show toggle only for admin/collaborator
    if (isAdminOrCollaborator && showAdminDashboard) {
      return <AdminDashboard currentUser={user} />;
    }

    return <UserDashboard user={user} onViewProject={handleViewProject} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-100">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-brand-cyan"></div>
      </div>
    );
  }
  
  const toggleDashboard = () => setShowAdminDashboard(prev => !prev);

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col items-center">
      {user ? (
        <>
          <Header user={user} onToggleDashboard={toggleDashboard} isDashboardOpen={showAdminDashboard} />
          <main className="w-full flex-grow p-4 md:p-8 flex justify-center">
            {renderMainContent()}
          </main>
          <Footer />
          <InstallPrompt />
        </>
      ) : (
        <>
          <AuthPage />
          <InstallPrompt />
        </>
      )}
    </div>
  );
};

export default App;