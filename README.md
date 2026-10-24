# 1.6 Pug Finder

Browser matchmaking for Counter-Strike 1.6 5v5 classic pugs, styled in the classic Steam CS 1.6 VGUI olive-green theme. Powered by Firebase Anonymous Auth, Firestore real-time matchmaking, and Firebase Hosting with zero server maintenance.

---

## Features

- **No Steam Login Required**: Enter your player name (up to 16 characters; letters, numbers, spaces, `_`, `.`, `-`). Persistent UID via Firebase Anonymous Auth.
- **Classic VGUI UI**: Authentic Steam CS 1.6 aesthetics (#4c5844 panels, #3e4637 insets, #262b22 dark wells, #6b7a60 borders, bevelled buttons, gold accent #c4b550, CT blue #6f9bd1, T amber #d1a45a).
- **Radar Map Schematics**: Handcrafted top-down inline SVG radar cards for `de_inferno`, `de_dust2`, and `de_mirage` with bombsite callouts A and B.
- **Automated Matchmaking**: Region-based queue (Europe, Americas, Asia) with live counter and progress bar.
- **Snake Draft 5v5 Balancing**: Automatically balances teams by rating descending with the classic pattern `A, B, B, A, A, B, B, A, A, B`.
- **Host Automation & HLDS Integration**: Automatically picks a random player as the host, fetches public IP via ipify, and generates the ready-to-run `hlds.exe` console command line with random 6-character server password.
- **1-Click Connect**: Instant `connect <ip:port>; password <pw>` command with clipboard copy for non-host players.
- **Quorum-Based Elo Rating**: 6 out of 10 player votes determine match result (Win / Loss / Void). Elo starts at 1000, K=24, minimum rating 100.
- **Ranks & Leaderboard**: Recruit (<900), Regular (900), Veteran (1100), Elite (1300), Legend (1500+). Real-time top 20 leaderboard and personal match history.
- **Built-in Sandbox / 10-Player Simulator**: Test the entire 10-player match lifecycle instantly in a single browser window or across real multiple profiles.

---

## Exact Setup Steps

### 1. Create a Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project**, enter a project name (e.g. `cs16-pug-finder`), and complete creation (Google Analytics is optional).

### 2. Enable Anonymous Sign-in
1. In your Firebase project dashboard, go to **Build** -> **Authentication**.
2. Click **Get started**.
3. Under the **Sign-in method** tab, click **Anonymous**.
4. Toggle **Enable** to ON and click **Save**.

### 3. Create Cloud Firestore Database
1. Go to **Build** -> **Firestore Database**.
2. Click **Create database**.
3. Select your preferred Cloud Firestore location (e.g., `nam5 (us-central)` or `eur3 (europe-west)`).
4. Choose **Start in production mode** (or test mode; our `firestore.rules` will be deployed next).
5. Click **Create**.

### 4. Paste Configuration into `firebase-config.js`
1. In your Firebase project settings (click the gear icon ⚙️ next to Project Overview -> **Project settings**).
2. Under the **General** tab, scroll to **Your apps**, and click the Web icon `</>`.
3. Register your app (e.g., `1.6 Pug Finder Web`).
4. Copy the `firebaseConfig` object and paste it into `/firebase-config.js`:
   ```javascript
   export const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project-id.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project-id.firebasestorage.app",
     messagingSenderId: "123456789...",
     appId: "1:123456789:web:abcdef..."
   };
   ```

### 5. Deploy Security Rules and Hosting
Install the Firebase CLI if you haven't already:
```bash
npm install -g firebase-tools
```

Log in and initialize or link your project:
```bash
firebase login
firebase use --add your-project-id
```

Deploy Firestore Security Rules:
```bash
firebase deploy --only firestore:rules
```

Deploy to Firebase Hosting:
```bash
firebase deploy --only hosting
```

### 6. Add Custom Domain (Optional)
1. In Firebase Console, go to **Build** -> **Hosting**.
2. Click **Add custom domain**.
3. Enter your domain (e.g. `pugs.cs16classic.com`) and follow the DNS verification prompts to point your `A` or `CNAME` records to Firebase Hosting.

---

## Security Model & Limitations

### What This Client-Only Architecture Cannot Stop
Because matchmaking and Elo calculation run entirely in client browsers without a dedicated backend server or Cloud Function:
- **Client Forgery / Cheating**: A malicious user who knows how to open DevTools or write custom script requests could fabricate match reports or submit falsified transaction payloads.
- **Collusion**: If a group of 6 colluding players queue together, they could artificially report incorrect match outcomes to inflate ratings.
- **Orchestration**: The security rules enforce that only participants can vote, that rating updates can change by at most 40 Elo per match, and that updates must link to a finished match document. However, genuine server-authoritative validation requires backend execution.

---

## Upgrade to Cloud Functions (Blaze Plan)

To eliminate all client trust and make matchmaking and ratings 100% tamper-proof:

1. **Upgrade Firebase Plan to Blaze (Pay-as-you-go)**:
   Cloud Functions require the Blaze plan (with generous free monthly invocations).

2. **Move Matchmaking to a Scheduled / Callable Cloud Function**:
   - Queue documents remain writeable only by their owner (`queue/{uid}`).
   - A Cloud Function monitors the queue or runs every 5 seconds. When 10 players in a region are ready, the Cloud Function creates the match document in `matches/{id}` and clears the queue items atomically using the Firebase Admin SDK.

3. **Move Result & Elo Calculation to a Firestore Trigger**:
   - Write a Cloud Function triggered on `matches/{id}/reports/{uid}` creation:
     ```javascript
     exports.onMatchReport = functions.firestore
       .document('matches/{matchId}/reports/{uid}')
       .onCreate(async (snap, context) => {
         const { matchId } = context.params;
         // Tally votes server-side
         // When 6 votes agree:
         // 1. Mark match.done = true
         // 2. Compute Elo deltas
         // 3. Atomically update all 10 players/{uid} docs using Admin SDK
       });
     ```

4. **Lock Down `firestore.rules`**:
   Once Cloud Functions perform all updates, remove client write permissions on `matches` and `players.elo`:
   ```rules
   match /players/{uid} {
     allow read: if isSignedIn();
     // Only allow users to change their display name, not elo or win/loss
     allow update: if isUser(uid) && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['elo', 'w', 'l', 'lastMatch']);
   }
   match /matches/{matchId} {
     allow read: if isSignedIn();
     // Matches and ratings can only be written by Cloud Functions (Admin SDK)
     allow write: if false;
   }
   ```

---

## How to Test

### Method A: Built-in 1-Click Simulation (Fastest)
1. Launch the app in your browser.
2. Enter your player name and pick your region.
3. Click **"Find match"**.
4. On the Queue screen, click **"Simulate 9 Players"**.
5. The app automatically simulates 9 regional players joining the queue with varying ratings and map choices.
6. The 10-player threshold triggers the snake draft, selects the top-voted map, generates the server password, assigns teams (CT and T), and transitions all players to the Match Screen.
7. Test the Host IP sharing, the HLDS command line, and vote submission.

### Method B: Testing with 10 Real Browser Profiles
1. Open Google Chrome.
2. Click your profile avatar in the top-right corner -> **Add** (or **Guest Profile**). Create 10 distinct profiles or Guest windows.
3. In each profile, navigate to your hosted app URL.
4. Each profile will automatically be assigned an isolated Firebase Anonymous UID in its own `localStorage`.
5. Enter a nickname in each window, select the same Region (e.g. `Europe`), and press **"Find match"**.
6. Watch the queue counter increment from `1 / 10` up to `10 / 10`.
7. Once the 10th player queues, the first player initiates the atomic transaction, deletes the 10 queue docs, and creates the match.
8. All 10 windows will immediately transition to the live Match Screen via Firestore real-time listeners.
