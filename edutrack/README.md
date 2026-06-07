# 📚 EduTrack — School Management System
### Full Stack: Backend API + Web App + Android & iOS

---

## 📁 Project Structure

```
edutrack/
├── backend/
│   ├── server.js          ← Node.js REST API (Express + SQLite)
│   └── package.json
├── frontend/
│   └── index.html         ← Full web app (Admin, Teacher, Student, Parent)
├── android-guide/
│   └── README.md          ← Android conversion steps
├── ios-guide/
│   └── README.md          ← iOS conversion steps
└── README.md              ← This file
```

---

## 🚀 Backend Setup (Run Locally in 3 Minutes)

### Prerequisites
- Node.js 18+ (https://nodejs.org)

### Steps
```bash
cd backend
npm install
node server.js
```

Server starts at: **http://localhost:3001**

### Default Login Credentials
| Role    | Email                              | Password    |
|---------|------------------------------------|-------------|
| Admin   | admin@edutrack.com                 | admin123    |
| Teacher | math@edutrack.com                  | teacher123  |
| Student | alex.lee@student.edutrack.com      | student123  |

---

## 🔌 REST API Reference

### Authentication
| Method | Endpoint              | Description         |
|--------|-----------------------|---------------------|
| POST   | /api/auth/login       | Login → get JWT     |
| GET    | /api/auth/me          | Get current user    |
| POST   | /api/auth/change-password | Change password |

**Login example:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@edutrack.com","password":"admin123"}'
```

All subsequent requests require: `Authorization: Bearer <token>`

---

### Users (Admin Only for Write)
| Method | Endpoint                    | Description               |
|--------|-----------------------------|---------------------------|
| GET    | /api/users?role=student     | List users (filter by role)|
| GET    | /api/users/:id              | Get single user           |
| POST   | /api/users                  | Create user (admin)       |
| PUT    | /api/users/:id              | Update user               |
| DELETE | /api/users/:id              | Deactivate user (admin)   |
| DELETE | /api/users/:id/permanent    | Hard delete (admin)       |

**Create Student:**
```bash
curl -X POST http://localhost:3001/api/users \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "email": "john.smith@student.edu",
    "password": "pass123",
    "role": "student",
    "phone": "555-0199"
  }'
```

---

### Classes (Admin)
| Method | Endpoint                           | Description              |
|--------|------------------------------------|--------------------------|
| GET    | /api/classes                       | All classes              |
| GET    | /api/classes/:id                   | Class + student list     |
| POST   | /api/classes                       | Create class             |
| PUT    | /api/classes/:id                   | Update class             |
| DELETE | /api/classes/:id                   | Deactivate class         |
| POST   | /api/classes/:id/enroll            | Enroll student           |
| DELETE | /api/classes/:id/enroll/:studentId | Remove student           |

---

### Attendance (Teacher/Admin)
| Method | Endpoint                          | Description           |
|--------|-----------------------------------|-----------------------|
| GET    | /api/attendance?class_id=&date=   | Get attendance        |
| POST   | /api/attendance                   | Save attendance batch |
| GET    | /api/attendance/summary/:studentId| Student summary       |

**Save Attendance:**
```bash
curl -X POST http://localhost:3001/api/attendance \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "class_id": 1,
    "date": "2026-06-07",
    "records": [
      {"student_id": 1, "status": "present"},
      {"student_id": 2, "status": "absent", "note": "Sick leave"},
      {"student_id": 3, "status": "late"}
    ]
  }'
