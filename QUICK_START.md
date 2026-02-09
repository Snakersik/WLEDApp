# WLED MANAGER - QUICK START GUIDE

## 🚀 Windows Quick Start (Copy-Paste Commands)

### 1️⃣ Skopiuj projekt do lokalnego folderu
```powershell
# Utwórz folder projektu
mkdir wled-manager
cd wled-manager
```

### 2️⃣ Pobierz projekt z Emergent
- Użyj przycisku "Save to GitHub" w Emergent
- LUB kliknij "View in VS Code" aby skopiować pliki
- LUB użyj eksportu zip (jeśli dostępny)

### 3️⃣ Przygotuj środowisko

```powershell
# Skopiuj pliki .env z przykładów
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env

# EDYTUJ backend\.env - zmień SECRET_KEY na losowy string (min 32 znaki)!
```

### 4️⃣ Uruchom MongoDB

```powershell
# Upewnij się że Docker Desktop jest uruchomiony!

# Uruchom MongoDB i Mongo Express
docker compose up -d

# Sprawdź status (powinno być "running")
docker compose ps

# Mongo Express dostępny na: http://localhost:8081 (admin/admin123)
```

### 5️⃣ Backend (FastAPI)

```powershell
# Otwórz nowy terminal PowerShell

cd backend

# Utwórz virtual environment
python -m venv venv

# Aktywuj venv
.\venv\Scripts\activate

# Zainstaluj dependencies
pip install -r requirements.txt

# Uruchom backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001

# ✅ Backend dostępny: http://localhost:8001/docs
```

### 6️⃣ Frontend (Expo)

```powershell
# Otwórz KOLEJNY nowy terminal PowerShell

cd frontend

# Zainstaluj dependencies (pierwsze uruchomienie - może trwać 5-10 min)
yarn install

# Uruchom Expo
yarn start

# Po uruchomieniu:
# - Naciśnij 'w' dla web preview
# - Zeskanuj QR code w Expo Go na telefonie
# - Naciśnij 'a' dla Android emulator
# - Naciśnij 'i' dla iOS simulator
```

---

## 📱 Dla fizycznego telefonu (WAŻNE!)

### Krok 1: Znajdź swój lokalny IP

```powershell
# Windows
ipconfig

# Szukaj "IPv4 Address" dla WiFi adapter
# Przykład: 192.168.1.105
```

### Krok 2: Zaktualizuj frontend/.env

```env
# Zmień localhost na swój IP
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.105:8001
```

### Krok 3: Zrestartuj Expo

```powershell
# W terminalu Expo naciśnij 'r' (restart)
# LUB zatrzymaj (Ctrl+C) i uruchom ponownie
yarn start
```

### Krok 4: Zeskanuj QR w Expo Go

- Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
- iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)

---

## ✅ Sprawdzenie czy działa

### Backend:
```powershell
# Test API
curl http://localhost:8001/api/presets

# Powinno zwrócić listę presetów w JSON
```

### Frontend:
- Otwórz http://localhost:8000 w przeglądarce
- LUB zeskanuj QR w Expo Go
- Powinieneś zobaczyć ekran logowania w języku polskim

### MongoDB:
- Otwórz http://localhost:8081
- Login: admin / admin123
- Sprawdź czy baza "wled_database" istnieje

---

## 🔧 Typowe Problemy

### "ModuleNotFoundError" w backendsie
```powershell
# Upewnij się że venv jest aktywowany
.\venv\Scripts\activate

# Zainstaluj ponownie
pip install -r requirements.txt
```

### "Cannot connect to MongoDB"
```powershell
# Sprawdź czy Docker działa
docker compose ps

# Restart MongoDB
docker compose restart mongodb
```

### "Network request failed" w aplikacji
```powershell
# Dla fizycznego telefonu:
# 1. Znajdź swój IP: ipconfig
# 2. Zaktualizuj frontend/.env
# 3. Telefon i komputer MUSZĄ być w tej samej WiFi!
```

### Expo nie startuje
```powershell
# Wyczyść cache
yarn start -c

# LUB usuń .expo folder
rmdir /s .expo
yarn start
```

---

## 📦 Backup - Export wszystkich plików ręcznie

Jeśli nie możesz użyć GitHub, skopiuj te pliki ręcznie:

### Backend (3 pliki):
1. `/backend/server.py` - Główny API
2. `/backend/requirements.txt` - Zależności Python
3. `/backend/.env` - Konfiguracja (stwórz z .env.example)

### Frontend (14 kluczowych plików):
1. `/frontend/package.json` - Zależności Node
2. `/frontend/app.json` - Konfiguracja Expo
3. `/frontend/tsconfig.json` - TypeScript config
4. `/frontend/metro.config.js` - Metro bundler
5. `/frontend/.env` - Konfiguracja (stwórz z .env.example)

**Screens:** (w folderze /frontend/app/)
6. `index.tsx`
7. `_layout.tsx`
8. `(auth)/login.tsx`
9. `(auth)/register.tsx`
10. `(tabs)/_layout.tsx`
11. `(tabs)/devices.tsx`
12. `(tabs)/groups.tsx`
13. `(tabs)/presets.tsx`
14. `(tabs)/profile.tsx`
15. `(tabs)/schedules.tsx`
16. `(device)/[id].tsx`
17. `(group)/[id].tsx`

**Context/Services:** (w folderze /frontend/src/)
18. `context/AuthContext.tsx`
19. `context/LanguageContext.tsx`
20. `i18n/translations.ts`
21. `services/wledService.ts`
22. `services/discoveryService.ts`

### Root (3 pliki):
23. `docker-compose.yml` - MongoDB setup
24. `LOCAL_SETUP_README.md` - Instrukcje
25. `.gitignore` (opcjonalnie)

---

## 🎯 Po skopiowaniu wszystkich plików:

```powershell
# 1. MongoDB
docker compose up -d

# 2. Backend (nowy terminal)
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8001

# 3. Frontend (nowy terminal)
cd frontend
yarn install
yarn start

# ✅ Gotowe!
```

---

## 🌟 Funkcje Aplikacji

- ✅ Auto-Discovery WLED (mDNS + AP Setup)
- ✅ Bezpośrednia kontrola z telefonu
- ✅ Wielojęzyczność (PL/EN/DE)
- ✅ Grupy urządzeń
- ✅ 10 presetów (2 free, 8 premium)
- ✅ System subskrypcji
- ✅ Harmonogramy (backend ready)
- ✅ Dark theme UI

**Miłego kodowania! 🚀**
