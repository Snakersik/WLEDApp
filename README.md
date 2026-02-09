# 🎯 WLED Manager

Kompletna aplikacja mobilna do zarządzania urządzeniami WLED z auto-discovery, wielojęzycznością i harmonogramami.

## ⚡ Quick Start

```bash
# 1. MongoDB
docker compose up -d

# 2. Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # Edytuj SECRET_KEY!
uvicorn server:app --reload --host 0.0.0.0 --port 8001

# 3. Frontend (nowy terminal)
cd frontend
yarn install
cp .env.example .env  # Edytuj EXPO_PUBLIC_BACKEND_URL jeśli potrzeba
yarn start
```

## 📱 Features

- **Auto-Discovery**: mDNS network scan + WLED-AP setup wizard
- **Direct Control**: Telefon steruje WLED bezpośrednio (lokalna sieć)
- **Multilingual**: Polski (default), English, Deutsch
- **Device Management**: Add, control, group devices
- **Presets**: 10 effects (2 free, 8 premium)
- **Schedules**: Time-based automation (backend ready)
- **Subscription**: Free vs Premium tiers

## 🛠️ Tech Stack

- **Backend**: FastAPI + MongoDB + Motor
- **Frontend**: Expo + React Native + Expo Router
- **Discovery**: react-native-zeroconf (mDNS)
- **Auth**: JWT with bcrypt

## 📚 Documentation

Pełna dokumentacja w `LOCAL_SETUP_README.md`

Quick commands w `QUICK_START.md`

API Docs: http://localhost:8001/docs

## 🔗 URLs

- Backend API: http://localhost:8001
- API Docs: http://localhost:8001/docs
- Mongo Express: http://localhost:8081 (admin/admin123)
- Frontend Web: http://localhost:8000

## 🏗️ Architecture

```
Telefon → Backend (Cloud/Local) → MongoDB
   ↓
WLED Device (Direct, Local Network)
```

Frontend kontroluje WLED **bezpośrednio** w lokalnej sieci!

---

**Made with ❤️ for WLED enthusiasts**