```

---

### Assignments & Grades
| Method | Endpoint                  | Description           |
|--------|---------------------------|-----------------------|
| GET    | /api/assignments          | List assignments      |
| POST   | /api/assignments          | Create assignment     |
| PUT    | /api/assignments/:id      | Update assignment     |
| GET    | /api/grades               | List grades           |
| POST   | /api/grades               | Grade a submission    |
| POST   | /api/grades/bulk          | Bulk grade            |
| GET    | /api/grades/gpa/:studentId| Get student GPA       |

---

### Messages & Announcements
| Method | Endpoint                  | Description        |
|--------|---------------------------|--------------------|
| GET    | /api/messages             | Get inbox          |
| POST   | /api/messages             | Send message       |
| PUT    | /api/messages/:id/read    | Mark as read       |
| GET    | /api/announcements        | Get announcements  |
| POST   | /api/announcements        | Post announcement  |

---

### Analytics (Admin)
| Method | Endpoint                   | Description         |
|--------|----------------------------|---------------------|
| GET    | /api/analytics/overview    | School-wide stats   |

---

## 📱 ANDROID APP (React Native / Capacitor)

### Option A: Capacitor (Easiest — wrap existing web app)
```bash
npm install -g @capacitor/cli
npm install @capacitor/core @capacitor/android

# Initialize
npx cap init EduTrack com.edutrack.app

# Add Android
npx cap add android

# Copy web app
cp frontend/index.html www/index.html
npx cap copy android

# Open in Android Studio
npx cap open android
```

Then in Android Studio:
1. Connect Android device or start emulator
2. Click **Run ▶**
3. App builds and installs as a native APK

**To generate APK:**
`Build → Generate Signed Bundle/APK → APK → Release`

---

### Option B: React Native (Full Native)
```bash
npx react-native init EduTrackApp --template react-native-template-typescript
cd EduTrackApp
npm install @react-navigation/native axios @react-native-async-storage/async-storage

# Run on Android
npx react-native run-android
```

Key files to create:
- `src/api/client.ts` → Axios instance pointing to `http://10.0.2.2:3001` (Android emulator localhost)
- `src/screens/LoginScreen.tsx`
- `src/screens/DashboardScreen.tsx`
- `src/navigation/AppNavigator.tsx`

---

## 🍎 iOS APP (Capacitor / React Native)

### Option A: Capacitor (Same as Android)
```bash
npx cap add ios
npx cap copy ios
npx cap open ios   # Opens Xcode
```

In Xcode:
1. Select your iPhone simulator or device
2. Click **Run ▶**
3. **Requires macOS + Xcode 15+**

**App Store submission:**
`Product → Archive → Distribute App → App Store Connect`

---

### Option B: React Native iOS
```bash
cd ios && pod install && cd ..
npx react-native run-ios
```

For API calls use `http://localhost:3001` (iOS simulator) or your machine's IP for real device.

---

## ☁️ Deploy Backend (Production)

### Railway (Free tier)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Render
1. Push to GitHub
2. New Web Service → Connect repo
3. Build: `npm install` → Start: `node server.js`

### Environment Variables
```
PORT=3001
JWT_SECRET=your_very_long_random_secret_here
NODE_ENV=production
```

---

## 🛡️ Security Notes

- Change `JWT_SECRET` before going to production
- Use HTTPS in production (SSL cert via Let's Encrypt)
- Consider rate limiting: `npm install express-rate-limit`
- Add input validation: `npm install joi`
- For production DB, consider PostgreSQL instead of SQLite

---

## 📊 Database Schema

```
users ─────────────────── id, name, email, password, role, phone, is_active
classes ───────────────── id, name, subject, grade, teacher_id, room, schedule
class_enrollments ─────── class_id, student_id
attendance ────────────── class_id, student_id, date, status, note
assignments ───────────── class_id, title, type, max_score, due_date
grades ─────────────────── assignment_id, student_id, score, feedback
messages ───────────────── sender_id, recipient_id, subject, body, is_read
announcements ─────────── title, body, target_role, created_by
parent_student ─────────── parent_id, student_id
```

---

## 🏗️ Tech Stack

| Layer     | Technology              |
|-----------|-------------------------|
| Backend   | Node.js + Express       |
| Database  | SQLite (via better-sqlite3) |
| Auth      | JWT + bcryptjs          |
| Web App   | Vanilla HTML/CSS/JS     |
| Android   | Capacitor or React Native |
| iOS       | Capacitor or React Native |
| Hosting   | Railway / Render / Heroku |
