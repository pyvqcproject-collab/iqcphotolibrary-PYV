import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut as firebaseSignOut, signInWithEmailAndPassword, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { auth } from './firebase';

const provider = new GoogleAuthProvider();
// Removed drive.file scope to prevent access_denied errors during Google Auth since we fallback to Firebase Storage anyway.

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const isPasswordUser = user.providerData.length === 0 || user.providerData.some(p => p.providerId === 'password');
      if (cachedAccessToken || isPasswordUser) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken || 'NO_TOKEN');
      } else if (!isSigningIn) {
        // For Google users missing token on reload, let's just let them in with NO_TOKEN
        // The Drive upload will fallback to Firebase Storage if NO_TOKEN
        if (onAuthSuccess) onAuthSuccess(user, 'NO_TOKEN');
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    // Some Google accounts may not grant the exact drive token, or it's unavailable
    const token = credential?.accessToken || 'NO_TOKEN';
    cachedAccessToken = token;

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error.code !== 'auth/popup-closed-by-user') {
      console.error('Sign in error:', error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const emailSignIn = async (email: string, password: string): Promise<{ user: User }> => {
  try {
    isSigningIn = true;
    const result = await signInWithEmailAndPassword(auth, email, password);
    return { user: result.user };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await firebaseSignOut(auth);
  cachedAccessToken = null;
};
