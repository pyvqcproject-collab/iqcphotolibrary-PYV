/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { initAuth, logout } from './lib/google-auth';
import { Auth } from './Auth';
import { QCForm } from './QCForm';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setNeedsAuth(false);
        setLoading(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
      </div>
    );
  }

  if (needsAuth || !user || !token) {
    return <Auth onSignIn={(u, t) => {
      setUser(u);
      setToken(t);
      setNeedsAuth(false);
    }} />;
  }

  return <QCForm user={user} token={token} onLogout={handleLogout} />;
}


