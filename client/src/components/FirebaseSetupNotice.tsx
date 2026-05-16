import { ExternalLink } from 'lucide-react'
import './FirebaseSetupNotice.css'

export function FirebaseSetupNotice() {
  return (
    <div className="firebase-setup">
      <h2>Firebase authentication not configured</h2>
      <p>
        Copy <code>client/.env.example</code> to <code>client/.env</code> and add
        your Firebase web app keys from the{' '}
        <a
          href="https://console.firebase.google.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Firebase Console
          <ExternalLink size={14} />
        </a>
        .
      </p>
      <ol>
        <li>Create a project → Add a Web app</li>
        <li>Enable <strong>Email/Password</strong> and <strong>Google</strong> under Authentication → Sign-in method</li>
        <li>Paste the <code>VITE_FIREBASE_*</code> values into <code>client/.env</code></li>
        <li>Restart <code>npm run dev</code></li>
      </ol>
      <p className="firebase-setup__note">
        Until then, the app runs without sign-in (local mode).
      </p>
    </div>
  )
}
