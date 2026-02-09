# 🎯 WLED Manager - Local Development Setup

Kompletna aplikacja do zarządzania urządzeniami WLED z auto-discovery, wielojęzycznością i harmonogramami.

## 📋 Wymagania

- **Node.js** 18+ ([pobierz](https://nodejs.org/))
- **Python** 3.11+ ([pobierz](https://www.python.org/))
- **Docker Desktop** ([pobierz](https://www.docker.com/products/docker-desktop/))
- **Yarn** (npm install -g yarn)

---

## 🚀 QUICK START (Windows)

### 1️⃣ Przygotowanie projektu

```powershell
# Przejdź do folderu projektu
cd wled-manager

# Skopiuj pliki .env
cp backend\.env.example backend\.env
cp frontend\.env.example frontend\.env
```

### 2️⃣ Uruchom MongoDB (Docker)

```powershell
# Uruchom MongoDB i Mongo Express
docker compose up -d

# Sprawdź status
docker compose ps

# MongoDB będzie dostępny na: localhost:27017
# Mongo Express (GUI): http://localhost:8081
# Login: admin / admin123
```

### 3️⃣ Backend (FastAPI)

```powershell
# Przejdź do folderu backend
cd backend

# Utwórz virtual environment
python -m venv venv

# Aktywuj venv
venv\Scripts\activate

# Zainstaluj zależności
pip install -r requirements.txt

# Uruchom backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001

# Backend będzie dostępny na: http://localhost:8001
# API Docs: http://localhost:8001/docs
```

### 4️⃣ Frontend (Expo)

```powershell
# Otwórz nowe okno terminala
cd frontend

# Zainstaluj zależności
yarn install

# Uruchom Expo Dev Server
yarn start

# Wybierz platformę:
# - Naciśnij 'w' dla web
# - Naciśnij 'a' dla Android emulator
# - Naciśnij 'i' dla iOS simulator
# - Zeskanuj QR w Expo Go na telefonie
```

---

## 📱 Testowanie na fizycznym telefonie

### Opcja A: Expo Go (Szybkie)

1. **Zainstaluj Expo Go** na telefonie:
   - [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - [iOS](https://apps.apple.com/app/expo-go/id982107779)

2. **Znajdź swój lokalny IP:**
   ```powershell
   ipconfig | findstr IPv4
   # Przykład: 192.168.1.105
   ```

3. **Zaktualizuj frontend/.env:**
   ```
   EXPO_PUBLIC_BACKEND_URL=http://192.168.1.105:8001
   ```

4. **Zrestartuj Expo** i zeskanuj QR code w Expo Go

### Opcja B: Development Build (Pełna funkcjonalność)

```powershell
# Android
cd frontend
yarn android

# iOS (tylko na macOS)
yarn ios
```

---

## 🗄️ Konfiguracja MongoDB

### Domyślna konfiguracja:
- **Host:** localhost
- **Port:** 27017
- **Database:** wled_database
- **Connection String:** `mongodb://localhost:27017`

### Kolekcje:
- `users` - Użytkownicy (email, hasło, subskrypcja)
- `devices` - Urządzenia WLED (nazwa, IP, LED count)
- `groups` - Grupy urządzeń
- `schedules` - Harmonogramy (backend ready)

### Mongo Express (GUI):
- **URL:** http://localhost:8081
- **Username:** admin
- **Password:** admin123

---

## 🔧 Konfiguracja Backend (.env)

```env
# backend/.env
MONGO_URL=mongodb://localhost:27017
DB_NAME=wled_database
SECRET_KEY=zmień-to-na-losowy-32-znakowy-string-w-produkcji
HOST=0.0.0.0
PORT=8001
```

**⚠️ WAŻNE:** Zmień `SECRET_KEY` na produkcji!

Generuj bezpieczny klucz:
```python
import secrets
print(secrets.token_urlsafe(32))
```

---

## 🔧 Konfiguracja Frontend (.env)

### Dla Web/iOS Simulator:
```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

### Dla Android Emulator:
```env
EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:8001
```

### Dla fizycznego telefonu (Expo Go):
```env
# Zamień na swój lokalny IP
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.XXX:8001
```

**Jak znaleźć swój IP:**
- Windows: `ipconfig | findstr IPv4`
- Mac/Linux: `ifconfig | grep inet`

---

## 📦 Struktura Projektu

```
wled-manager/
├── backend/                 # FastAPI Backend
│   ├── server.py           # Main API
│   ├── requirements.txt    # Python dependencies
│   └── .env               # Configuration
├── frontend/               # Expo Frontend
│   ├── app/               # Expo Router screens
│   │   ├── (auth)/       # Login/Register
│   │   ├── (tabs)/       # Main tabs
│   │   ├── (device)/     # Device control
│   │   └── (group)/      # Group control
│   ├── src/
│   │   ├── context/      # Auth & Language
│   │   ├── i18n/         # Translations
│   │   └── services/     # WLED & Discovery
│   ├── package.json
│   └── .env
├── docker-compose.yml      # MongoDB setup
└── LOCAL_SETUP_README.md   # Ten plik
```

---

## 🎨 Funkcje Aplikacji

### ✅ Zaimplementowane:
- **Authentication:** JWT (email/password)
- **Wielojęzyczność:** Polski (domyślny), Angielski, Niemiecki
- **Auto-Discovery:**
  - mDNS Network Scan (znajdź WLED w sieci)
  - WLED-AP Setup Wizard (konfiguracja nowych urządzeń)
  - Manual IP input (backup)
- **Kontrola urządzeń:**
  - On/Off
  - Brightness (0-255)
  - 9 predefiniowanych kolorów
  - 10 presetów (2 darmowe, 8 premium)
- **Grupy:** Steruj wieloma urządzeniami naraz
- **Subskrypcja:** Free vs Premium (mock)
- **Harmonogramy:** Backend API gotowy, frontend w rozwoju

### 🚧 W rozwoju:
- Schedule Creator UI (time pickers, day selector)
- Schedule execution (background task)

---

## 🧪 Testowanie

### Backend API Test:
```powershell
# Test health endpoint
curl http://localhost:8001/api/presets

# Register user
curl -X POST http://localhost:8001/api/auth/register `
  -H "Content-Type: application/json" `
  -d '{"email":"test@test.pl","password":"test123","name":"Test"}'
```

### API Documentation:
Otwórz: http://localhost:8001/docs

---

## 🛠️ Development Commands

### Backend:
```powershell
# Development mode (auto-reload)
uvicorn server:app --reload --host 0.0.0.0 --port 8001

# Production mode
uvicorn server:app --host 0.0.0.0 --port 8001
```

### Frontend:
```powershell
# Start dev server
yarn start

# Clear cache
yarn start -c

# Android
yarn android

# iOS (macOS only)
yarn ios

# Web
yarn web
```

### Docker:
```powershell
# Start services
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f

# Reset database (WARNING: deletes all data)
docker compose down -v
docker compose up -d
```

---

## 🔍 Troubleshooting

### Problem: Backend nie łączy się z MongoDB
**Rozwiązanie:**
```powershell
# Sprawdź czy MongoDB działa
docker compose ps

# Sprawdź logi MongoDB
docker compose logs mongodb

# Restart MongoDB
docker compose restart mongodb
```

### Problem: Frontend nie łączy się z backendem
**Rozwiązanie:**
1. Sprawdź czy backend działa: http://localhost:8001/docs
2. Sprawdź `EXPO_PUBLIC_BACKEND_URL` w `frontend/.env`
3. Dla fizycznego telefonu - użyj lokalnego IP, nie localhost

### Problem: mDNS nie znajduje WLED
**Rozwiązanie:**
1. Upewnij się że telefon i WLED są w tej samej sieci WiFi
2. Sprawdź czy WLED odpowiada: http://[WLED-IP]/json/info
3. Spróbuj trybu ręcznego jako backup

### Problem: WLED-AP Setup nie działa
**Rozwiązanie:**
1. Upewnij się że jesteś połączony z WLED-AP (4.3.2.1)
2. Sprawdź w przeglądarce: http://4.3.2.1
3. Odłącz inne sieci WiFi

---

## 📚 Dokumentacja API

Pełna dokumentacja API dostępna po uruchomieniu backendu:
- **Swagger UI:** http://localhost:8001/docs
- **ReDoc:** http://localhost:8001/redoc

### Główne endpointy:

**Auth:**
- POST `/api/auth/register` - Rejestracja
- POST `/api/auth/login` - Logowanie
- GET `/api/auth/me` - Aktualny użytkownik
- POST `/api/auth/upgrade-subscription` - Upgrade (mock)

**Devices:**
- GET `/api/devices` - Lista urządzeń
- POST `/api/devices` - Dodaj urządzenie
- GET `/api/devices/{id}` - Szczegóły urządzenia
- DELETE `/api/devices/{id}` - Usuń urządzenie
- POST `/api/devices/{id}/control` - Kontroluj urządzenie (nieużywane - kontrola z frontendu)

**Groups:**
- GET `/api/groups` - Lista grup
- POST `/api/groups` - Utwórz grupę
- PUT `/api/groups/{id}` - Aktualizuj grupę
- DELETE `/api/groups/{id}` - Usuń grupę
- POST `/api/groups/{id}/control` - Kontroluj grupę (nieużywane)

**Presets:**
- GET `/api/presets` - Lista presetów

**Schedules:**
- GET `/api/schedules` - Lista harmonogramów
- POST `/api/schedules` - Utwórz harmonogram
- PUT `/api/schedules/{id}` - Aktualizuj
- DELETE `/api/schedules/{id}` - Usuń
- POST `/api/schedules/{id}/toggle` - Włącz/Wyłącz

---

## 🎨 Technologie

### Backend:
- **FastAPI** - Modern Python web framework
- **Motor** - Async MongoDB driver
- **PyJWT** - JWT authentication
- **Passlib** - Password hashing (bcrypt)
- **httpx** - Async HTTP client (dla WLED communication w testach)

### Frontend:
- **Expo** - React Native framework
- **Expo Router** - File-based routing
- **React Native** - Mobile UI
- **Axios** - HTTP client
- **AsyncStorage** - Local storage
- **Zustand** - State management (jeśli używane)
- **react-native-zeroconf** - mDNS discovery
- **@react-native-community/slider** - Brightness control
- **expo-camera** - QR scanning (opcjonalnie)

### Database:
- **MongoDB 7.0** - NoSQL database
- **Mongo Express** - Web GUI

---

## 🌐 Architektura

```
┌─────────────────────────────────────────────┐
│              Telefon (App)                  │
│  ┌────────────────────────────────────┐    │
│  │  Frontend (Expo/React Native)      │    │
│  └────────────────────────────────────┘    │
│           │                   │             │
│           │ Auth/Data         │ Direct      │
│           ▼                   ▼             │
│  ┌─────────────────┐   ┌──────────────┐   │
│  │  Backend API    │   │  WLED Device │   │
│  │  (Cloud/Local)  │   │  (Local LAN) │   │
│  └─────────────────┘   └──────────────┘   │
│           │                                 │
│           ▼                                 │
│  ┌─────────────────┐                       │
│  │  MongoDB        │                       │
│  └─────────────────┘                       │
└─────────────────────────────────────────────┘
```

**Kluczowa architektura:**
- Frontend → Backend: Zarządzanie użytkownikami, lista urządzeń
- Frontend → WLED: **Bezpośrednia kontrola** (telefon w tej samej sieci)

---

## 📝 Konfiguracja dla różnych środowisk

### Windows (PowerShell):
```powershell
# Znajdź swój IP
ipconfig | findstr IPv4

# Przykład: 192.168.1.105
# Zaktualizuj frontend/.env:
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.105:8001
```

### Mac/Linux:
```bash
# Znajdź swój IP
ifconfig | grep inet

# Lub
ip addr show
```

### Android Emulator:
- Backend na host: użyj `10.0.2.2:8001`
- WLED: Emulator nie ma dostępu do lokalnej sieci (użyj fizycznego telefonu)

### iOS Simulator:
- Backend: użyj `localhost:8001`
- WLED: Simulator nie ma dostępu do lokalnej sieci (użyj fizycznego telefonu)

---

## 🎯 Konfiguracja WLED

### Pierwszy raz (nowy WLED):
1. Włącz WLED → startuje jako **WLED-AP**
2. W aplikacji: Dodaj urządzenie → Tryb konfiguracji
3. Połącz telefon z WLED-AP w ustawieniach WiFi
4. Wróć do app → wpisz dane swojej WiFi
5. WLED restartuje się i łączy z WiFi
6. App automatycznie znajdzie urządzenie!

### WLED już w sieci:
1. W aplikacji: Dodaj urządzenie → Skanuj sieć
2. Po kilku sekundach zobaczysz listę
3. Kliknij urządzenie → gotowe!

### Backup - manual:
1. W aplikacji: Dodaj urządzenie → Wpisz IP ręcznie
2. Podaj IP (znajdź w routerze lub WLED web interface)

---

## 🌍 Wielojęzyczność

Aplikacja wspiera 3 języki:
- 🇵🇱 **Polski** (domyślny)
- 🇬🇧 Angielski
- 🇩🇪 Niemiecki

Zmiana języka: Profil → Język → Wybierz

---

## 📊 Presety WLED

### Darmowe (Free):
1. **Solid Color** - Jednolity kolor
2. **Blink** - Miganie

### Premium (PRO):
3. **Rainbow** - Tęcza
4. **Fire Flicker** - Ogień
5. **Theater Chase** - Theater chase
6. **Scanner** - Skaner KITT
7. **Twinkle** - Migotanie gwiazd
8. **Plasma** - Plazma
9. **Ripple** - Fale
10. **Breathing** - Oddychanie

Upgrade w Profilu aby odblokować wszystkie!

---

## 🐛 Debug Mode

### Backend logs:
```powershell
# Backend pokazuje logi w konsoli
# Sprawdź czy MongoDB się połączyło
# Sprawdź czy endpointy odpowiadają
```

### Frontend logs:
```powershell
# Metro bundler pokazuje błędy
# Sprawdź Console w Expo DevTools
# Chrome DevTools dla web: Ctrl+Shift+I
```

### MongoDB logs:
```powershell
docker compose logs mongodb
```

---

## 🔄 Update Dependencies

### Backend:
```powershell
cd backend
pip install --upgrade -r requirements.txt
pip freeze > requirements.txt
```

### Frontend:
```powershell
cd frontend
yarn upgrade-interactive
# lub
yarn add <package>@latest
```

---

## 🚀 Deployment (Produkcja)

### Backend:
1. Zmień `SECRET_KEY` w .env
2. Użyj zewnętrznej MongoDB (MongoDB Atlas)
3. Deploy na: Heroku, Railway, DigitalOcean, AWS

### Frontend:
1. Build production:
   ```
   eas build --platform android
   eas build --platform ios
   ```
2. Submit do store:
   ```
   eas submit --platform android
   eas submit --platform ios
   ```

### MongoDB Production:
- **MongoDB Atlas** (darmowy tier): https://www.mongodb.com/cloud/atlas
- Zaktualizuj `MONGO_URL` w backend/.env

---

## 💡 Tips & Tricks

### Szybki restart:
```powershell
# Backend
# Ctrl+C i uruchom ponownie

# Frontend
# Naciśnij 'r' w Expo DevTools
```

### Clear cache:
```powershell
# Frontend
yarn start -c

# Backend
find . -type d -name __pycache__ -exec rm -rf {} +
```

### Reset database:
```powershell
docker compose down -v
docker compose up -d
```

---

## 📞 Support

Pytania? Problemy?
- Sprawdź sekcję Troubleshooting powyżej
- Sprawdź logi: backend console, Metro bundler, Docker logs
- Sprawdź API docs: http://localhost:8001/docs

---

## 📄 Licencja

MIT License - użyj jak chcesz!

---

**Enjoy your WLED Manager! 💡✨**
